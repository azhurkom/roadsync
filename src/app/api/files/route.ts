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

    // Generate unique ID for database
    const fileId = crypto.randomUUID();
    
    // Extract file extension and map .jpg -> .jpeg
    let ext = '.jpeg';
    const parts = file.name.split('.');
    if (parts.length > 1) {
      const fileExt = parts.pop()?.toLowerCase();
      if (fileExt === 'jpg') {
        ext = '.jpeg';
      } else if (fileExt) {
        ext = `.${fileExt}`;
      }
    }

    // Generate date-based parts
    const date = new Date();
    const yyyy = date.getUTCFullYear().toString();
    const yy = yyyy.slice(-2);
    const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = date.getUTCDate().toString().padStart(2, '0');
    const datePrefix = `roadsync/${yyyy}/${yy}${mm}${dd}`;

    // Query database to find existing keys for today
    const { rows } = await pool.query(
      `SELECT s3_key FROM files WHERE s3_key LIKE $1`,
      [`${datePrefix}%`]
    );

    const existingNns = rows
      .map(r => {
        const key = r.s3_key || '';
        const match = key.match(/roadsync\/\d{4}\/\d{6}(\d{2})\./);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(nn => nn > 0);

    const maxNn = existingNns.length > 0 ? Math.max(...existingNns) : 0;
    const nextNn = (maxNn + 1).toString().padStart(2, '0');
    const s3Key = `${datePrefix}${nextNn}${ext}`;

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
