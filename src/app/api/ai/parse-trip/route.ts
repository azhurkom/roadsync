import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parseTripDetailsFlow } from '@/ai/flows/parse-trip-details';
import { ParseTripRequestSchema } from '@/lib/validation';
import { validateRequestBody, handleValidationError } from '@/lib/validate';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { message } = validateRequestBody(ParseTripRequestSchema, body);

    const result = await parseTripDetailsFlow({ message });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Parse trip error:', err);
    return handleValidationError(err) || NextResponse.json({ error: err.message || 'Parse failed' }, { status: 500 });
  }
}
