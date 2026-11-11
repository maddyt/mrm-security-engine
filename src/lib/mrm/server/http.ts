import 'server-only';
import { NextResponse } from 'next/server';
import type { Permission } from '../contract.ts';
import { AuthError, authorize, type Claims } from './auth.ts';
import { append } from './ledger.ts';

export const problem = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: { 'cache-control': 'no-store', ...(status === 401 ? { 'www-authenticate': 'Bearer' } : {}) } });
export const ok = (body: unknown) => NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });

/** Zero-trust wrapper: authenticate, authorise, then run. Entitlement denials are themselves ledgered. */
export async function guarded(req: Request, permission: Permission, run: (claims: Claims) => Promise<Response>): Promise<Response> {
  let claims: Claims;
  try {
    claims = authorize(req, permission);
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    if (e.status === 403 && e.claims) {
      const block = await append({ actor: e.claims.sub, role: e.claims.role, event: 'ACCESS_DENIED', model_id: '-', detail: { permission, path: new URL(req.url).pathname } }).catch(() => null);
      return problem(403, e.message, { required_permission: permission, ledger_block: block?.index });
    }
    return problem(e.status, e.message);
  }
  try {
    return await run(claims);
  } catch (e) {
    return problem(500, e instanceof Error ? e.message : 'Unexpected error');
  }
}

export async function readJson(req: Request): Promise<unknown | undefined> {
  const text = await req.text();
  if (text.length > 200_000) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
