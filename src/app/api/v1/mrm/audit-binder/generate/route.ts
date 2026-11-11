import { z } from 'zod';
import { binderMarkdown, buildBinder } from '@/lib/mrm/binder';
import { canonical, sha256 } from '@/lib/mrm/chain';
import { Envelope, assess, payloadFor } from '@/lib/mrm/contract';
import { buildModel, modelSpec, summarize } from '@/lib/mrm/engine';
import { guarded, ok, problem, readJson } from '@/lib/mrm/server/http';
import { append } from '@/lib/mrm/server/ledger';

export const dynamic = 'force-dynamic';

// Stages 2-4 in one call: fair lending, drift and threat tests, then the binder.
// Registered sandbox models get the full binder; any other contract-valid payload gets the
// threshold assessment (the engine has no applicant-level data for it, by design).
export async function POST(req: Request) {
  return guarded(req, 'binder:generate', async (claims) => {
    const t0 = performance.now();
    const parsed = Envelope.safeParse(await readJson(req));
    if (!parsed.success) return problem(422, 'Payload does not satisfy the contract', { detail: z.treeifyError(parsed.error) });
    const payload = parsed.data;
    const id = payload.model_metadata.model_id;
    const execution_hash = await sha256(canonical(payload));
    const checks = assess(payload);
    const spec = modelSpec(id);
    if (!spec) {
      const block = await append({ actor: claims.sub, role: claims.role, event: 'VALIDATION_RUN', model_id: id, detail: { execution_hash, scope: 'payload-only', checks } });
      return ok({ model_id: id, scope: 'payload-only', execution_hash, checks, binder_markdown: null, note: 'Model is not in the sandbox inventory. Threshold checks ran on the supplied aggregates; the full binder needs the sandbox portfolio.', block: { index: block.index, hash: block.hash }, elapsed_ms: Math.round(performance.now() - t0) });
    }
    const model = buildModel(spec);
    const binder = buildBinder(model);
    const summary = summarize(model);
    const generatedAt = new Date().toISOString();
    const body = binderMarkdown(binder, { generatedAt });
    const binder_hash = await sha256(body);
    const matches = canonical(payloadFor(model)) === canonical(payload);
    const block = await append({ actor: claims.sub, role: claims.role, event: 'BINDER_GENERATED', model_id: id, detail: { execution_hash, binder_hash, overall: summary.overall, ks: +summary.ks.toFixed(3), min_dir: +summary.minDir.toFixed(3), psi: +summary.psi.toFixed(3), payload_matches_registered_model: matches } });
    return ok({
      model_id: id,
      scope: 'full',
      execution_hash,
      binder_hash,
      payload_matches_registered_model: matches,
      summary,
      checks,
      binder_markdown: binderMarkdown(binder, { generatedAt, binderHash: binder_hash, ledgerBlock: block.index }),
      block: { index: block.index, hash: block.hash, prev_hash: block.prev_hash, ts: block.ts },
      elapsed_ms: Math.round(performance.now() - t0),
    });
  });
}
