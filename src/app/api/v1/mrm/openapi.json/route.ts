import { NextResponse } from 'next/server';
import { openapi } from '@/lib/mrm/contract';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return NextResponse.json(openapi(new URL(req.url).origin));
}
