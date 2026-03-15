import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';

// GET /api/cadences - get all cadences for user; ?active=true for active only
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const active = req.nextUrl.searchParams.get('active');

  let query = `SELECT * FROM cadences WHERE user_id = $1`;
  const params: any[] = [userId];

  if (active === 'true') {
    query += ` AND end_date IS NULL`;
  }
  query += ` ORDER BY start_date DESC`;

  const { rows } = await pool.query(query, params);
  const cadences = rows.map(r => ({
    id: r.id,
    firmName: r.firm_name,
    startDate: r.start_date,
    endDate: r.end_date,
    vehicleNumber: r.vehicle_number,
    trailerNumber: r.trailer_number,
    userId: r.user_id,
  }));
  return NextResponse.json(cadences);
}

// POST /api/cadences - create new cadence
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await req.json();
  const { firmName, vehicleNumber, trailerNumber } = body;

  if (!firmName || !vehicleNumber || !trailerNumber) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { rows } = await pool.query(
    `INSERT INTO cadences (user_id, firm_name, vehicle_number, trailer_number)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, firmName, vehicleNumber, trailerNumber]
  );
  const r = rows[0];
  return NextResponse.json({
    id: r.id,
    firmName: r.firm_name,
    startDate: r.start_date,
    endDate: r.end_date,
    vehicleNumber: r.vehicle_number,
    trailerNumber: r.trailer_number,
    userId: r.user_id,
  }, { status: 201 });
}

// PATCH /api/cadences - update cadence (e.g. end it, or update vehicle/trailer number)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await req.json();
  const { id, endDate, vehicleNumber, trailerNumber } = body;

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Verify ownership
  const { rows: existing } = await pool.query(
    `SELECT id FROM cadences WHERE id = $1 AND user_id = $2`, [id, userId]
  );
  if (!existing.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (endDate !== undefined) { updates.push(`end_date = $${idx++}`); params.push(endDate); }
  if (vehicleNumber !== undefined) { updates.push(`vehicle_number = $${idx++}`); params.push(vehicleNumber); }
  if (trailerNumber !== undefined) { updates.push(`trailer_number = $${idx++}`); params.push(trailerNumber); }

  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE cadences SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params
  );
  const r = rows[0];
  return NextResponse.json({
    id: r.id,
    firmName: r.firm_name,
    startDate: r.start_date,
    endDate: r.end_date,
    vehicleNumber: r.vehicle_number,
    trailerNumber: r.trailer_number,
    userId: r.user_id,
  });
}
