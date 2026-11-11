import { isRole } from '@/lib/mrm/contract';
import { issueToken } from '@/lib/mrm/server/auth';
import { ok, problem, readJson } from '@/lib/mrm/server/http';

export const dynamic = 'force-dynamic';

// Demo identity provider. A real deployment swaps this for the bank's OAuth2 token endpoint.
export async function POST(req: Request) {
  const body = (await readJson(req)) as { role?: unknown } | undefined;
  if (!body || !isRole(body.role)) return problem(400, 'role must be one of Model_Developer, Independent_Validator, Executive_Auditor');
  return ok(issueToken(body.role));
}
