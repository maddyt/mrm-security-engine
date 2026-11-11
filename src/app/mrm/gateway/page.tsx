'use client';

import { useEffect, useMemo, useState } from 'react';
import { Help, PageHead, Panel, RagPill, btnGhost, btnPrimary, shortHash, td, th } from '@/components/mrm/kit';
import { useMrm } from '@/components/mrm/state';
import { PERMISSIONS, PRD_SAMPLE, ROLES, can, payloadFor, roleDef } from '@/lib/mrm/contract';

type Result = { status: number; ok: boolean; data: any; path: string; ms: number } | null;
const STEPS: { id: string; label: string; detail: string; fails: number[] }[] = [
  { id: 'authn', label: 'Identity', detail: 'Bearer token: signature, issuer, expiry', fails: [401] },
  { id: 'authz', label: 'Authorise', detail: 'Role entitlement for this endpoint', fails: [403] },
  { id: 'schema', label: 'Schema', detail: 'Payload against the published contract', fails: [422] },
  { id: 'hash', label: 'Hash', detail: 'Canonical SHA-256 execution hash', fails: [] },
  { id: 'ledger', label: 'Ledger', detail: 'Append a chained audit block', fails: [500] },
];

function decode(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export default function Gateway() {
  const { model, role, api, token } = useMrm();
  const sandbox = useMemo(() => JSON.stringify(payloadFor(model), null, 2), [model]);
  const [text, setText] = useState(sandbox);
  const [res, setRes] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [jwt, setJwt] = useState('');
  const [origin, setOrigin] = useState('https://your-deployment');
  useEffect(() => setText(sandbox), [sandbox]);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    setJwt('');
    token().then(setJwt).catch(() => setJwt(''));
  }, [token]);
  const claims = jwt ? decode(jwt) : null;

  const send = async (path: string) => {
    setBusy(true);
    const t = performance.now();
    try {
      const r = await api(path, { body: text });
      setRes({ ...r, path, ms: performance.now() - t });
    } catch (e) {
      setRes({ status: 0, ok: false, data: { error: e instanceof Error ? e.message : 'Network error' }, path, ms: performance.now() - t });
    }
    setBusy(false);
  };
  let valid = true;
  try {
    JSON.parse(text);
  } catch {
    valid = false;
  }
  const failedAt = res && !res.ok ? STEPS.findIndex((s) => s.fails.includes(res.status)) : -1;
  const curl = `TOKEN=$(curl -s -X POST ${origin}/api/v1/mrm/token \\
  -H 'content-type: application/json' \\
  -d '{"role":"${role}"}' | sed -E 's/.*"access_token":"([^"]+)".*/\\1/')

curl -s -X POST ${origin}/api/v1/mrm/ingest \\
  -H "authorization: Bearer $TOKEN" \\
  -H 'content-type: application/json' \\
  -d @payload.json`;

  return (
    <div>
      <PageHead title="Ingest & zero-trust gateway" lead="The only way in. A scorecard platform posts its outputs in an open JSON contract; nothing is processed until the caller is authenticated, entitled, and the payload is validated and hashed." right={<a className={btnGhost} href="/api/v1/mrm/openapi.json" target="_blank" rel="noreferrer">OpenAPI document</a>} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel
          title="Request payload"
          help="exechash"
          subtitle="Edit freely. Aggregates only: no applicant-level or protected data crosses the API."
          right={
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnGhost} onClick={() => setText(sandbox)}>
                Sandbox model
              </button>
              <button type="button" className={btnGhost} onClick={() => setText(JSON.stringify(PRD_SAMPLE, null, 2))}>
                PRD sample
              </button>
            </div>
          }
        >
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="JSON payload" className="num h-[560px] w-full resize-y rounded-xl border border-line bg-bg/70 p-3 text-[12px] leading-relaxed text-ink outline-none focus-visible:border-brand" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} disabled={busy || !valid} onClick={() => send('/api/v1/mrm/ingest')}>
              POST /ingest
            </button>
            <button type="button" className={btnGhost} disabled={busy || !valid} onClick={() => send('/api/v1/mrm/audit-binder/generate')}>
              POST /audit-binder/generate
            </button>
            <span className="text-[12px] text-mute">{valid ? `as ${role.replace(/_/g, ' ')}` : <span className="text-down">Not valid JSON</span>}</span>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="What the gateway did" help="zerotrust" subtitle={res ? `${res.path} · ${Math.round(res.ms)} ms` : 'Send a request to see each check.'} right={res && <RagPill rag={res.ok ? 'pass' : 'fail'} label={`HTTP ${res.status || 'error'}`} />}>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {STEPS.map((s, i) => {
                const state = !res ? 'idle' : res.ok || (failedAt >= 0 && i < failedAt) ? 'ok' : i === failedAt ? 'fail' : 'skipped';
                return (
                  <li key={s.id} title={s.detail} className={`rounded-lg border px-2.5 py-2 ${state === 'ok' ? 'border-up/35 bg-up/[0.06]' : state === 'fail' ? 'border-down/40 bg-down/[0.07]' : 'border-line bg-bg/40'}`}>
                    <div className={`text-[12px] font-semibold ${state === 'ok' ? 'text-up' : state === 'fail' ? 'text-down' : 'text-sub'}`}>
                      {state === 'ok' ? '✓ ' : state === 'fail' ? '✕ ' : ''}
                      {s.label}
                    </div>
                    <div className="mt-0.5 text-[10.5px] leading-snug text-mute">{s.detail}</div>
                  </li>
                );
              })}
            </ol>
            {res && !res.ok && (
              <div className="mt-3 rounded-xl border border-down/35 bg-down/[0.06] px-3.5 py-3 text-[12.5px] text-sub">
                <div className="font-semibold text-down">{res.data.error}</div>
                {res.status === 403 && <div className="mt-1">Required entitlement: <span className="num text-ink">{res.data.required_permission}</span>. The refusal was written to the ledger{res.data.ledger_block !== undefined ? ` as block #${res.data.ledger_block}` : ''}.</div>}
                {res.status === 422 && <pre className="num mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11.5px] text-mute">{JSON.stringify(res.data.detail, null, 1)}</pre>}
              </div>
            )}
            {res?.ok && (
              <div className="mt-3 space-y-3">
                <dl className="grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[10.5px] uppercase tracking-wider text-mute">Execution hash</dt>
                    <dd className="num text-ink" title={res.data.execution_hash}>{shortHash(res.data.execution_hash, 14)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10.5px] uppercase tracking-wider text-mute">Ledger block</dt>
                    <dd className="num text-ink">#{res.data.block.index} · {shortHash(res.data.block.hash, 8)}</dd>
                  </div>
                  {res.data.binder_hash && (
                    <div>
                      <dt className="text-[10.5px] uppercase tracking-wider text-mute">Binder hash</dt>
                      <dd className="num text-ink" title={res.data.binder_hash}>{shortHash(res.data.binder_hash, 14)}</dd>
                    </div>
                  )}
                  {res.data.scope && (
                    <div>
                      <dt className="text-[10.5px] uppercase tracking-wider text-mute">Scope</dt>
                      <dd className="text-ink">{res.data.scope === 'full' ? 'Full binder (sandbox model)' : 'Threshold checks only'}</dd>
                    </div>
                  )}
                </dl>
                {res.data.note && <p className="text-[12px] text-mute">{res.data.note}</p>}
                {res.data.payload_matches_registered_model === false && <p className="text-[12px] text-amber">! The payload differs from the registered model’s own figures. The binder reports the engine’s computed values; the mismatch is recorded in the ledger.</p>}
                <ul className="divide-y divide-line/50 rounded-xl border border-line">
                  {res.data.checks.map((c: { id: string; label: string; value: string; status: 'pass' | 'warn' | 'fail'; note: string }) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]">
                      <RagPill size="sm" rag={c.status} label={c.status === 'pass' ? 'Pass' : c.status === 'warn' ? 'Warn' : 'Fail'} />
                      <span className="font-medium text-ink">{c.label}</span>
                      <span className="num text-sub">{c.value}</span>
                      <span className="w-full text-[11.5px] leading-snug text-mute">{c.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel title="Your token" help="jwt" subtitle="Issued by the demo identity provider for the role selected in the top bar.">
            {claims ? (
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
                <dt className="text-mute">Subject</dt>
                <dd className="num truncate text-ink">{claims.sub}</dd>
                <dt className="text-mute">Role</dt>
                <dd className="num text-ink">{claims.role}</dd>
                <dt className="text-mute">Persona</dt>
                <dd className="text-ink">{roleDef(role).persona}</dd>
                <dt className="text-mute">Expires</dt>
                <dd className="num text-ink">{new Date(claims.exp * 1000).toLocaleTimeString()}</dd>
                <dt className="text-mute">Signature</dt>
                <dd className="num truncate text-ink">HS256 · {jwt.split('.')[2].slice(0, 22)}…</dd>
              </dl>
            ) : (
              <div className="text-[12.5px] text-mute">Requesting a token…</div>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Role entitlements" help="rbac" subtitle="Enforced on every route, server-side. Your current role is highlighted." pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-line/60">
                  <th className={th}>Action</th>
                  {ROLES.map((r) => (
                    <th key={r.role} className={`${th} text-center ${r.role === role ? 'text-ink' : ''}`}>
                      {r.role.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((p) => (
                  <tr key={p.id} className="border-b border-line/40 last:border-0">
                    <td className={td}>
                      <div className="text-ink">{p.label}</div>
                      <div className="num text-[11px] text-mute">{p.endpoint}</div>
                    </td>
                    {ROLES.map((r) => (
                      <td key={r.role} className={`${td} text-center ${r.role === role ? 'bg-brand/[0.07]' : ''}`}>
                        {can(r.role, p.id) ? <span className="font-semibold text-up" aria-label="Allowed">✓</span> : <span className="text-mute" aria-label="Not allowed">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Call it from a terminal" subtitle="Save the payload above as payload.json.">
          <pre className="num overflow-x-auto rounded-xl border border-line bg-bg/70 p-3 text-[11.5px] leading-relaxed text-sub">{curl}</pre>
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] leading-relaxed text-mute">
            Transport in a bank deployment: mutual TLS at the gateway and the institution’s own OAuth2 identity provider. The demo host cannot enforce client certificates, so it demonstrates the token, entitlement, schema, hash and ledger layers. <Help id="zerotrust" />
          </p>
        </Panel>
      </div>
    </div>
  );
}
