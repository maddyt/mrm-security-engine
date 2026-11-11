'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHead, Panel, RagPill, btnGhost, btnPrimary, shortHash } from '@/components/mrm/kit';
import { useMrm } from '@/components/mrm/state';
import { verifyChain, type Block, type Verification } from '@/lib/mrm/chain';

const EVENT: Record<string, { label: string; tone: string }> = {
  GENESIS: { label: 'Genesis', tone: 'text-mute' },
  MODEL_REGISTERED: { label: 'Model registered', tone: 'text-sub' },
  PAYLOAD_INGESTED: { label: 'Payload ingested', tone: 'text-[#8DB4FF]' },
  VALIDATION_RUN: { label: 'Validation run', tone: 'text-[#8DB4FF]' },
  BINDER_GENERATED: { label: 'Binder generated', tone: 'text-[#8DB4FF]' },
  SIGN_OFF: { label: 'Signed off', tone: 'text-up' },
  REJECTED: { label: 'Rejected', tone: 'text-down' },
  ACCESS_DENIED: { label: 'Access denied', tone: 'text-amber' },
};

export default function Ledger() {
  const { api } = useMrm();
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [store, setStore] = useState('');
  const [error, setError] = useState('');
  const [ver, setVer] = useState<Verification | null>(null);
  const [tampered, setTampered] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api('/api/v1/mrm/ledger');
      if (!r.ok) throw new Error(`${r.status}: ${r.data.error}`);
      setBlocks(r.data.blocks);
      setStore(r.data.store);
      setTampered(null);
      setVer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the ledger');
    }
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  const verify = async (list = blocks) => {
    if (!list) return;
    setBusy(true);
    setVer(await verifyChain(list));
    setBusy(false);
  };
  // Tampering is simulated on the browser's copy only. The stored ledger is never modified.
  const tamper = (index: number) => {
    if (!blocks) return;
    const next = blocks.map((b) => (b.index === index ? { ...b, actor: 'insider@demo-bank.example', detail: { ...b.detail, tampered: 'value altered after the fact' } } : b));
    setBlocks(next);
    setTampered(index);
    setOpen(index);
    verify(next);
  };

  const status = (i: number) => ver?.blocks.find((b) => b.index === i);
  return (
    <div>
      <PageHead title="Audit ledger" lead="Every ingest, validation run, binder, decision and refused request is a block. Each block’s SHA-256 hash covers its own contents and the previous block’s hash, so history cannot be edited quietly." right={<button type="button" className={btnGhost} onClick={load}>Reload</button>} />

      <Panel
        className={ver ? (ver.ok ? 'border-up/40' : 'border-down/50') : ''}
        title="Chain integrity"
        help="ledger"
        subtitle="Verification runs in your browser with Web Crypto: it recomputes every hash and link from the raw blocks instead of trusting the server."
        right={
          <div className="flex flex-wrap gap-2">
            {tampered !== null && (
              <button type="button" className={btnGhost} onClick={load}>
                Restore original
              </button>
            )}
            <button type="button" className={btnPrimary} onClick={() => verify()} disabled={!blocks || busy}>
              {busy ? 'Verifying…' : 'Verify chain'}
            </button>
          </div>
        }
      >
        {error ? (
          <div className="text-[13px] text-down">{error}</div>
        ) : !blocks ? (
          <div className="text-[13px] text-mute">Loading the ledger…</div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-mute">Blocks</div>
              <div className="num text-[22px] font-semibold text-ink">{blocks.length}</div>
              {blocks[0].index > 0 && <div className="text-[10.5px] text-mute">latest, from #{blocks[0].index}</div>}
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-mute">Head</div>
              <div className="num text-[13px] text-ink">{shortHash(blocks[blocks.length - 1].hash, 12)}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-mute">Store</div>
              <div className="text-[13px] text-ink">{store === 'supabase' ? 'Supabase Postgres (persistent)' : 'Server memory (resets on restart)'}</div>
            </div>
            <div className="min-w-[220px] flex-1">
              {ver ? (
                ver.ok ? (
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold text-up">
                    <RagPill rag="pass" label="Verified" /> All {ver.checked} blocks intact
                  </div>
                ) : (
                  <div className="text-[13px] text-sub">
                    <div className="flex items-center gap-2 font-semibold text-down">
                      <RagPill rag="fail" label="Chain broken" /> at block #{ver.brokenAt}
                    </div>
                    <div className="mt-1">{ver.reason}. Every later block is now untrusted.</div>
                  </div>
                )
              ) : (
                <div className="text-[12.5px] text-mute">Not verified yet. Press “Verify chain”, then try “Simulate tampering” on any block below.</div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {blocks && (
        <ol className="mt-5 space-y-0">
          {[...blocks].reverse().map((b, i, arr) => {
            const s = status(b.index);
            const ev = EVENT[b.event] ?? { label: b.event, tone: 'text-sub' };
            const bad = s && !s.ok;
            return (
              <li key={b.index} className="relative pl-7">
                <span className={`absolute left-[9px] top-0 w-px ${i === arr.length - 1 ? 'h-5' : 'h-full'} ${bad ? 'bg-down/60' : 'bg-line'}`} />
                <span className={`absolute left-[3px] top-[18px] h-[13px] w-[13px] rounded-full border-2 border-bg ${bad ? 'bg-down' : s?.ok ? 'bg-up' : 'bg-mute'}`} />
                <div className={`mb-2 rounded-xl border bg-panel/80 ${bad ? 'border-down/45' : 'border-line'}`}>
                  <button type="button" onClick={() => setOpen(open === b.index ? null : b.index)} aria-expanded={open === b.index} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left">
                    <span className="num w-9 text-[12px] text-mute">#{b.index}</span>
                    <span className={`w-[140px] text-[13px] font-semibold ${ev.tone}`}>{ev.label}</span>
                    <span className="num min-w-0 flex-1 truncate text-[12px] text-sub">{b.model_id !== '-' ? b.model_id : b.event === 'ACCESS_DENIED' ? String(b.detail.permission) : ''}</span>
                    <span className="hidden min-w-0 truncate text-[12px] text-mute md:block md:w-[250px]">
                      {b.actor} · {b.role.replace(/_/g, ' ')}
                    </span>
                    <span className="num text-[11.5px] text-mute">{new Date(b.ts).toISOString().replace('T', ' ').slice(0, 19)}Z</span>
                    <span className="num hidden w-[110px] text-right text-[11.5px] text-mute sm:block">{shortHash(b.hash, 6)}</span>
                  </button>
                  {open === b.index && (
                    <div className="border-t border-line/60 px-4 py-3 text-[12px]">
                      {bad && <div className="mb-2 font-medium text-down">✕ {s.reason}</div>}
                      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[110px_minmax(0,1fr)]">
                        <dt className="text-mute">Actor</dt>
                        <dd className="num break-all text-sub">{b.actor} ({b.role})</dd>
                        <dt className="text-mute">Block hash</dt>
                        <dd className="num break-all text-sub">{b.hash}</dd>
                        <dt className="text-mute">Previous hash</dt>
                        <dd className="num break-all text-sub">{b.prev_hash}</dd>
                        <dt className="text-mute">Payload hash</dt>
                        <dd className="num break-all text-sub">{b.payload_hash}</dd>
                      </dl>
                      <pre className="num mt-2 max-h-56 overflow-auto rounded-lg border border-line bg-bg/70 p-2.5 text-[11.5px] leading-relaxed text-sub">{JSON.stringify(b.detail, null, 2)}</pre>
                      {b.index > 0 && tampered === null && (
                        <button type="button" className={`${btnGhost} mt-2.5`} onClick={() => tamper(b.index)}>
                          Simulate tampering with this block
                        </button>
                      )}
                      {tampered === b.index && <div className="mt-2 text-amber">! This copy was altered in your browser to demonstrate detection. The stored ledger is unchanged; “Restore original” reloads it.</div>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
