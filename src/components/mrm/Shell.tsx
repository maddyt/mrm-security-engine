'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MODELS } from '@/lib/mrm/engine';
import { ROLES, roleDef, type Role } from '@/lib/mrm/contract';
import { useMrm } from './state';

const NAV: { group: string; items: { href: string; label: string; stage?: string }[] }[] = [
  { group: '', items: [{ href: '/mrm', label: 'Overview' }] },
  {
    group: 'Validation workflow',
    items: [
      { href: '/mrm/gateway', label: 'Ingest & Gateway', stage: '1' },
      { href: '/mrm/performance', label: 'Performance & XAI', stage: '2' },
      { href: '/mrm/fair-lending', label: 'Fair Lending', stage: '2' },
      { href: '/mrm/drift', label: 'Drift & Stability', stage: '3' },
      { href: '/mrm/security', label: 'Security & Threats', stage: '3' },
      { href: '/mrm/binder', label: 'Audit Binder', stage: '4' },
    ],
  },
  { group: 'Assurance', items: [{ href: '/mrm/ledger', label: 'Audit Ledger' }] },
  { group: 'Support', items: [{ href: '/mrm/help', label: 'Help & Docs' }] },
];

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0F1A33" />
      <path d="M16 5.5l8.5 3.2v6.6c0 5.2-3.5 9.3-8.5 11.2-5-1.9-8.5-6-8.5-11.2V8.7L16 5.5z" fill="none" stroke="#3B82F6" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11.8 16.2l3 3 5.6-6.2" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const select = 'h-9 min-w-0 max-w-full rounded-lg border border-line bg-panel pl-2.5 pr-7 text-[12.5px] font-medium text-ink outline-none transition hover:border-brand/60 focus-visible:border-brand';

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/mrm';
  const { modelId, setModelId, role, setRole } = useMrm();
  const active = (href: string) => (href === '/mrm' ? path === '/mrm' : path.startsWith(href));
  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
          <Link href="/mrm" className="flex shrink-0 items-center gap-2.5" aria-label="MRM Security Engine home">
            <Mark />
            <span className="hidden leading-tight sm:block">
              <span className="block text-[14px] font-semibold tracking-tight text-ink">MRM Security Engine</span>
              <span className="block text-[10.5px] text-mute">US enterprise adapter · SR 11-7 · ECOA · OWASP LLM</span>
            </span>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <label className="flex min-w-0 items-center gap-2">
              <span className="hidden text-[11px] uppercase tracking-wider text-mute md:inline">Model</span>
              <select aria-label="Model under validation" className={`${select} w-[150px] sm:w-[300px]`} value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.version}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2">
              <span className="hidden text-[11px] uppercase tracking-wider text-mute md:inline">Signed in as</span>
              <select aria-label="Role" title={roleDef(role).blurb} className={`${select} w-[128px] sm:w-[190px]`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.role.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line/60 px-3 py-1.5 lg:hidden" aria-label="Sections">
          {NAV.flatMap((g) => g.items).map((i) => (
            <Link key={i.href} href={i.href} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${active(i.href) ? 'bg-raised text-ink ring-1 ring-line' : 'text-mute'}`}>
              {i.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="no-print sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[232px] shrink-0 overflow-y-auto border-r border-line/70 px-3 py-5 lg:block">
          {NAV.map((g) => (
            <div key={g.group} className="mb-4">
              {g.group && <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">{g.group}</div>}
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined} className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${active(i.href) ? 'bg-raised text-ink ring-1 ring-line' : 'text-sub hover:bg-panel hover:text-ink'}`}>
                  {i.stage ? <span className={`num flex h-[18px] w-[18px] items-center justify-center rounded-md text-[10px] font-semibold ${active(i.href) ? 'bg-brand text-white' : 'bg-line/70 text-sub'}`}>{i.stage}</span> : <span className={`ml-[5px] mr-[5px] h-2 w-2 rounded-full ${active(i.href) ? 'bg-brand' : 'bg-line'}`} />}
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="mt-6 rounded-xl border border-line bg-panel/70 p-3 text-[11.5px] leading-relaxed text-mute">
            <div className="mb-1 font-semibold text-sub">Demonstration build</div>
            Synthetic portfolio. Built independently against an open JSON contract, with no access to Corestrat systems.
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
