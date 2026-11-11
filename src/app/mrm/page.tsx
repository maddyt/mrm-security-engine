'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Help, Kpi, PageHead, Panel, RAG, RagPill, btnGhost, btnPrimary, shortHash } from '@/components/mrm/kit';
import { useMrm } from '@/components/mrm/state';
import { payloadFor } from '@/lib/mrm/contract';
import { MODELS, PROD_N, alternatives, buildModel, drift, fairness, recommendedAlternative, summarize, type Rag } from '@/lib/mrm/engine';
import { DEMO_SCRIPT } from '@/lib/mrm/help';
import { extraction, perturbation, runPromptCorpus } from '@/lib/mrm/threats';

type StageState = { status: 'idle' | 'running' | 'done' | 'error'; ms?: number; lines?: string[]; error?: string };
const STAGES = [
  { n: 1, title: 'Ingest pipeline', steps: ['REST / JSON ingest', 'Schema validation', 'Cryptographic hash'] },
  { n: 2, title: 'Fair lending & XAI engine', steps: ['DIR calculation', 'Marginal SHAP decomposition', 'Alternative search'] },
  { n: 3, title: 'Threat & stability check', steps: ['PSI / CSI drift', 'Adversarial perturbation', 'OWASP LLM guardrails'] },
  { n: 4, title: 'Binder exporter', steps: ['SR 11-7 sections', 'Binder hash', 'Immutable audit log'] },
];
const idle: StageState[] = STAGES.map(() => ({ status: 'idle' }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

export default function Overview() {
  const { model, modelId, setModelId, api, role } = useMrm();
  const all = useMemo(() => MODELS.map((s) => ({ spec: s, sum: summarize(buildModel(s)) })), []);
  const sum = all.find((a) => a.spec.id === modelId)!.sum;
  const [stages, setStages] = useState<StageState[]>(idle);
  const [total, setTotal] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [ranFor, setRanFor] = useState('');

  const run = async () => {
    setRunning(true);
    setTotal(null);
    setRanFor(modelId);
    const st: StageState[] = STAGES.map(() => ({ status: 'idle' }));
    const set = (i: number, s: StageState) => {
      st[i] = s;
      setStages([...st]);
    };
    const t0 = performance.now();
    // Each stage does its real work; a short floor keeps the animation readable.
    const stage = async (i: number, work: () => Promise<string[]> | string[]) => {
      set(i, { status: 'running' });
      const t = performance.now();
      try {
        const [lines] = await Promise.all([work(), wait(450)]);
        set(i, { status: 'done', ms: performance.now() - t, lines });
        return true;
      } catch (e) {
        set(i, { status: 'error', ms: performance.now() - t, error: e instanceof Error ? e.message : 'Failed' });
        return false;
      }
    };
    const payload = payloadFor(model);
    const ok =
      (await stage(0, async () => {
        const r = await api('/api/v1/mrm/ingest', { body: payload });
        if (!r.ok) throw new Error(`${r.status}: ${r.data.error}`);
        return [`Execution hash ${shortHash(r.data.execution_hash)}`, `${r.data.checks.length} contract checks · ledger block #${r.data.block.index}`];
      })) &&
      (await stage(1, () => {
        const f = fairness(model);
        const rec = recommendedAlternative(alternatives(model));
        return [`Lowest DIR ${f.minDir.toFixed(3)} (${f.worst.group.protectedLabel})`, rec ? `Fairer refit found: ${rec.label.toLowerCase()}, DIR ${rec.minDir.toFixed(3)}` : 'No fairer single-feature refit within tolerance']
      })) &&
      (await stage(2, () => {
        const d = drift(model);
        const p = perturbation(model);
        extraction(model);
        const c = runPromptCorpus();
        return [`Score PSI ${d.psi.toFixed(3)} across ${PROD_N.toLocaleString()} applications`, `${c.attacksBlocked}/${c.attacks} injection prompts blocked · ${pct(p.headline.guarded)} padding residual`];
      })) &&
      (await stage(3, async () => {
        const r = await api('/api/v1/mrm/audit-binder/generate', { body: payload });
        if (!r.ok) throw new Error(`${r.status}: ${r.data.error}`);
        return [`Binder hash ${shortHash(r.data.binder_hash)}`, `6 sections · ledger block #${r.data.block.index}`];
      }));
    setTotal(performance.now() - t0);
    setRunning(false);
    return ok;
  };

  const done = total !== null && stages.every((s) => s.status === 'done') && ranFor === modelId;
  return (
    <div>
      <PageHead
        title="Model risk command centre"
        lead={
          <>
            A compliance adapter that turns scorecard outputs into an examiner-ready package for US banks: SR 11-7 validation, ECOA fair lending tests, drift monitoring and AI threat guardrails, sealed in a tamper-evident ledger.
          </>
        }
        right={
          <Link href="/mrm/help#demo" className={btnGhost}>
            6-step demo script
          </Link>
        }
      />

      <Panel
        className="glow relative overflow-hidden"
        title={
          <>
            Run full validation: {model.spec.name} {model.spec.version}
          </>
        }
        subtitle={`Four stages, end to end, signed in as ${role.replace(/_/g, ' ')}. Target: under 15 seconds.`}
        right={
          <div className="flex items-center gap-3">
            {total !== null && (
              <span className="text-[12px] text-sub">
                Completed in <span className={`num text-[15px] font-semibold ${total < 15000 ? 'text-up' : 'text-amber'}`}>{(total / 1000).toFixed(2)}s</span>
              </span>
            )}
            <button type="button" className={btnPrimary} onClick={run} disabled={running}>
              {running ? 'Running…' : total === null ? 'Run full validation' : 'Run again'}
            </button>
          </div>
        }
      >
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((s, i) => {
            const st = stages[i];
            return (
              <li key={s.n} className={`relative overflow-hidden rounded-xl border p-3.5 transition ${st.status === 'done' ? 'border-up/35 bg-up/[0.05]' : st.status === 'running' ? 'border-brand/60 bg-brand/[0.07]' : st.status === 'error' ? 'border-down/40 bg-down/[0.06]' : 'border-line bg-bg/40'}`}>
                {st.status === 'running' && <span className="absolute inset-x-0 top-0 h-0.5 animate-scan bg-gradient-to-r from-transparent via-brand to-transparent" />}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <span className={`num flex h-5 w-5 items-center justify-center rounded-md text-[10.5px] ${st.status === 'done' ? 'bg-up text-bg' : st.status === 'error' ? 'bg-down text-white' : st.status === 'running' ? 'bg-brand text-white' : 'bg-line text-sub'}`}>{st.status === 'done' ? '✓' : st.status === 'error' ? '✕' : s.n}</span>
                    {s.title}
                  </div>
                  {st.ms !== undefined && <span className="num text-[11px] text-mute">{Math.round(st.ms)} ms</span>}
                </div>
                <ul className="mt-2.5 space-y-1 text-[12px] leading-snug">
                  {st.status === 'done' && st.lines ? st.lines.map((l) => <li key={l} className="text-sub">{l}</li>) : st.status === 'error' ? <li className="text-down">{st.error}. Switch role in the top bar and run again; the refusal is in the ledger.</li> : s.steps.map((l) => <li key={l} className="text-mute">· {l}</li>)}
                </ul>
              </li>
            );
          })}
        </ol>
        {done && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg/50 px-4 py-3 text-[12.5px] text-sub">
            <RagPill rag={sum.overall} />
            <span className="min-w-0 flex-1">{sum.findings[0]}</span>
            <Link href="/mrm/binder" className={btnPrimary}>
              Open the audit binder
            </Link>
            <Link href="/mrm/ledger" className={btnGhost}>
              See the ledger entries
            </Link>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Holdout KS" help="ks" value={sum.ks.toFixed(3)} rag={sum.performance} sub={`Gini ${sum.gini.toFixed(3)} · AUC ${sum.auc.toFixed(3)}`} />
        <Kpi label="Lowest disparate impact" help="dir" value={sum.minDir.toFixed(3)} rag={sum.fairLending} sub={`${sum.worstGroup} · threshold 0.80`} />
        <Kpi label="Score PSI" help="psi" value={sum.psi.toFixed(3)} rag={sum.stability} sub={`${PROD_N.toLocaleString()} production applications`} />
        <Kpi label="Validation outcome" help="sr117" value={<span className={`font-sans text-[19px] ${RAG[sum.overall].text}`}>{RAG[sum.overall].label}</span>} sub={`Tier ${model.spec.tier} · last validated ${model.spec.lastValidated}`} />
      </div>

      <Panel className="mt-5" title="Model inventory" help="tier" subtitle="Select a model to load it across every page." pad={false}>
        <div className="grid divide-y divide-line/60 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {all.map(({ spec, sum: s }) => {
            const on = spec.id === modelId;
            const areas: [string, Rag, string][] = [
              ['Performance', s.performance, `KS ${s.ks.toFixed(2)}`],
              ['Fair lending', s.fairLending, `DIR ${s.minDir.toFixed(2)}`],
              ['Stability', s.stability, `PSI ${s.psi.toFixed(2)}`],
            ];
            return (
              <button key={spec.id} type="button" onClick={() => setModelId(spec.id)} aria-pressed={on} className={`group flex flex-col items-stretch justify-start p-4 text-left transition sm:p-5 ${on ? 'bg-brand/[0.07]' : 'hover:bg-raised/40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink">{spec.name}</div>
                    <div className="num mt-0.5 truncate text-[11px] text-mute">{spec.id}</div>
                  </div>
                  <RagPill rag={s.overall} size="sm" />
                </div>
                <div className="mt-2 text-[11.5px] text-mute">
                  Tier {spec.tier} · {spec.owner} · {spec.version}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {areas.map(([label, rag, v]) => (
                    <div key={label} className="rounded-lg border border-line/70 bg-bg/40 px-2 py-1.5">
                      <div className="flex items-center gap-1.5 text-[10.5px] text-mute">
                        <span className={`h-1.5 w-1.5 rounded-full ${RAG[rag].dot}`} />
                        {label}
                      </div>
                      <div className="num mt-0.5 text-[12.5px] font-medium text-ink">{v}</div>
                      <div className={`text-[10.5px] ${RAG[rag].text}`}>{RAG[rag].label}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[12px] leading-snug text-sub">{s.findings[0]}</p>
                <div className={`mt-2 text-[11.5px] font-medium ${on ? 'text-[#8DB4FF]' : 'text-mute group-hover:text-sub'}`}>{on ? 'Loaded' : 'Load this model →'}</div>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {[
          { who: 'Model Risk Officer', need: 'SR 11-7 / OCC 2011-12 validation and a defensible model inventory.', links: [['/mrm/binder', 'Audit binder'], ['/mrm/drift', 'Drift dashboard']] },
          { who: 'Chief Information Security Officer', need: 'OWASP LLM Top 10 coverage, zero-trust access and data lineage.', links: [['/mrm/security', 'Threat tests'], ['/mrm/ledger', 'Audit ledger']] },
          { who: 'Quantitative Risk Analyst', need: 'Calibration, SHAP interpretability and fair lending testing before submission.', links: [['/mrm/fair-lending', 'Disparate impact'], ['/mrm/performance', 'Validation sandbox']] },
        ].map((p) => (
          <Panel key={p.who} title={p.who}>
            <p className="text-[12.5px] leading-relaxed text-sub">{p.need}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.links.map(([href, label]) => (
                <Link key={href} href={href} className={btnGhost}>
                  {label}
                </Link>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="mt-5" title="Suggested walkthrough" subtitle="About five minutes.">
        <ol className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {DEMO_SCRIPT.map((d, i) => (
            <li key={d.title} className="flex gap-3">
              <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-line text-[10.5px] font-semibold text-sub">{i + 1}</span>
              <div className="min-w-0 text-[12.5px] leading-snug">
                <Link href={d.path} className="font-semibold text-ink hover:text-[#8DB4FF]">
                  {d.title}
                </Link>
                <div className="text-mute">{d.say}</div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-2 text-[12px] text-mute">
          New to the terms? Every <Help id="dir" /> opens a definition, and each page has a “How to use this page” guide.
        </div>
      </Panel>
    </div>
  );
}
