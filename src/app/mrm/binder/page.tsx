'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HBars } from '@/components/mrm/charts';
import { DirBullets, ExtractionChart, KsChart, MonthlyPsi, PerturbationChart, PsiBars, RocChart } from '@/components/mrm/figures';
import { Help, PageHead, btnGhost, btnPrimary, shortHash } from '@/components/mrm/kit';
import { useMrm } from '@/components/mrm/state';
import { binderMarkdown, buildBinder, ragLabel, type BinderBlock } from '@/lib/mrm/binder';
import type { Block } from '@/lib/mrm/chain';
import { can } from '@/lib/mrm/contract';
import { drift, fairness, featureDef, type Model, type Rag } from '@/lib/mrm/engine';
import { extraction, perturbation } from '@/lib/mrm/threats';

const tone: Record<Rag, string> = { pass: 'border-emerald-600/40 bg-emerald-50 text-emerald-800', warn: 'border-amber-600/40 bg-amber-50 text-amber-800', fail: 'border-red-600/40 bg-red-50 text-red-800' };
const icon: Record<Rag, string> = { pass: '✓', warn: '!', fail: '✕' };

function Chart({ id, model }: { id: Extract<BinderBlock, { type: 'chart' }>['id']; model: Model }) {
  const h = 210;
  if (id === 'roc') return <RocChart model={model} light height={h} />;
  if (id === 'ks') return <KsChart model={model} light height={h} />;
  if (id === 'shap') return <HBars light rows={model.shap.map((x) => ({ label: featureDef(x.key).short, value: x.meanAbs }))} fmt={(v) => `${v.toFixed(1)} pts`} />;
  if (id === 'dir') return <DirBullets light fair={fairness(model)} />;
  if (id === 'psi') return <PsiBars light drift={drift(model)} height={h} />;
  if (id === 'monthly') return <MonthlyPsi light drift={drift(model)} height={h} />;
  if (id === 'perturbation') return <PerturbationChart light r={perturbation(model)} height={h} />;
  return <ExtractionChart light r={extraction(model)} height={h} />;
}

function BlockView({ b, model }: { b: BinderBlock; model: Model }) {
  if (b.type === 'p') return <p className="my-2.5 text-[12.5px] leading-relaxed text-slate-700">{b.text}</p>;
  if (b.type === 'finding')
    return (
      <div className={`keep my-3 rounded-lg border px-3.5 py-2.5 ${tone[b.tone]}`}>
        <div className="text-[12.5px] font-semibold">
          {icon[b.tone]} {b.title}
        </div>
        <div className="mt-1 text-[12px] leading-relaxed text-slate-700">{b.text}</div>
      </div>
    );
  if (b.type === 'formula') return <div className="num keep my-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[12px] text-slate-800">{b.plain}</div>;
  if (b.type === 'chart')
    return (
      <figure className="my-4">
        <Chart id={b.id} model={model} />
        <figcaption className="mt-1 text-[11px] italic text-slate-500">Figure: {b.caption}</figcaption>
      </figure>
    );
  if (b.type === 'kv')
    return (
      <table className="my-3 w-full border-collapse text-[12px]">
        <tbody>
          {b.rows.map(([k, v]) => (
            <tr key={k} className="border-b border-slate-200 align-top">
              <th className="w-[30%] py-1.5 pr-3 text-left font-semibold text-slate-800">{k}</th>
              <td className="py-1.5 leading-relaxed text-slate-700">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[11.5px]">
        {b.caption && <caption className="mb-1 text-left text-[11.5px] font-semibold text-slate-800">{b.caption}</caption>}
        <thead>
          <tr className="border-y border-slate-300 bg-slate-50">
            {b.head.map((h, i) => (
              <th key={i} className="px-2 py-1.5 text-left font-semibold text-slate-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-200 align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-1.5 leading-snug text-slate-700 ${/^[-+]?[\d.,]+%?$/.test(c) ? 'num' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BinderPage() {
  const { model, modelId, role, api } = useMrm();
  const binder = useMemo(() => buildBinder(model), [model]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [now, setNow] = useState('');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api('/api/v1/mrm/ledger').catch(() => null);
    if (r?.ok) setBlocks(r.data.blocks);
  }, [api]);
  useEffect(() => {
    setNow(new Date().toISOString());
    setMsg(null);
    load();
  }, [load, modelId]);

  const mine = blocks.filter((b) => b.model_id === modelId);
  const decision = [...mine].reverse().find((b) => b.event === 'SIGN_OFF' || b.event === 'REJECTED');
  const generated = [...mine].reverse().find((b) => b.event === 'BINDER_GENERATED');
  const signLine = decision ? `${decision.event === 'SIGN_OFF' ? 'APPROVED' : 'REJECTED'} by ${decision.actor} on ${decision.ts.slice(0, 10)} (ledger block #${decision.index})` : undefined;

  const decide = async (d: 'APPROVE' | 'REJECT') => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/api/v1/mrm/signoff', { body: { model_id: modelId, decision: d, comment } });
      if (r.ok) {
        setMsg({ ok: true, text: `${d === 'APPROVE' ? 'Approval' : 'Rejection'} recorded in ledger block #${r.data.block.index}.` });
        setComment('');
      } else setMsg({ ok: false, text: r.status === 403 ? `Refused (403): ${r.data.error}. SR 11-7 requires validation to be independent of development, so only the Independent Validator can decide. The attempt was logged${r.data.ledger_block !== undefined ? ` as ledger block #${r.data.ledger_block}` : ''}. Switch role in the top bar.` : `${r.status}: ${r.data.error}` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Request failed' });
    }
    setBusy(false);
  };

  const download = () => {
    const md = binderMarkdown(binder, { generatedAt: now, binderHash: generated ? String(generated.detail.binder_hash) : undefined, ledgerBlock: generated?.index, signoff: signLine });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = `sr11-7-binder-${modelId}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="print-bare">
      <div className="no-print">
        <PageHead
          title="SR 11-7 audit binder"
          lead="The validation report an examiner asks for, compiled from the results in this portal. Deterministic: the same payload always produces the same binder."
          right={
            <>
              <button type="button" className={btnGhost} onClick={download}>
                Download Markdown
              </button>
              <button type="button" className={btnPrimary} onClick={() => window.print()}>
                Save as PDF
              </button>
            </>
          }
        />
        <div className="mb-5 rounded-2xl border border-line bg-panel/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                Independent validation decision <Help id="independence" />
              </div>
              <div className="mt-1 text-[12.5px] text-sub">
                {decision ? (
                  <>
                    Current decision: <span className={`font-semibold ${decision.event === 'SIGN_OFF' ? 'text-up' : 'text-down'}`}>{decision.event === 'SIGN_OFF' ? 'Approved' : 'Rejected'}</span> by {decision.actor}, ledger block #{decision.index}.{decision.detail.comment ? ` “${String(decision.detail.comment)}”` : ''}
                  </>
                ) : (
                  'No decision recorded yet.'
                )}{' '}
                You are signed in as <span className="text-ink">{role.replace(/_/g, ' ')}</span>{can(role, 'validation:signoff') ? '.' : ', which is not entitled to decide. Try it to see the refusal.'}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} placeholder="Comment for the record (optional)" aria-label="Decision comment" className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-bg/60 px-3 text-[12.5px] text-ink outline-none placeholder:text-mute focus-visible:border-brand" />
            <button type="button" disabled={busy} onClick={() => decide('APPROVE')} className={`${btnGhost} border-up/40 text-up hover:border-up`}>
              ✓ Approve
            </button>
            <button type="button" disabled={busy} onClick={() => decide('REJECT')} className={`${btnGhost} border-down/40 text-down hover:border-down`}>
              ✕ Reject
            </button>
          </div>
          {msg && <div className={`mt-3 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${msg.ok ? 'border-up/35 bg-up/[0.06] text-sub' : 'border-down/35 bg-down/[0.06] text-sub'}`}>{msg.text}</div>}
        </div>
      </div>

      <article className="theme-light binder-doc mx-auto max-w-[820px] rounded-xl border border-slate-200 bg-white px-4 py-7 text-slate-900 shadow-2xl sm:px-12 sm:py-12">
        <header className="border-b-2 border-slate-900 pb-5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">{binder.generatedFor}</div>
          <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight">{binder.title}</h1>
          <div className="mt-1 text-[16px] text-slate-700">
            {binder.modelName} {binder.version}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 text-[12px] sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Model ID</dt>
              <dd className="num break-all font-medium">{binder.modelId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Generated</dt>
              <dd className="num font-medium">{now ? `${now.slice(0, 16).replace('T', ' ')} UTC` : ''}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Risk tier · owner</dt>
              <dd className="font-medium">
                Tier {model.spec.tier} · {model.spec.owner}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Binder lineage</dt>
              <dd className="num font-medium">{generated ? `Block #${generated.index} · ${shortHash(String(generated.detail.binder_hash), 6)}` : 'Not yet ledgered'}</dd>
            </div>
          </dl>
          <div className={`mt-5 rounded-lg border px-4 py-3 ${tone[binder.overall]}`}>
            <div className="text-[13.5px] font-semibold">
              {icon[binder.overall]} Validation outcome: {ragLabel(binder.overall)}
            </div>
            <div className="mt-0.5 text-[12.5px] text-slate-700">{binder.verdict}</div>
          </div>
          <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-slate-500">Independent validation decision</div>
              <div className="font-medium">{signLine ?? 'Pending'}</div>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="text-slate-500">Data notice</div>
              <div className="font-medium">Demonstration binder. The portfolio is synthetic.</div>
            </div>
          </div>
          <ol className="mt-5 grid gap-x-6 gap-y-1 text-[12px] text-slate-700 sm:grid-cols-2">
            {binder.sections.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-dotted border-slate-300 py-0.5">
                <span>
                  {s.number}. {s.title}
                </span>
                {s.rag && <span className={`shrink-0 text-[11px] font-semibold ${s.rag === 'pass' ? 'text-emerald-700' : s.rag === 'warn' ? 'text-amber-700' : 'text-red-700'}`}>{icon[s.rag]} {ragLabel(s.rag)}</span>}
              </li>
            ))}
          </ol>
        </header>
        {binder.sections.map((s) => (
          <section key={s.id} className="pt-8">
            <h2 className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-slate-300 pb-1.5 text-[17px] font-semibold tracking-tight">
              <span>
                {s.number}. {s.title}
              </span>
              {s.rag && <span className={`text-[11.5px] font-semibold ${s.rag === 'pass' ? 'text-emerald-700' : s.rag === 'warn' ? 'text-amber-700' : 'text-red-700'}`}>{icon[s.rag]} {ragLabel(s.rag)}</span>}
            </h2>
            <div className="mt-1.5 text-[10.5px] leading-snug text-slate-500">Regulatory mapping: {s.mapping.join(' · ')}</div>
            {s.blocks.map((b, i) => (
              <BlockView key={i} b={b} model={model} />
            ))}
          </section>
        ))}
        <footer className="mt-10 border-t border-slate-300 pt-4 text-[10.5px] leading-relaxed text-slate-500">
          Generated by the MRM Security Engine. Figures are computed deterministically from the ingested payload and the sandbox portfolio; no language model contributes text or numbers. The four-fifths ratio is a screening threshold and does not by itself establish compliance or non-compliance with ECOA / Regulation B.
        </footer>
      </article>
    </div>
  );
}
