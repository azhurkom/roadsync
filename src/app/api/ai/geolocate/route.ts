import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GeolocateRequestSchema } from '@/lib/validation';
import { validateRequestBody, handleValidationError } from '@/lib/validate';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { latitude, longitude } = validateRequestBody(GeolocateRequestSchema, body);

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=de`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RoadSync/1.0' }
    });
    if (!res.ok) throw new Error('Nominatim request failed');
    const data = await res.json();

    const addr = data.address || {};
    // Від найдрібнішого до найбільшого
    const city =
      addr.village ||
      addr.hamlet ||
      addr.town ||
      addr.city ||
      addr.county ||
      addr.state ||
      'Невідомо';

    return NextResponse.json({ city });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Geolocate error:', err);
    return handleValidationError(err) || NextResponse.json({ error: err.message || 'Geolocate failed' }, { status: 500 });
  }
}
