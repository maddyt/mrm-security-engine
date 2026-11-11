import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { can, isRole, roleDef, type Permission, type Role } from '../contract.ts';

// Demo identity provider + verifier. Tokens are real HS256 JSON Web Signatures and every API
// route verifies signature, expiry, issuer and role before doing any work. In a bank deployment
// this module is replaced by the institution's IdP (OAuth2 client credentials, RS256/ES256 via
// JWKS) behind an mTLS-terminating gateway; the entitlement check below stays the same.

const ISSUER = 'mrm-security-engine-demo';
const TTL = 3600;

function secret(): string {
  // Set MRM_JWT_SECRET in production. The fallbacks keep a zero-config demo working: the
  // demo issuer hands a token to anyone who asks, so the secret protects integrity, not access.
  return process.env.MRM_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'mrm-demo-signing-key-not-for-production';
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');

export interface Claims {
  iss: string;
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

export function issueToken(role: Role): { access_token: string; token_type: 'Bearer'; expires_in: number; role: Role; sub: string } {
  const now = Math.floor(Date.now() / 1000);
  const claims: Claims = { iss: ISSUER, sub: roleDef(role).who, role, iat: now, exp: now + TTL };
  const head = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify(claims))}`;
  return { access_token: `${head}.${sign(head)}`, token_type: 'Bearer', expires_in: TTL, role, sub: claims.sub };
}

export class AuthError extends Error {
  status: 401 | 403;
  claims?: Claims;
  permission?: Permission;
  constructor(status: 401 | 403, message: string, claims?: Claims, permission?: Permission) {
    super(message);
    this.status = status;
    this.claims = claims;
    this.permission = permission;
  }
}

export function verifyToken(token: string): Claims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError(401, 'Malformed bearer token');
  const [h, p, s] = parts;
  let header: { alg?: string };
  let claims: Claims;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString());
    claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    throw new AuthError(401, 'Malformed bearer token');
  }
  if (header.alg !== 'HS256') throw new AuthError(401, 'Unsupported signing algorithm'); // rejects alg:none downgrade
  const a = Buffer.from(s);
  const b = Buffer.from(sign(`${h}.${p}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AuthError(401, 'Token signature is invalid');
  if (claims.iss !== ISSUER) throw new AuthError(401, 'Unknown token issuer');
  if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000) throw new AuthError(401, 'Token has expired');
  if (!isRole(claims.role)) throw new AuthError(401, 'Token carries no recognised role');
  return claims;
}

/** Authenticate the request and require one entitlement. Throws AuthError (401 or 403). */
export function authorize(req: Request, permission: Permission): Claims {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) throw new AuthError(401, 'Missing bearer token. Request one from POST /api/v1/mrm/token.');
  const claims = verifyToken(m[1].trim());
  if (!can(claims.role, permission)) throw new AuthError(403, `Role ${claims.role} is not entitled to ${permission}`, claims, permission);
  return claims;
}
