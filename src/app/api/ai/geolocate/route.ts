import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { geolocateActionFlow } from '@/ai/flows/geolocate-action';
import { GeolocateRequestSchema } from '@/lib/validation';
import { validateRequestBody, handleValidationError } from '@/lib/validate';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { latitude, longitude } = validateRequestBody(GeolocateRequestSchema, body);

    const result = await geolocateActionFlow({ latitude, longitude });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Geolocate error:', err);
    return handleValidationError(err) || NextResponse.json({ error: err.message || 'Geolocate failed' }, { status: 500 });
  }
}
