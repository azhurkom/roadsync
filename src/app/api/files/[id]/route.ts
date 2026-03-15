import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';

// GET /api/files/[id] — stream file back to client
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;

  const { rows } = await pool.query(
    `SELECT filename, mime_type, data FROM files WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { filename, mime_type, data } = rows[0];

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': mime_type,
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'private, max-age=31536000',
    },
  });
}

// DELETE /api/files/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;

  await pool.query(`DELETE FROM files WHERE id = $1 AND user_id = $2`, [id, userId]);
  return NextResponse.json({ ok: true });
}
