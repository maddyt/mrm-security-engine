import 'server-only';
import { supabase } from '../../supabase.ts';
import { seal, type Block, type BlockInput } from '../chain.ts';
import { MODELS, buildModel } from '../engine.ts';
import { payloadFor } from '../contract.ts';

// Hash-chained audit ledger. With Supabase the chain lives in public.mrm_ledger (supabase/migrations/0001_mrm_ledger.sql)
// and survives deployments; without it the chain is held in memory so the demo still works.
// Blocks are append-only: the table has no update or delete path in this codebase, and the
// chain makes any out-of-band edit detectable.

const TABLE = 'mrm_ledger';
const WINDOW = 500; // the portal shows and verifies the most recent blocks
const MAX_BLOCKS = 20_000; // public demo: stop accepting writes rather than grow without bound
const g = globalThis as { __mrmLedger?: Block[]; __mrmLedgerDb?: boolean };

export type LedgerStore = 'supabase' | 'memory';

async function seedBlocks(): Promise<Block[]> {
  const out: Block[] = [];
  let prev: Block | null = null;
  const push = async (input: BlockInput, ts: string) => {
    prev = await seal(prev, input, ts);
    out.push(prev);
  };
  await push({ actor: 'system', role: 'system', event: 'GENESIS', model_id: '-', detail: { note: 'MRM Security Engine audit ledger initialised', chain: 'SHA-256' } }, '2026-11-01T09:00:00.000Z');
  let day = 2;
  for (const spec of MODELS) {
    await push({ actor: 'wrapper-api@corestrat.example', role: 'Model_Developer', event: 'MODEL_REGISTERED', model_id: spec.id, detail: { name: spec.name, version: spec.version, tier: spec.tier, owner: spec.owner, payload: payloadFor(buildModel(spec)) } }, `2026-11-0${day++}T10:15:00.000Z`);
  }
  return out;
}

async function loadDb(): Promise<Block[] | null> {
  const db = supabase();
  if (!db || g.__mrmLedgerDb === false) return null;
  const { data, error } = await db.from(TABLE).select('index, ts, actor, role, event, model_id, detail, payload_hash, prev_hash, hash').order('index', { ascending: false }).limit(WINDOW);
  if (error) {
    g.__mrmLedgerDb = false; // table missing or unreachable: fall back to memory for this instance
    return null;
  }
  const rows = (data ?? []).map((r) => ({ ...r, index: Number(r.index), ts: new Date(r.ts).toISOString() })).reverse() as Block[];
  if (rows.length) return rows;
  const seed = await seedBlocks();
  const ins = await db.from(TABLE).insert(seed);
  if (ins.error && ins.error.code !== '23505') return null; // 23505: another instance seeded first, which is fine
  return seed;
}

export async function readLedger(): Promise<{ blocks: Block[]; store: LedgerStore }> {
  const db = await loadDb();
  if (db) return { blocks: db, store: 'supabase' };
  g.__mrmLedger ??= await seedBlocks();
  return { blocks: g.__mrmLedger, store: 'memory' };
}

export async function append(input: BlockInput): Promise<Block> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { blocks, store } = await readLedger();
    if (blocks[blocks.length - 1].index >= MAX_BLOCKS) throw new Error('The demo ledger is full');
    const block = await seal(blocks[blocks.length - 1], input);
    if (store === 'memory') {
      g.__mrmLedger = [...blocks.slice(-(WINDOW - 1)), block];
      return block;
    }
    // The primary key on index makes concurrent appends race safely: the loser re-reads and re-seals.
    const { error } = await supabase()!.from(TABLE).insert(block);
    if (!error) return block;
    if (error.code !== '23505') throw new Error(`Ledger write failed: ${error.message}`);
  }
  throw new Error('Ledger is busy, try again');
}

export interface Signoff {
  decision: 'APPROVE' | 'REJECT';
  by: string;
  at: string;
  comment: string;
  block: number;
}
export function signoffs(blocks: Block[]): Record<string, Signoff> {
  const out: Record<string, Signoff> = {};
  for (const b of blocks) if (b.event === 'SIGN_OFF' || b.event === 'REJECTED') out[b.model_id] = { decision: b.event === 'SIGN_OFF' ? 'APPROVE' : 'REJECT', by: b.actor, at: b.ts, comment: String(b.detail.comment ?? ''), block: b.index };
  return out;
}
