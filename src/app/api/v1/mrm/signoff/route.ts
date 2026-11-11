import { buildBinder } from '@/lib/mrm/binder';
import { buildModel, modelSpec } from '@/lib/mrm/engine';
import { guarded, ok, problem, readJson } from '@/lib/mrm/server/http';
import { append } from '@/lib/mrm/server/ledger';

export const dynamic = 'force-dynamic';

// Independent validation decision. Only Independent_Validator holds validation:signoff.
export async function POST(req: Request) {
  return guarded(req, 'validation:signoff', async (claims) => {
    const body = (await readJson(req)) as { model_id?: unknown; decision?: unknown; comment?: unknown } | undefined;
    const spec = typeof body?.model_id === 'string' ? modelSpec(body.model_id) : undefined;
    if (!spec) return problem(422, 'model_id is not in the model inventory');
    if (body?.decision !== 'APPROVE' && body?.decision !== 'REJECT') return problem(422, 'decision must be APPROVE or REJECT');
    const overall = buildBinder(buildModel(spec)).overall;
    const comment = typeof body.comment === 'string' ? body.comment.slice(0, 500) : '';
    const block = await append({ actor: claims.sub, role: claims.role, event: body.decision === 'APPROVE' ? 'SIGN_OFF' : 'REJECTED', model_id: spec.id, detail: { decision: body.decision, comment, validation_outcome: overall } });
    return ok({ model_id: spec.id, decision: body.decision, block });
  });
}
