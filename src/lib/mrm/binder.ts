// SR 11-7 validation binder: a structured document built deterministically from the engine's
// results. The same structure renders as the on-screen / print (PDF) binder and as Markdown.
// No language model writes any of it, so two runs on the same payload give the same binder.

import { FEATURES, GROUPS, PROD_N, alternatives, drift, fairness, featureDef, recommendedAlternative, summarize, type Model, type Rag } from './engine.ts';
import { OWASP_LLM, THREATS, extraction, perturbation, runPromptCorpus } from './threats.ts';

export type BinderBlock =
  | { type: 'p'; text: string }
  | { type: 'finding'; tone: Rag; title: string; text: string }
  | { type: 'kv'; rows: [string, string][] }
  | { type: 'table'; head: string[]; rows: string[][]; caption?: string }
  | { type: 'formula'; tex: string; plain: string }
  | { type: 'chart'; id: 'roc' | 'ks' | 'shap' | 'dir' | 'psi' | 'monthly' | 'perturbation' | 'extraction'; caption: string };

export interface BinderSection {
  id: string;
  number: string;
  title: string;
  /** Where this section maps in the supervisory text. */
  mapping: string[];
  rag: Rag | null;
  blocks: BinderBlock[];
}

export interface Binder {
  title: string;
  modelId: string;
  modelName: string;
  version: string;
  generatedFor: string;
  overall: Rag;
  verdict: string;
  sections: BinderSection[];
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const f3 = (v: number) => v.toFixed(3);
const ragWord: Record<Rag, string> = { pass: 'Within policy', warn: 'Monitor', fail: 'Action required' };
export const ragLabel = (r: Rag) => ragWord[r];

export function buildBinder(model: Model): Binder {
  const { spec, card, perf } = model;
  const sum = summarize(model);
  const fair = fairness(model);
  const dr = drift(model);
  const alts = alternatives(model);
  const rec = recommendedAlternative(alts);
  const pert = perturbation(model);
  const ext = extraction(model);
  const prompts = runPromptCorpus();
  const security: Rag = pert.headline.guarded > 0.02 || prompts.attacksBlocked < prompts.attacks ? 'warn' : 'pass';

  const verdict =
    sum.overall === 'pass'
      ? 'Recommended for approval. No threshold breaches were found.'
      : sum.overall === 'warn'
        ? 'Recommended for conditional approval with the monitoring actions listed in this binder.'
        : 'Not recommended for approval in its current form. The findings below require remediation.';

  const s1: BinderSection = {
    id: 'summary',
    number: '1',
    title: 'Model Executive Summary & Conceptual Soundness',
    mapping: ['SR 11-7 §IV Model Development, Implementation, and Use', 'SR 11-7 §V Validation: evaluation of conceptual soundness', 'OCC Bulletin 2011-12'],
    rag: sum.overall,
    blocks: [
      { type: 'finding', tone: sum.overall, title: `Validation outcome: ${ragWord[sum.overall]}`, text: `${verdict} ${sum.findings.join(' ')}` },
      {
        type: 'kv',
        rows: [
          ['Model', `${spec.name} ${spec.version} (${spec.id})`],
          ['Business purpose', `Rank-order applicants for ${spec.product.toLowerCase()} by probability of reaching 90+ days past due, and support the approve / decline decision at a score cut-off.`],
          ['Model type', `${spec.modelType}, delivered as a points-based scorecard`],
          ['Target variable', 'default_90dpd (90+ days past due within the performance window)'],
          ['Model owner (first line)', spec.owner],
          ['Risk tier', `Tier ${spec.tier}`],
          ['Development sample', `${model.dev.n.toLocaleString()} applications: ${model.train.length.toLocaleString()} development, ${model.test.length.toLocaleString()} holdout`],
          ['Score scale', `${spec.baseScore} points at ${spec.baseOdds}:1 good:bad odds, ${spec.pdo} points to double the odds`],
          ['Decision cut-off', `${model.cutoff} (approval rate ${pct(fair.approvalRate)})`],
        ],
      },
      { type: 'p', text: `Economic rationale. The scorecard combines ${card.features.length} bureau and application characteristics that have a direct, explainable relationship with repayment capacity and willingness to pay. Each characteristic enters through a Weight-of-Evidence transformation, so its contribution is additive, bounded and can be explained to an applicant as a specific reason.` },
      { type: 'p', text: 'Key assumptions and limitations. (1) The future applicant population resembles the development population; Section 5 monitors this. (2) Declined applicants are not observed, so performance is measured on booked accounts. (3) The ZIP-level loss index is a geographic characteristic and is assessed in Section 4 as a potential proxy for a prohibited basis.' },
      {
        type: 'table',
        caption: 'Assessment by validation area',
        head: ['Area', 'Outcome', 'Evidence'],
        rows: [
          ['Statistical performance', ragWord[sum.performance], `Holdout KS ${f3(sum.ks)}, Gini ${f3(sum.gini)}, AUC ${f3(sum.auc)}`],
          ['Fair lending', ragWord[sum.fairLending], `Lowest disparate impact ratio ${f3(sum.minDir)} (${sum.worstGroup})`],
          ['Population stability', ragWord[sum.stability], `Score PSI ${f3(sum.psi)} on ${PROD_N.toLocaleString()} production applications`],
          ['Security & robustness', ragWord[security], `Income padding: ${pct(pert.headline.open)} bypass unguarded, ${pct(pert.headline.guarded)} worst residual with guardrails; ${prompts.attacksBlocked}/${prompts.attacks} injection prompts blocked`],
        ],
      },
    ],
  };

  const s2: BinderSection = {
    id: 'data',
    number: '2',
    title: 'Data Lineage & Feature Engineering',
    mapping: ['SR 11-7 §IV: data quality and relevance', 'SR 11-7 §V: conceptual soundness, developmental evidence'],
    rag: null,
    blocks: [
      { type: 'p', text: 'Source data. Application and bureau attributes are delivered through the wrapper API as a single payload. On ingestion the payload is schema-validated, canonicalised and SHA-256 hashed; the digest is written to the audit ledger so any later change to the inputs is detectable (Section 6).' },
      {
        type: 'kv',
        rows: [
          ['Missing values', 'Assigned to their own Weight-of-Evidence bin where present, so missingness is scored on its observed risk and never silently imputed to the mean.'],
          ['Outliers', 'Continuous characteristics are capped at the 0.5th and 99.5th percentiles before binning. Count characteristics are top-coded (3+).'],
          ['Binning', 'Continuous characteristics use six equal-frequency bins; counts use natural bins 0, 1, 2, 3+.'],
          ['Protected data', 'Protected-class indicators are held only in the test harness for Section 4. They are never model inputs and are not stored by the engine.'],
        ],
      },
      { type: 'formula', tex: '\\mathrm{WoE}_b=\\ln\\frac{\\%\\,\\mathrm{Good}_b}{\\%\\,\\mathrm{Bad}_b}\\qquad \\mathrm{IV}=\\sum_b(\\%\\,\\mathrm{Good}_b-\\%\\,\\mathrm{Bad}_b)\\,\\mathrm{WoE}_b', plain: 'WoE_b = ln(%Good_b / %Bad_b);  IV = Σ_b (%Good_b − %Bad_b) × WoE_b' },
      {
        type: 'table',
        caption: 'Characteristics, information value and attribution',
        head: ['Characteristic', 'Bins', 'Information Value', 'IV strength', 'Mean |SHAP| (points)', 'Share'],
        rows: [...card.features]
          .sort((a, b) => b.iv - a.iv)
          .map((f) => {
            const sh = model.shap.find((x) => x.key === f.key)!;
            return [featureDef(f.key).label, String(f.bins.length), f3(f.iv), f.iv >= 0.5 ? 'Very strong: review' : f.iv >= 0.3 ? 'Strong' : f.iv >= 0.1 ? 'Medium' : 'Weak', sh.meanAbs.toFixed(1), pct(sh.share)];
          }),
      },
      { type: 'chart', id: 'shap', caption: 'Mean absolute SHAP contribution per characteristic, in score points' },
    ],
  };

  const s3: BinderSection = {
    id: 'performance',
    number: '3',
    title: 'Statistical Performance & Scorecard Calibration',
    mapping: ['SR 11-7 §V Validation: outcomes analysis', 'SR 11-7 §V: benchmarking and back-testing'],
    rag: sum.performance,
    blocks: [
      {
        type: 'table',
        caption: 'Discrimination, in-sample and out-of-sample',
        head: ['Sample', 'Applications', 'Bad rate', 'KS', 'Gini', 'AUC-ROC'],
        rows: [
          ['Development (in-sample)', perf.train.n.toLocaleString(), pct(perf.train.badRate), f3(perf.train.ks), f3(perf.train.gini), f3(perf.train.auc)],
          ['Holdout (out-of-sample)', perf.test.n.toLocaleString(), pct(perf.test.badRate), f3(perf.test.ks), f3(perf.test.gini), f3(perf.test.auc)],
        ],
      },
      { type: 'p', text: `The holdout KS of ${f3(perf.test.ks)} is reached at a score of ${perf.test.ksScore}. The development-to-holdout KS difference is ${f3(Math.abs(sum.ksGap))}, ${Math.abs(sum.ksGap) <= 0.07 ? 'inside' : 'outside'} the 0.07 tolerance used to flag overfitting.` },
      { type: 'chart', id: 'roc', caption: 'ROC curve on the holdout sample' },
      { type: 'chart', id: 'ks', caption: 'Cumulative share of goods and bads by score; the widest gap is the KS statistic' },
      { type: 'formula', tex: '\\mathrm{Score}=\\mathrm{Offset}+\\mathrm{Factor}\\cdot\\ln(\\mathrm{odds}),\\quad \\mathrm{Factor}=\\frac{\\mathrm{PDO}}{\\ln 2},\\quad \\mathrm{Offset}=\\mathrm{Score}_0-\\mathrm{Factor}\\cdot\\ln(\\mathrm{odds}_0)', plain: 'Score = Offset + Factor × ln(odds);  Factor = PDO / ln 2;  Offset = Score₀ − Factor × ln(odds₀)' },
      {
        type: 'table',
        caption: `Calibration on the holdout sample (Factor ${card.factor.toFixed(2)}, Offset ${card.offset.toFixed(1)})`,
        head: ['Score band midpoint', 'Applications', 'Expected odds', 'Observed odds', 'Observed / expected'],
        rows: model.calibration.map((c) => [String(c.score), c.n.toLocaleString(), `${c.expectedOdds.toFixed(1)} : 1`, `${c.observedOdds.toFixed(1)} : 1`, (c.observedOdds / c.expectedOdds).toFixed(2)]),
      },
    ],
  };

  const worst = fair.worst;
  const s4: BinderSection = {
    id: 'fair-lending',
    number: '4',
    title: 'Fair Lending & Disparate Impact Evaluation',
    mapping: ['ECOA, 15 U.S.C. §1691', 'Regulation B, 12 CFR §1002.4(a) and §1002.6', 'Regulation B, 12 CFR §1002.9: adverse action reasons', 'Four-fifths rule (29 CFR §1607.4(D)) used as the screening threshold'],
    rag: sum.fairLending,
    blocks: [
      { type: 'formula', tex: '\\mathrm{DIR}=\\frac{P(\\mathrm{Approval}\\mid\\mathrm{Protected\\ group})}{P(\\mathrm{Approval}\\mid\\mathrm{Control\\ group})}', plain: 'DIR = P(Approval | Protected group) / P(Approval | Control group)' },
      {
        type: 'table',
        caption: `Selection rates at cut-off ${fair.cutoff}`,
        head: ['Prohibited basis', 'Protected group', 'Approval rate', 'Control group', 'Approval rate', 'DIR', 'Status'],
        rows: fair.groups.map((g) => [g.group.label, `${g.group.protectedLabel} (n=${g.protectedN.toLocaleString()})`, pct(g.protectedApproval), `${g.group.controlLabel} (n=${g.controlN.toLocaleString()})`, pct(g.controlApproval), f3(g.dir), g.status]),
      },
      { type: 'chart', id: 'dir', caption: 'Disparate impact ratio by prohibited basis against the 0.80 threshold' },
      {
        type: 'finding',
        tone: sum.fairLending,
        title: sum.fairLending === 'fail' ? 'Potential adverse impact identified' : sum.fairLending === 'warn' ? 'Four-fifths rule met; watch band' : 'Four-fifths rule met for every tested basis',
        text:
          sum.fairLending === 'fail'
            ? `${worst.group.protectedLabel} applicants are approved at ${pct(worst.protectedApproval)} against ${pct(worst.controlApproval)} for the control group, a ratio of ${f3(worst.dir)}. The mean score gap is ${worst.scoreGap.toFixed(1)} points, of which ${pct(worst.drivers[0].share, 0)} is attributable to ${featureDef(worst.drivers[0].key).label.toLowerCase()}.`
            : `The lowest ratio is ${f3(worst.dir)} for ${worst.group.protectedLabel.toLowerCase()} applicants. ${sum.fairLending === 'warn' ? 'It should be re-tested at each monitoring cycle.' : ''}`,
      },
      {
        type: 'table',
        caption: `Marginal SHAP decomposition of the score gap: ${worst.group.protectedLabel} vs ${worst.group.controlLabel}`,
        head: ['Characteristic', 'Gap explained (points)', 'Share of adverse gap'],
        rows: worst.drivers.map((d) => [featureDef(d.key).label, d.gapPoints.toFixed(1), d.gapPoints > 0 ? pct(d.share) : 'n/a (favourable)']),
      },
      ...(rec
        ? ([
            {
              type: 'finding',
              tone: rec.minDir >= 0.8 ? 'pass' : 'warn',
              title: 'Less discriminatory alternative identified',
              text: `Refitting the scorecard ${rec.label.toLowerCase()} at the same approval rate moves the lowest ratio from ${f3(alts[0].minDir)} to ${f3(rec.minDir)} with a holdout KS change of ${rec.ksDelta >= 0 ? '+' : ''}${f3(rec.ksDelta)}. The first line should adopt this specification or document a business justification for retaining the characteristic.`,
            },
          ] as BinderBlock[])
        : []),
      {
        type: 'table',
        caption: 'Alternative specifications tested (each refit at the champion approval rate)',
        head: ['Specification', 'Holdout KS', 'Δ KS', 'Lowest DIR', ...GROUPS.map((g) => g.label)],
        rows: alts.map((a) => [a.label, f3(a.ks), a.dropped ? `${a.ksDelta >= 0 ? '+' : ''}${f3(a.ksDelta)}` : '', f3(a.minDir), ...GROUPS.map((g) => f3(a.dirs[g.key]))]),
      },
      {
        type: 'table',
        caption: `Principal adverse action reasons for the ${fair.declined.toLocaleString()} declined applications`,
        head: ['Reason given to the applicant', 'Characteristic', 'Declines', 'Share'],
        rows: fair.reasons.filter((r) => r.count > 0).map((r) => [r.reason, featureDef(r.key).short, r.count.toLocaleString(), pct(r.share)]),
      },
    ],
  };

  const s5: BinderSection = {
    id: 'monitoring',
    number: '5',
    title: 'Ongoing Monitoring & Population Drift Guardrails',
    mapping: ['SR 11-7 §V Validation: ongoing monitoring', 'SR 11-7 §VI Governance, Policies, and Controls'],
    rag: sum.stability,
    blocks: [
      { type: 'formula', tex: '\\mathrm{PSI}=\\sum_{k=1}^{K}(\\mathrm{Actual}_k-\\mathrm{Expected}_k)\\cdot\\ln\\frac{\\mathrm{Actual}_k}{\\mathrm{Expected}_k}', plain: 'PSI = Σ_k (Actual_k − Expected_k) × ln(Actual_k / Expected_k)' },
      {
        type: 'finding',
        tone: sum.stability,
        title: dr.band === 'stable' ? 'Stable distribution' : dr.band === 'moderate' ? 'Moderate drift: monitoring warning' : 'Significant drift: recalibration alert',
        text: `Score PSI is ${f3(dr.psi)} across ${PROD_N.toLocaleString()} production applications against the development baseline. Mean score moved from ${dr.devMeanScore.toFixed(0)} to ${dr.meanScore.toFixed(0)} and the approval rate at the current cut-off from ${pct(dr.devApprovalRate)} to ${pct(dr.approvalRate)}. ${dr.band === 'significant' ? 'A mandatory recalibration alert is raised to ModelCompass.ai.' : dr.band === 'moderate' ? 'An automated monitoring warning is raised.' : 'No action required.'}`,
      },
      { type: 'chart', id: 'psi', caption: 'Score distribution: development baseline vs production' },
      { type: 'chart', id: 'monthly', caption: 'Monthly score PSI with the 0.10 and 0.25 action thresholds' },
      {
        type: 'table',
        caption: 'Characteristic Stability Index',
        head: ['Characteristic', 'CSI', 'Status'],
        rows: dr.csi.map((c) => [featureDef(c.key).label, f3(c.csi), c.band === 'stable' ? 'Stable' : c.band === 'moderate' ? 'Moderate drift' : 'Significant drift']),
      },
      {
        type: 'table',
        caption: 'Monitoring thresholds and actions',
        head: ['Metric', 'Threshold', 'Automated action'],
        rows: [
          ['PSI / CSI', '< 0.10', 'Stable. No action.'],
          ['PSI / CSI', '0.10 – 0.25', 'Monitoring warning to the model owner and Model Risk.'],
          ['PSI / CSI', '> 0.25', 'Mandatory recalibration alert in ModelCompass.ai.'],
          ['Disparate impact ratio', '< 0.80', 'Adverse impact flag; less-discriminatory-alternative search.'],
          ['Holdout KS', '< 0.30', 'Performance finding; model owner review.'],
        ],
      },
    ],
  };

  const s6: BinderSection = {
    id: 'security',
    number: '6',
    title: 'Security Threat Assessment & Lineage Assurance',
    mapping: ['SR 11-7 §VI: controls and model inventory integrity', 'OWASP Top 10 for LLM Applications (2025)', 'ISO/IEC 42001: AI management system controls'],
    rag: security,
    blocks: [
      {
        type: 'table',
        caption: 'Threat matrix and tested countermeasures',
        head: ['Threat', 'Target', 'Countermeasures', 'Test result'],
        rows: THREATS.map((t) => [
          t.category,
          t.target,
          t.countermeasures.join('; '),
          t.test === 'perturbation'
            ? `Padding income by ${pct(pert.headline.pad, 0)} flips ${pct(pert.headline.open)} of near-miss declines unguarded. With both guardrails the worst residual is ${pct(pert.headline.guarded)}, at ${pct(pert.headline.guardedPad, 0)} padding (inside the ${pct(pert.tolerance, 0)} income verification tolerance)`
            : t.test === 'extraction'
              ? `Surrogate fidelity R² ${f3(ext.unlimited.open)} with unlimited open queries; ${f3(ext.atLimit.guarded)} at the ${ext.rateLimit}-query budget with quantization and noise (${f3(ext.atLimit.open)} without)`
              : t.test === 'prompt'
                ? `${prompts.attacksBlocked} of ${prompts.attacks} injection prompts blocked; ${prompts.benignAllowed} of ${prompts.benign} legitimate prompts allowed`
                : 'Every ledger block is SHA-256 chained; any edit is detected on verification',
        ]),
      },
      { type: 'chart', id: 'perturbation', caption: 'Share of near-miss declined applicants who cross the cut-off by padding stated income' },
      { type: 'chart', id: 'extraction', caption: 'Fidelity of an attacker’s surrogate model against the number of scoring queries' },
      {
        type: 'table',
        caption: 'OWASP Top 10 for LLM Applications: coverage',
        head: ['ID', 'Risk', 'Coverage', 'Control'],
        rows: OWASP_LLM.map((o) => [o.id, o.name, o.coverage === 'tested' ? 'Tested' : o.coverage === 'specified' ? 'Control specified' : 'Out of scope', o.control]),
      },
      { type: 'p', text: 'Access control. Requests are authenticated with a signed bearer token and authorised against the role matrix: Model_Developer may ingest and run validation, only Independent_Validator may sign off or reject, and Executive_Auditor can read binders and the ledger but cannot submit or decide. Denied requests are recorded in the ledger.' },
    ],
  };

  return { title: 'Model Validation Report', modelId: spec.id, modelName: spec.name, version: spec.version, generatedFor: 'Prepared under Federal Reserve SR 11-7 / OCC 2011-12 and ECOA / Regulation B', overall: sum.overall, verdict, sections: [s1, s2, s3, s4, s5, s6] };
}

const cell = (s: string) => s.replace(/\|/g, '\\|');

export function binderMarkdown(b: Binder, meta: { generatedAt: string; binderHash?: string; ledgerBlock?: number; signoff?: string } = { generatedAt: new Date().toISOString() }): string {
  const out: string[] = [];
  out.push(`# ${b.title}: ${b.modelName} ${b.version}`, '', `**Model ID:** \`${b.modelId}\`  `, `**Generated:** ${meta.generatedAt}  `, `**Outcome:** ${ragWord[b.overall]}. ${b.verdict}  `, `**Basis:** ${b.generatedFor}`);
  if (meta.signoff) out.push(`**Independent validation decision:** ${meta.signoff}`);
  out.push('', '> Demonstration binder. The portfolio behind these figures is synthetic.', '');
  for (const s of b.sections) {
    out.push(`## ${s.number}. ${s.title}`, '', `*Regulatory mapping: ${s.mapping.join(' · ')}*`, '');
    for (const k of s.blocks) {
      if (k.type === 'p') out.push(k.text, '');
      else if (k.type === 'finding') out.push(`> **${k.title}.** ${k.text}`, '');
      else if (k.type === 'formula') out.push(`$$${k.tex}$$`, '');
      else if (k.type === 'chart') out.push(`*Figure: ${k.caption} (rendered in the PDF binder).*`, '');
      else if (k.type === 'kv') out.push('| Item | Detail |', '|---|---|', ...k.rows.map(([a, c]) => `| ${cell(a)} | ${cell(c)} |`), '');
      else {
        if (k.caption) out.push(`**${k.caption}**`, '');
        out.push(`| ${k.head.map(cell).join(' | ')} |`, `|${k.head.map(() => '---').join('|')}|`, ...k.rows.map((r) => `| ${r.map(cell).join(' | ')} |`), '');
      }
    }
  }
  out.push('---', '', '## Lineage', '');
  if (meta.binderHash) out.push(`- Binder SHA-256: \`${meta.binderHash}\``);
  if (meta.ledgerBlock !== undefined) out.push(`- Audit ledger block: #${meta.ledgerBlock}`);
  out.push(`- Characteristics in scope: ${FEATURES.length}`, '');
  return out.join('\n');
}
