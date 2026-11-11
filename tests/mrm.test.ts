import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, alternatives, buildModel, discrimination, drift, fairness, psi, psiBand, recommendedAlternative, summarize, dirStatus } from '../src/lib/mrm/engine.ts';
import { canonical, seal, sha256, verifyChain, type Block } from '../src/lib/mrm/chain.ts';
import { Envelope, PRD_SAMPLE, assess, can, payloadFor } from '../src/lib/mrm/contract.ts';
import { extraction, filterOutput, perturbation, runPromptCorpus, screenPrompt } from '../src/lib/mrm/threats.ts';
import { binderMarkdown, buildBinder } from '../src/lib/mrm/binder.ts';

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
const model = (id: string) => buildModel(MODELS.find((m) => m.id === id)!);

test('KS, AUC and Gini on a hand-checkable sample', () => {
  // scores ascending; bads at the bottom except one inversion
  const score = [1, 2, 3, 4, 5, 6];
  const bad = [1, 1, 0, 1, 0, 0];
  const d = discrimination(score, bad, Int32Array.from([0, 1, 2, 3, 4, 5]));
  assert.ok(close(d.auc, 8 / 9)); // 8 of 9 (bad, good) pairs are ordered correctly
  assert.ok(close(d.gini, 2 * (8 / 9) - 1));
  assert.ok(close(d.ks, 2 / 3)); // after score 2: 2/3 of bads, 0 of goods
  const perfect = discrimination([1, 2, 3, 4], [1, 1, 0, 0], Int32Array.from([0, 1, 2, 3]));
  assert.equal(perfect.auc, 1);
  assert.equal(perfect.ks, 1);
});

test('PRD 3.2: PSI formula and action bands', () => {
  assert.equal(psi([0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25]), 0);
  const v = psi([0.5, 0.5], [0.6, 0.4]);
  assert.ok(close(v, 0.1 * Math.log(0.6 / 0.5) + -0.1 * Math.log(0.4 / 0.5)));
  assert.equal(psiBand(0.0999), 'stable');
  assert.equal(psiBand(0.1), 'moderate');
  assert.equal(psiBand(0.25), 'moderate');
  assert.equal(psiBand(0.2501), 'significant');
});

test('PRD 3.1: disparate impact ratio and the four-fifths flag', () => {
  assert.equal(dirStatus(0.846), 'WATCH');
  assert.equal(dirStatus(0.799), 'ADVERSE_IMPACT_FLAG');
  assert.equal(dirStatus(0.95), 'COMPLIANT_PASS');
  const f = fairness(model('mdl_credit_scorecard_v4'));
  for (const g of f.groups) assert.ok(close(g.dir, g.protectedApproval / g.controlApproval));
  // driver shares of the adverse gap sum to 1 and the gap decomposition is exact
  const w = f.worst;
  assert.ok(close(w.drivers.reduce((a, d) => a + d.share, 0), 1, 1e-9));
  assert.ok(close(w.drivers.reduce((a, d) => a + d.gapPoints, 0), w.scoreGap, 1e-9));
});

test('the engine is deterministic and the three sandbox models tell three stories', () => {
  const a = summarize(model('mdl_credit_scorecard_v4'));
  const b = summarize(model('mdl_card_origination_v2'));
  const c = summarize(model('mdl_auto_loan_v3'));
  assert.equal(a.fairLending, 'fail');
  assert.ok(a.minDir < 0.8);
  assert.equal(b.overall, 'pass');
  assert.equal(c.stability, 'fail');
  assert.ok(c.psi > 0.25);
  for (const s of [a, b, c]) {
    assert.ok(s.ks > 0.3 && s.ks < 0.6, `KS ${s.ks}`);
    assert.ok(close(s.gini, 2 * s.auc - 1));
  }
  assert.deepEqual(summarize(model('mdl_credit_scorecard_v4')), a);
});

test('scorecard: points sum to the score and the scale follows PDO', () => {
  const m = model('mdl_card_origination_v2');
  for (const i of [0, 17, 4242, 9999]) assert.equal(m.scored.pts.reduce((s, col) => s + col[i], 0), m.scored.score[i]);
  assert.ok(close(m.card.factor, 20 / Math.LN2));
  assert.ok(close(m.card.offset, 600 - m.card.factor * Math.log(30)));
  assert.ok(close(m.shap.reduce((a, s) => a + s.share, 0), 1, 1e-9));
});

test('less discriminatory alternative: dropping the proxy restores the four-fifths ratio cheaply', () => {
  const alts = alternatives(model('mdl_credit_scorecard_v4'));
  const rec = recommendedAlternative(alts)!;
  assert.equal(rec.dropped, 'geo_risk_index');
  assert.ok(rec.minDir >= 0.8 && alts[0].minDir < 0.8);
  assert.ok(rec.ksDelta > -0.02);
});

test('drift grows with severity and is zero-ish with none', () => {
  const m = model('mdl_card_origination_v2');
  assert.ok(drift(m, 0).psi < 0.02);
  assert.ok(drift(m, 1.5).psi > drift(m, 0.5).psi);
  assert.equal(drift(m, 0).expected.length, drift(m, 0).actual.length);
});

test('PRD 3.4: hash chain seals, verifies, and pinpoints tampering', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  const chain: Block[] = [];
  for (let i = 0; i < 5; i++) chain.push(await seal(chain[i - 1] ?? null, { actor: 'a', role: 'r', event: i ? 'PAYLOAD_INGESTED' : 'GENESIS', model_id: 'm', detail: { i } }, `2026-01-0${i + 1}T00:00:00.000Z`));
  assert.equal((await verifyChain(chain)).ok, true);
  const edited = chain.map((b) => (b.index === 2 ? { ...b, detail: { i: 99 } } : b));
  const v = await verifyChain(edited);
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 2);
  assert.deepEqual(v.blocks.map((b) => b.ok), [true, true, false, false, false]);
  // re-hashing the edited block still breaks the link from the next one
  const resealed = await seal(chain[1], { actor: 'a', role: 'r', event: 'PAYLOAD_INGESTED', model_id: 'm', detail: { i: 99 } }, chain[2].ts);
  const v2 = await verifyChain(chain.map((b) => (b.index === 2 ? resealed : b)));
  assert.equal(v2.brokenAt, 3);
});

test('PRD 1.2: the contract accepts the PRD payload and rejects malformed ones', () => {
  const ok = Envelope.safeParse(PRD_SAMPLE);
  assert.equal(ok.success, true);
  const checks = assess(ok.data!);
  assert.equal(checks.find((c) => c.id === 'gini')!.status, 'pass'); // 0.642 = 2 x 0.821 - 1
  assert.equal(checks.find((c) => c.id === 'dir:age_over_62')!.value, '0.846');
  assert.equal(Envelope.safeParse({ model_metadata: {} }).success, false);
  const bad = structuredClone(PRD_SAMPLE);
  bad.input_payload.statistical_metrics.ks_statistic = 1.4;
  assert.equal(Envelope.safeParse(bad).success, false);
  // the engine's own export round-trips through the contract
  assert.equal(Envelope.safeParse(payloadFor(model('mdl_auto_loan_v3'))).success, true);
});

test('PRD 3.4: role entitlements', () => {
  assert.equal(can('Model_Developer', 'model:ingest'), true);
  assert.equal(can('Model_Developer', 'validation:signoff'), false);
  assert.equal(can('Independent_Validator', 'validation:signoff'), true);
  assert.equal(can('Independent_Validator', 'model:ingest'), false);
  assert.equal(can('Executive_Auditor', 'model:ingest'), false);
  assert.equal(can('Executive_Auditor', 'ledger:read'), true);
});

test('PRD 3.3: guardrails', () => {
  const c = runPromptCorpus();
  assert.equal(c.attacksBlocked, c.attacks);
  assert.equal(c.benignAllowed, c.benign);
  assert.equal(screenPrompt('What is the PSI for the auto book this month?').verdict, 'ALLOW');
  assert.equal(filterOutput('SSN 123-45-6789').text, 'SSN [REDACTED SSN]');
  const m = model('mdl_credit_scorecard_v4');
  const p = perturbation(m);
  assert.equal(p.rows[0].flipRate, 0); // no padding, no bypass
  for (const r of p.rows) assert.ok(r.afterBoth <= r.afterMahalanobis && r.afterMahalanobis <= r.flipRate);
  assert.ok(p.rows.at(-1)!.afterBoth < 0.01); // large padding is caught by income verification
  assert.ok(perturbation(m, m.cutoff, 0.05).headline.guarded < p.headline.guarded); // tighter tolerance, less residual
  const e = extraction(m);
  assert.ok(e.atLimit.guarded < e.atLimit.open);
  assert.ok(e.unlimited.open > 0.85);
});

test('binder: six sections, deterministic, mapped to the regulations', () => {
  const b = buildBinder(model('mdl_credit_scorecard_v4'));
  assert.deepEqual(b.sections.map((s) => s.number), ['1', '2', '3', '4', '5', '6']);
  assert.equal(b.overall, 'fail');
  assert.ok(b.sections.every((s) => s.mapping.length > 0));
  const md = binderMarkdown(b, { generatedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(md, binderMarkdown(buildBinder(model('mdl_credit_scorecard_v4')), { generatedAt: '2026-01-01T00:00:00.000Z' }));
  assert.match(md, /SR 11-7/);
  assert.match(md, /Less discriminatory alternative identified/);
});
