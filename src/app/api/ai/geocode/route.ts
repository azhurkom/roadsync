import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { geocodeAddressFlow } from '@/ai/flows/geocode-address';
import { GeocodeRequestSchema } from '@/lib/validation';
import { validateRequestBody, handleValidationError } from '@/lib/validate';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { address } = validateRequestBody(GeocodeRequestSchema, body);

    const result = await geocodeAddressFlow({ address });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Geocode error:', err);
    return handleValidationError(err) || NextResponse.json({ error: err.message || 'Geocode failed' }, { status: 500 });
  }
}
