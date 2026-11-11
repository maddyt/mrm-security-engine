'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Rag } from '@/lib/mrm/engine';
import { guideFor, term } from '@/lib/mrm/help';

export const RAG: Record<Rag, { label: string; text: string; chip: string; dot: string; icon: string }> = {
  pass: { label: 'Within policy', text: 'text-up', chip: 'border-up/35 bg-up/10 text-up', dot: 'bg-up', icon: '✓' },
  warn: { label: 'Monitor', text: 'text-amber', chip: 'border-amber/40 bg-amber/10 text-amber', dot: 'bg-amber', icon: '!' },
  fail: { label: 'Action required', text: 'text-down', chip: 'border-down/40 bg-down/10 text-down', dot: 'bg-down', icon: '✕' },
};

export function RagPill({ rag, label, size = 'md' }: { rag: Rag; label?: string; size?: 'sm' | 'md' }) {
  const r = RAG[rag];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${r.chip} ${size === 'sm' ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-0.5 text-[11.5px]'}`}>
      <span aria-hidden className="text-[10px] font-bold leading-none">
        {r.icon}
      </span>
      {label ?? r.label}
    </span>
  );
}

/** "?" button that opens a short definition and links to the full entry in Help & Docs. */
export function Help({ id, className = '' }: { id: string; className?: string }) {
  const t = term(id);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && (e.target as HTMLElement).closest('[data-help-pop]')) return;
      setPos(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);
  if (!t) return null;
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 24);
    setPos({ left: Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)), top: r.bottom + 8 });
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`What is ${t.term}?`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => (pos ? setPos(null) : open())}
        className={`no-print inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border border-line align-middle text-[10px] font-semibold leading-none text-mute transition hover:border-brand hover:text-ink ${className}`}
      >
        ?
      </button>
      {pos && (
        <div data-help-pop role="dialog" aria-label={t.term} className="fixed z-50 rounded-xl border border-line bg-raised p-4 text-left text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-sub shadow-2xl" style={{ left: pos.left, top: Math.min(pos.top, window.innerHeight - 260), width: Math.min(320, window.innerWidth - 24) }}>
          <div className="mb-1 text-[13px] font-semibold text-ink">{t.term}</div>
          <p>{t.short}</p>
          {t.formula && <div className="num mt-2 rounded-md bg-bg/70 px-2.5 py-1.5 text-[11.5px] text-ink">{t.formula}</div>}
          {t.thresholds && (
            <dl className="mt-2 space-y-0.5">
              {t.thresholds.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="num w-[86px] shrink-0 text-ink">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <Link href={`/mrm/help#${t.id}`} className="mt-2.5 inline-block text-[12px] font-medium text-[#8DB4FF] hover:underline">
            More in Help &amp; Docs →
          </Link>
        </div>
      )}
    </>
  );
}

export function Panel({ title, help, subtitle, right, children, className = '', pad = true }: { title?: ReactNode; help?: string; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-panel/80 ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold tracking-tight text-ink">
              {title}
              {help && <Help id={help} />}
            </h3>
            {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-mute">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

export function Kpi({ label, help, value, sub, rag }: { label: string; help?: string; value: ReactNode; sub?: ReactNode; rag?: Rag }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-panel/80 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-mute">
        <span className="truncate">{label}</span>
        {help && <Help id={help} />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="num text-[24px] font-semibold leading-none text-ink">{value}</span>
        {rag && <RagPill rag={rag} size="sm" />}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-mute">{sub}</div>}
    </div>
  );
}

/** Page title plus a collapsible "what is this page, what to try" guide from the help content. */
export function PageHead({ title, lead, right }: { title: string; lead: ReactNode; right?: ReactNode }) {
  const path = usePathname() ?? '';
  const g = guideFor(path);
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {g && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8DB4FF]">{g.stage}</div>}
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-sub">{lead}</p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {right}
          {g && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="no-print rounded-lg border border-line bg-panel px-3 py-1.5 text-[12px] font-medium text-sub hover:border-brand/60 hover:text-ink">
              {open ? 'Hide guide' : 'How to use this page'}
            </button>
          )}
        </div>
      </div>
      {g && open && (
        <div className="no-print mt-3 grid gap-4 rounded-2xl border border-brand/30 bg-brand/[0.06] p-4 text-[12.5px] leading-relaxed text-sub sm:grid-cols-[1.1fr_1fr] sm:p-5">
          <div>
            <div className="mb-1 font-semibold text-ink">What this page shows</div>
            <p>{g.what}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {g.terms.map((id) => (
                <Link key={id} href={`/mrm/help#${id}`} className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-sub hover:text-ink">
                  {term(id)?.term}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold text-ink">Things to try</div>
            <ol className="list-decimal space-y-1 pl-4">
              {g.try.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export function Finding({ rag, title, children }: { rag: Rag; title: string; children: ReactNode }) {
  const r = RAG[rag];
  return (
    <div className={`rounded-xl border px-4 py-3 ${rag === 'pass' ? 'border-up/30 bg-up/[0.06]' : rag === 'warn' ? 'border-amber/35 bg-amber/[0.07]' : 'border-down/35 bg-down/[0.07]'}`}>
      <div className={`flex items-center gap-2 text-[13px] font-semibold ${r.text}`}>
        <span aria-hidden className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-bg ${r.dot}`}>
          {r.icon}
        </span>
        {title}
      </div>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-sub">{children}</div>
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, fmt, help, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; help?: string; hint?: string }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-3 text-[12px] text-sub">
        <span className="flex items-center gap-1.5">
          {label}
          {help && <Help id={help} />}
        </span>
        <span className="num text-[13px] font-semibold text-ink">{fmt(value)}</span>
      </div>
      <input type="range" className="slider mt-1" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--fill' as string]: `${((value - min) / (max - min)) * 100}%` }} aria-label={label} />
      {hint && <div className="text-[11px] text-mute">{hint}</div>}
    </label>
  );
}

export const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
export const btnPrimary = `${btn} bg-brand text-white hover:bg-[#1D4ED8]`;
export const btnGhost = `${btn} border border-line bg-panel text-sub hover:border-brand/60 hover:text-ink`;
export const th = 'px-3 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-mute';
export const td = 'px-3 py-2 text-[12.5px] text-sub';
export const tdn = 'num px-3 py-2 text-right text-[12.5px] text-sub';
export const thn = `${th} text-right`;

export const shortHash = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-6)}` : h);
