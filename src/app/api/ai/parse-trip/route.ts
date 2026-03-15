import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parseTripDetailsFlow } from '@/ai/flows/parse-trip-details';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message } = await req.json();
  if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

  try {
    const result = await parseTripDetailsFlow({ message });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Parse trip error:', error);
    return NextResponse.json({ error: error.message || 'Parse failed' }, { status: 500 });
  }
}
