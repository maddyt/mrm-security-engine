import { z } from 'zod';
import { canonical, sha256 } from '@/lib/mrm/chain';
import { Envelope, assess } from '@/lib/mrm/contract';
import { guarded, ok, problem, readJson } from '@/lib/mrm/server/http';
import { append } from '@/lib/mrm/server/ledger';

export const dynamic = 'force-dynamic';

// Stage 1: schema validation, canonical SHA-256 execution hash, ledger entry, threshold checks.
export async function POST(req: Request) {
  return guarded(req, 'model:ingest', async (claims) => {
    const parsed = Envelope.safeParse(await readJson(req));
    if (!parsed.success) return problem(422, 'Payload does not satisfy the contract', { detail: z.treeifyError(parsed.error) });
    const payload = parsed.data;
    const execution_hash = await sha256(canonical(payload));
    const checks = assess(payload);
    const block = await append({ actor: claims.sub, role: claims.role, event: 'PAYLOAD_INGESTED', model_id: payload.model_metadata.model_id, detail: { execution_hash, payload } });
    return ok({ model_id: payload.model_metadata.model_id, execution_hash, checks, block: { index: block.index, hash: block.hash, prev_hash: block.prev_hash, ts: block.ts } });
  });
}
