import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { extractOdometerReadingFlow } from '@/ai/flows/extract-odometer-reading';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { photoDataUri } = await req.json();
  if (!photoDataUri) return NextResponse.json({ error: 'Missing photoDataUri' }, { status: 400 });

  try {
    const result = await extractOdometerReadingFlow({ photoDataUri });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('OCR error:', error);
    return NextResponse.json({ error: error.message || 'OCR failed' }, { status: 500 });
  }
}
