import Link from 'next/link';
import { PERMISSIONS, ROLES, can } from '@/lib/mrm/contract';
import { DEMO_SCRIPT, FAQ, GUIDES, TERMS, term } from '@/lib/mrm/help';

const GROUPS = ['Regulation', 'Performance', 'Explainability', 'Fair lending', 'Stability', 'Security'] as const;
const TOC: [string, string][] = [
  ['start', 'What this is'],
  ['demo', 'Demo script'],
  ['pages', 'Page by page'],
  ['roles', 'Roles'],
  ['regs', 'Regulatory mapping'],
  ['glossary', 'Glossary'],
  ['real', 'Real vs simulated'],
  ['faq', 'FAQ'],
];
const REGS: [string, string, string][] = [
  ['SR 11-7 §IV · Model development, implementation and use', 'Binder §1 and §2', 'Purpose, rationale, assumptions, data lineage, WoE binning'],
  ['SR 11-7 §V · Evaluation of conceptual soundness', 'Binder §1, §2 · Performance & XAI', 'Information Value, SHAP attribution, scorecard table'],
  ['SR 11-7 §V · Outcomes analysis', 'Binder §3 · Performance & XAI', 'KS, Gini, AUC in and out of sample, calibration to the PDO scale'],
  ['SR 11-7 §V · Ongoing monitoring', 'Binder §5 · Drift & Stability', 'PSI, CSI, thresholds and automated actions'],
  ['SR 11-7 §VI · Governance, policies and controls', 'Gateway, Audit Ledger, sign-off', 'Role separation, independent decision, immutable trail'],
  ['ECOA / Regulation B §1002.4(a), §1002.6', 'Binder §4 · Fair Lending', 'Disparate impact ratio, driver decomposition, alternative search'],
  ['Regulation B §1002.9', 'Binder §4 · Fair Lending', 'Principal adverse action reasons'],
  ['OWASP Top 10 for LLM Applications', 'Binder §6 · Security & Threats', 'Coverage table: tested, specified, out of scope'],
  ['ISO/IEC 42001', 'Binder §6, Audit Ledger', 'Traceability and control evidence for an AI management system'],
];

const h2 = 'scroll-mt-28 text-[19px] font-semibold tracking-tight text-ink';
const card = 'rounded-2xl border border-line bg-panel/80 p-4 sm:p-5';

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8DB4FF]">Help &amp; Docs</div>
      <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">How to use the MRM Security Engine</h1>
      <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-sub">Everything on one page: what the portal does, a five-minute walkthrough, what each screen shows, and plain-language definitions of every term.</p>

      <nav aria-label="On this page" className="sticky top-14 z-20 -mx-4 mt-4 flex gap-1.5 overflow-x-auto border-b border-line/60 bg-bg/90 px-4 py-2 backdrop-blur lg:top-14">
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-[12px] font-medium text-sub hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <section className="mt-7 space-y-3">
        <h2 id="start" className={h2}>What this is</h2>
        <div className={`${card} space-y-3 text-[13px] leading-relaxed text-sub`}>
          <p>
            US bank examiners expect every credit model to come with evidence: that it works, that it treats protected groups fairly, that it is still valid for today’s applicants, and that nobody can quietly change it or its history. Assembling that evidence by hand takes a validation team weeks or months per model.
          </p>
          <p>
            The MRM Security Engine is an adapter that sits beside a scorecard platform such as IntelliDecision.ai or ModelCompass.ai. It takes what the platform already produces (model metadata, performance statistics, a SHAP importance vector) through an open JSON contract and returns the evidence package in seconds.
          </p>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['1', 'Ingest', 'Authenticate the caller, validate the payload, hash it, write it to the ledger.'],
              ['2', 'Fair lending & XAI', 'Test approval rates across protected groups, explain any gap, look for a fairer model.'],
              ['3', 'Threat & stability', 'Measure population drift and run adversarial tests against the model and its interfaces.'],
              ['4', 'Binder', 'Compile the SR 11-7 validation report and record the validator’s decision.'],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-xl border border-line bg-bg/40 p-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <span className="num flex h-5 w-5 items-center justify-center rounded-md bg-brand text-[10.5px] text-white">{n}</span>
                  {t}
                </div>
                <div className="mt-1.5 text-[12px] text-mute">{d}</div>
              </li>
            ))}
          </ol>
          <p className="text-[12.5px] text-mute">
            Two controls sit in the top bar on every page. <span className="text-sub">Model</span> switches the whole portal between the three models in the inventory. <span className="text-sub">Signed in as</span> switches your role, which changes what the gateway lets you do.
          </p>
        </div>
      </section>

      <section className="mt-9 space-y-3">
        <h2 id="demo" className={h2}>Five-minute demo script</h2>
        <ol className="grid gap-3 md:grid-cols-2">
          {DEMO_SCRIPT.map((d, i) => (
            <li key={d.title} className={`${card} flex gap-3`}>
              <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand text-[11.5px] font-semibold text-white">{i + 1}</span>
              <div className="text-[13px] leading-relaxed">
                <div className="font-semibold text-ink">{d.title}</div>
                <div className="text-sub">{d.say}</div>
                <Link href={d.path} className="mt-1 inline-block text-[12px] font-medium text-[#8DB4FF] hover:underline">
                  Go to {d.where} →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-9 space-y-3">
        <h2 id="pages" className={h2}>Page by page</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {GUIDES.map((g) => (
            <div key={g.path} className={card}>
              <div className="flex items-baseline justify-between gap-3">
                <Link href={g.path} className="text-[14px] font-semibold text-ink hover:text-[#8DB4FF]">
                  {g.title}
                </Link>
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-mute">{g.stage}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-sub">{g.what}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12.5px] leading-relaxed text-sub marker:text-mute">
                {g.try.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {g.terms.map((id) => (
                  <a key={id} href={`#${id}`} className="rounded-full border border-line bg-bg/40 px-2 py-0.5 text-[11px] text-mute hover:text-ink">
                    {term(id)?.term}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9 space-y-3">
        <h2 id="roles" className={h2}>Roles and what each can do</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.role} className={card}>
              <div className="num text-[13px] font-semibold text-ink">{r.role}</div>
              <div className="text-[12px] text-[#8DB4FF]">{r.persona}</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-sub">{r.blurb}</p>
              <ul className="mt-2 space-y-0.5 text-[12.5px]">
                {PERMISSIONS.map((p) => (
                  <li key={p.id} className={can(r.role, p.id) ? 'text-sub' : 'text-mute line-through decoration-line'}>
                    <span className={can(r.role, p.id) ? 'text-up' : 'text-mute'}>{can(r.role, p.id) ? '✓' : '—'}</span> {p.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9 space-y-3">
        <h2 id="regs" className={h2}>Regulatory mapping</h2>
        <div className={`${card} overflow-x-auto p-0 sm:p-0`}>
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line/60 text-left text-[10.5px] uppercase tracking-wider text-mute">
                <th className="px-4 py-2.5 font-medium">Requirement</th>
                <th className="px-4 py-2.5 font-medium">Where in the portal</th>
                <th className="px-4 py-2.5 font-medium">Evidence produced</th>
              </tr>
            </thead>
            <tbody>
              {REGS.map(([a, b, c]) => (
                <tr key={a} className="border-b border-line/40 align-top last:border-0">
                  <td className="px-4 py-2.5 text-ink">{a}</td>
                  <td className="px-4 py-2.5 text-sub">{b}</td>
                  <td className="px-4 py-2.5 text-sub">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] leading-relaxed text-mute">This mapping shows where the portal produces evidence relevant to each requirement. It is not legal advice and does not replace a bank’s own compliance determination.</p>
      </section>

      <section className="mt-9 space-y-4">
        <h2 id="glossary" className={h2}>Glossary</h2>
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{g}</div>
            <div className="grid gap-3 md:grid-cols-2">
              {TERMS.filter((t) => t.group === g).map((t) => (
                <div key={t.id} id={t.id} className={`${card} scroll-mt-28 target:border-brand/70 target:bg-brand/[0.06]`}>
                  <div className="text-[13.5px] font-semibold text-ink">{t.term}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-sub">{t.short}</p>
                  {t.formula && <div className="num mt-2 rounded-md bg-bg/70 px-2.5 py-1.5 text-[12px] text-ink">{t.formula}</div>}
                  {t.thresholds && (
                    <dl className="mt-2 space-y-0.5 text-[12.5px]">
                      {t.thresholds.map(([k, v]) => (
                        <div key={k} className="flex gap-3">
                          <dt className="num w-[96px] shrink-0 text-ink">{k}</dt>
                          <dd className="text-sub">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {t.read && <p className="mt-2 border-t border-line/60 pt-2 text-[12px] leading-relaxed text-mute">{t.read}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-9 space-y-3">
        <h2 id="real" className={h2}>What is real and what is simulated</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className={card}>
            <div className="text-[13px] font-semibold text-up">Real, computed live</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-sub marker:text-mute">
              <li>The scorecard fit: Weight-of-Evidence binning and logistic regression, run on every load</li>
              <li>Every statistic: KS, Gini, AUC, IV, SHAP, DIR, PSI, CSI, calibration</li>
              <li>The less-discriminatory-alternative search (eight refits)</li>
              <li>The JSON contract, schema validation and OpenAPI document</li>
              <li>Signed tokens and role checks on every API route</li>
              <li>SHA-256 hashing and the chained ledger, verified in your browser</li>
              <li>The prompt guard and output filter</li>
              <li>The binder, as PDF and Markdown</li>
            </ul>
          </div>
          <div className={card}>
            <div className="text-[13px] font-semibold text-amber">Simulated for the demonstration</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-sub marker:text-mute">
              <li>Applicants: generated from a fixed seed, not real people. The fair lending failure and the drift are designed into the data so there is something to catch</li>
              <li>The attacker in the padding and extraction tests</li>
              <li>The identity provider: a demo issuer gives a token for any role you pick</li>
              <li>Mutual TLS: specified for deployment, not enforceable on a public demo host</li>
              <li>The link to ModelCompass.ai: alerts are raised in the portal and binder, not sent to a Corestrat system</li>
              <li>Query rate limiting: modelled in the extraction test, not enforced on the demo API</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-9 space-y-3 pb-10">
        <h2 id="faq" className={h2}>Frequently asked questions</h2>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className={`${card} group`}>
              <summary className="cursor-pointer list-none text-[13.5px] font-semibold text-ink marker:hidden">
                <span className="mr-2 inline-block text-mute transition group-open:rotate-90">›</span>
                {f.q}
              </summary>
              <p className="mt-2 pl-4 text-[12.5px] leading-relaxed text-sub">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
