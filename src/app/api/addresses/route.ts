import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';

function mapAddress(r: any) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    address: r.address,
    entryLatitude: r.entry_latitude,
    entryLongitude: r.entry_longitude,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

// GET /api/addresses
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { rows } = await pool.query(`SELECT * FROM addresses WHERE user_id = $1 ORDER BY name`, [userId]);
  return NextResponse.json(rows.map(mapAddress));
}

// POST /api/addresses
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  const { name, address, entryLatitude, entryLongitude, notes } = body;

  if (!name || !address) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO addresses (user_id, name, address, entry_latitude, entry_longitude, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [userId, name, address, entryLatitude ?? null, entryLongitude ?? null, notes || null]
  );
  return NextResponse.json(mapAddress(rows[0]), { status: 201 });
}

// PATCH /api/addresses
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  const { id, name, address, entryLatitude, entryLongitude, notes } = body;

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { rows: existing } = await pool.query(`SELECT id FROM addresses WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!existing.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
  if (address !== undefined) { updates.push(`address = $${idx++}`); params.push(address); }
  if (entryLatitude !== undefined) { updates.push(`entry_latitude = $${idx++}`); params.push(entryLatitude); }
  if (entryLongitude !== undefined) { updates.push(`entry_longitude = $${idx++}`); params.push(entryLongitude); }
  if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }

  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE addresses SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params
  );
  return NextResponse.json(mapAddress(rows[0]));
}

// DELETE /api/addresses?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await pool.query(`DELETE FROM addresses WHERE id = $1 AND user_id = $2`, [id, userId]);
  return NextResponse.json({ ok: true });
}
