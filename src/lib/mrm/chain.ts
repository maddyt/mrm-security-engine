// Hash-chained audit ledger primitives. Isomorphic: the same code seals blocks on the server
// and re-verifies the whole chain in the visitor's browser (Web Crypto), so the portal never
// asks anyone to take the server's word for integrity.

export type LedgerEvent = 'GENESIS' | 'MODEL_REGISTERED' | 'PAYLOAD_INGESTED' | 'VALIDATION_RUN' | 'BINDER_GENERATED' | 'SIGN_OFF' | 'REJECTED' | 'ACCESS_DENIED';

export interface Block {
  index: number;
  ts: string;
  actor: string;
  role: string;
  event: LedgerEvent;
  model_id: string;
  detail: Record<string, unknown>;
  payload_hash: string;
  prev_hash: string;
  hash: string;
}
export type BlockInput = Pick<Block, 'actor' | 'role' | 'event' | 'model_id' | 'detail'>;

export const GENESIS_PREV = '0'.repeat(64);

/** JSON with object keys sorted recursively, so the same content always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

export async function sha256(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const header = (b: Omit<Block, 'hash' | 'detail'>) => [b.index, b.ts, b.actor, b.role, b.event, b.model_id, b.payload_hash, b.prev_hash].join('|');

/** Seal a new block onto the chain that currently ends at `prev` (null for the genesis block). */
export async function seal(prev: Pick<Block, 'index' | 'hash'> | null, input: BlockInput, ts = new Date().toISOString()): Promise<Block> {
  const payload_hash = await sha256(canonical(input.detail));
  const base = { index: prev ? prev.index + 1 : 0, ts, actor: input.actor, role: input.role, event: input.event, model_id: input.model_id, payload_hash, prev_hash: prev ? prev.hash : GENESIS_PREV };
  return { ...base, detail: input.detail, hash: await sha256(header(base)) };
}

export interface Verification {
  ok: boolean;
  checked: number;
  /** Index of the first block that fails, or -1. */
  brokenAt: number;
  reason: string;
  blocks: { index: number; ok: boolean; reason?: string }[];
}

/** Recompute every digest and link. Any edit to any field of any block breaks the chain from there on. */
export async function verifyChain(blocks: Block[]): Promise<Verification> {
  const out: Verification['blocks'] = [];
  let brokenAt = -1;
  let reason = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    let why: string | undefined;
    if (b.index !== (i === 0 ? blocks[0].index : blocks[i - 1].index + 1)) why = 'Block index is out of sequence';
    else if ((await sha256(canonical(b.detail))) !== b.payload_hash) why = 'Payload digest does not match the recorded detail';
    else if ((await sha256(header(b))) !== b.hash) why = 'Block hash does not match its header fields';
    else if (i === 0 ? b.index === 0 && b.prev_hash !== GENESIS_PREV : b.prev_hash !== blocks[i - 1].hash) why = 'Link to the previous block is broken';
    if (brokenAt >= 0 && !why) why = `Follows altered block #${blocks[brokenAt].index}`;
    if (why && brokenAt < 0) {
      brokenAt = i;
      reason = why;
    }
    out.push({ index: b.index, ok: !why, reason: why });
  }
  return { ok: brokenAt < 0, checked: blocks.length, brokenAt: brokenAt < 0 ? -1 : blocks[brokenAt].index, reason, blocks: out };
}
