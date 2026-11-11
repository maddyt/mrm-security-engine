'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MODELS, buildModel, type Model } from '@/lib/mrm/engine';
import { isRole, type Role } from '@/lib/mrm/contract';

interface Ctx {
  modelId: string;
  setModelId: (id: string) => void;
  model: Model;
  role: Role;
  setRole: (r: Role) => void;
  /** Call the gateway as the current role. Fetches and caches a signed token as needed. */
  api: (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; ok: boolean; data: any }>;
  token: () => Promise<string>;
}

const C = createContext<Ctx | null>(null);
export const useMrm = () => {
  const c = useContext(C);
  if (!c) throw new Error('useMrm outside MrmProvider');
  return c;
};

const store = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* private mode: selection just does not persist */
    }
  },
};

export function MrmProvider({ children }: { children: ReactNode }) {
  const [modelId, setModel] = useState(MODELS[0].id);
  const [role, setRoleState] = useState<Role>('Model_Developer');
  const tokens = useRef(new Map<Role, { token: string; exp: number }>());

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('m');
    const m = q ?? store.get('mrm:model');
    if (m && MODELS.some((x) => x.id === m)) setModel(m);
    const r = store.get('mrm:role');
    if (isRole(r)) setRoleState(r);
  }, []);

  const setModelId = useCallback((id: string) => {
    setModel(id);
    store.set('mrm:model', id);
  }, []);
  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    store.set('mrm:role', r);
  }, []);

  const token = useCallback(async () => {
    const hit = tokens.current.get(role);
    if (hit && hit.exp > Date.now() + 30_000) return hit.token;
    const res = await fetch('/api/v1/mrm/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? 'Could not obtain a token');
    tokens.current.set(role, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
    return j.access_token as string;
  }, [role]);

  const api = useCallback<Ctx['api']>(
    async (path, init = {}) => {
      const t = await token();
      const res = await fetch(path, { method: init.method ?? (init.body === undefined ? 'GET' : 'POST'), headers: { authorization: `Bearer ${t}`, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) }, body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body), cache: 'no-store' });
      const data = await res.json().catch(() => ({ error: 'Gateway returned a non-JSON response' }));
      return { status: res.status, ok: res.ok, data };
    },
    [token],
  );

  const model = useMemo(() => buildModel(MODELS.find((m) => m.id === modelId) ?? MODELS[0]), [modelId]);
  const value = useMemo(() => ({ modelId, setModelId, model, role, setRole, api, token }), [modelId, setModelId, model, role, setRole, api, token]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
