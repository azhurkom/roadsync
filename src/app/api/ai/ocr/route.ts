import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { extractOdometerReadingFlow } from '@/ai/flows/extract-odometer-reading';
import { OcrRequestSchema } from '@/lib/validation';
import { validateRequestBody, handleValidationError } from '@/lib/validate';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { photoDataUri } = validateRequestBody(OcrRequestSchema, body);

    const result = await extractOdometerReadingFlow({ photoDataUri });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('OCR error:', err);
    return handleValidationError(err) || NextResponse.json({ error: err.message || 'OCR failed' }, { status: 500 });
  }
}
