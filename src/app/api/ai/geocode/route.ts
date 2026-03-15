import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { geocodeAddressFlow } from '@/ai/flows/geocode-address';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { address } = await req.json();
  if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 });

  try {
    const result = await geocodeAddressFlow({ address });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Geocode error:', error);
    return NextResponse.json({ error: error.message || 'Geocode failed' }, { status: 500 });
  }
}
