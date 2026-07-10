import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';
import s3 from '@/lib/s3';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// GET /api/files/[id] — stream file back to client
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const { id } = await params;

    const { rows } = await pool.query(
      `SELECT filename, mime_type, data, s3_key FROM files WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { filename, mime_type, data, s3_key } = rows[0];

    if (s3_key) {
      // Fetch file from Backblaze B2 S3
      const s3Response = await s3.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || 'kom18-storage',
        Key: s3_key,
      }));

      if (!s3Response.Body) {
        return NextResponse.json({ error: 'Empty file body in storage' }, { status: 500 });
      }

      // Convert S3 stream to byte array to stream safely across environments
      const fileBuffer = await s3Response.Body.transformToByteArray();

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': mime_type,
          'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
          'Cache-Control': 'private, max-age=31536000',
        },
      });
    }

    // Fallback to PostgreSQL BYTEA for legacy files
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': mime_type,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'private, max-age=31536000',
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('File retrieval error:', err);
    return NextResponse.json({ error: err.message || 'File retrieval failed' }, { status: 500 });
  }
}

// DELETE /api/files/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const { id } = await params;

    // Fetch s3_key to delete from Backblaze B2 S3 if it exists
    const { rows } = await pool.query(
      `SELECT s3_key FROM files WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { s3_key } = rows[0];

    if (s3_key) {
      // Delete from S3
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || 'kom18-storage',
        Key: s3_key,
      }));
    }

    // Delete from DB (both metadata for S3 files and full data for legacy files)
    await pool.query(`DELETE FROM files WHERE id = $1 AND user_id = $2`, [id, userId]);
    
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('File deletion error:', err);
    return NextResponse.json({ error: err.message || 'File deletion failed' }, { status: 500 });
  }
}
