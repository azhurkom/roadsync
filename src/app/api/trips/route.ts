import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';

function mapTrip(r: any) {
  return {
    id: r.id,
    cadenceId: r.cadence_id,
    description: r.description,
    referenceNumber: r.reference_number,
    loadAddresses: r.load_addresses,
    unloadAddresses: r.unload_addresses,
    shiftIds: r.shift_ids,
    isClosed: r.is_closed,
    createdAt: r.created_at,
  };
}

async function verifyCadenceOwner(cadenceId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT id FROM cadences WHERE id = $1 AND user_id = $2`, [cadenceId, userId]
  );
  return rows.length > 0;
}

// GET /api/trips?cadenceId=xxx&closed=false
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const cadenceId = req.nextUrl.searchParams.get('cadenceId');
  if (!cadenceId) return NextResponse.json({ error: 'Missing cadenceId' }, { status: 400 });

  if (!await verifyCadenceOwner(cadenceId, userId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows } = await pool.query(
    `SELECT * FROM trips WHERE cadence_id = $1 ORDER BY created_at DESC`, [cadenceId]
  );
  return NextResponse.json(rows.map(mapTrip));
}

// POST /api/trips
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  const { cadenceId, id, description, referenceNumber, loadAddresses, unloadAddresses } = body;

  if (!cadenceId || !id || !description) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  if (!await verifyCadenceOwner(cadenceId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows } = await pool.query(
    `INSERT INTO trips (id, cadence_id, description, reference_number, load_addresses, unload_addresses, shift_ids, is_closed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false) RETURNING *`,
    [id, cadenceId, description, referenceNumber || null,
     JSON.stringify(loadAddresses || []), JSON.stringify(unloadAddresses || []), '[]']
  );
  return NextResponse.json(mapTrip(rows[0]), { status: 201 });
}

// PATCH /api/trips
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  const { id, cadenceId, isClosed, description, referenceNumber, loadAddresses, unloadAddresses } = body;

  if (!id || !cadenceId) return NextResponse.json({ error: 'Missing id/cadenceId' }, { status: 400 });
  if (!await verifyCadenceOwner(cadenceId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (isClosed !== undefined) { updates.push(`is_closed = $${idx++}`); params.push(isClosed); }
  if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
  if (referenceNumber !== undefined) { updates.push(`reference_number = $${idx++}`); params.push(referenceNumber || null); }
  if (loadAddresses !== undefined) { updates.push(`load_addresses = $${idx++}`); params.push(JSON.stringify(loadAddresses)); }
  if (unloadAddresses !== undefined) { updates.push(`unload_addresses = $${idx++}`); params.push(JSON.stringify(unloadAddresses)); }

  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE trips SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params
  );
  return NextResponse.json(mapTrip(rows[0]));
}
