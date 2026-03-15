import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { geolocateActionFlow } from '@/ai/flows/geolocate-action';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { latitude, longitude } = await req.json();
  if (latitude === undefined || longitude === undefined)
    return NextResponse.json({ error: 'Missing latitude/longitude' }, { status: 400 });

  try {
    const result = await geolocateActionFlow({ latitude, longitude });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Geolocate error:', error);
    return NextResponse.json({ error: error.message || 'Geolocate failed' }, { status: 500 });
  }
}
