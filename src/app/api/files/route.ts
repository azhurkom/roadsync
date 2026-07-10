import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';
import s3 from '@/lib/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';

// Max file size: 10 MB
const MAX_SIZE = 10 * 1024 * 1024;

// POST /api/files — upload a file, returns { id, url }
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique ID for database and S3 path
    const fileId = crypto.randomUUID();
    
    // Create clean S3 key: uploads/userId/fileId-filename
    const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `uploads/${userId}/${fileId}-${cleanFilename}`;

    // Upload to S3 (Backblaze B2)
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'kom18-storage',
      Key: s3Key,
      Body: buffer,
      ContentType: file.type || 'application/octet-stream',
    }));

    // Save metadata in database with nullable data and filled s3_key
    await pool.query(
      `INSERT INTO files (id, user_id, filename, mime_type, size_bytes, data, s3_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        fileId,
        userId,
        file.name,
        file.type || 'application/octet-stream',
        file.size,
        null, // data is null for S3 files
        s3Key
      ]
    );

    return NextResponse.json({ id: fileId, url: `/api/files/${fileId}` }, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('File upload error:', err);
    return NextResponse.json({ error: err.message || 'File upload failed' }, { status: 500 });
  }
}
