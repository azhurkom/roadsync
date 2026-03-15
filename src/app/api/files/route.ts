import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';

// Max file size: 10 MB
const MAX_SIZE = 10 * 1024 * 1024;

// POST /api/files — upload a file, returns { id, url }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { rows } = await pool.query(
    `INSERT INTO files (user_id, filename, mime_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, file.name, file.type || 'application/octet-stream', file.size, buffer]
  );

  const id = rows[0].id;
  return NextResponse.json({ id, url: `/api/files/${id}` }, { status: 201 });
}
