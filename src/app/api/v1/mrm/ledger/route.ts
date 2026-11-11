import { guarded, ok } from '@/lib/mrm/server/http';
import { readLedger, signoffs } from '@/lib/mrm/server/ledger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return guarded(req, 'ledger:read', async () => {
    const { blocks, store } = await readLedger();
    return ok({ store, count: blocks.length, signoffs: signoffs(blocks), blocks });
  });
}
