import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';
import type { CreateTripRequest, UpdateTripRequest, DatabaseRow } from '@/lib/types';
import { CreateTripSchema, UpdateTripSchema, TripQuerySchema } from '@/lib/validation';
import { validateRequestBody, validateQueryParams, handleValidationError } from '@/lib/validate';

function mapTrip(r: DatabaseRow) {
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
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    
    const { cadenceId, closed } = validateQueryParams(TripQuerySchema, req.nextUrl.searchParams);
    if (!cadenceId) return NextResponse.json({ error: 'Missing cadenceId' }, { status: 400 });

    if (!await verifyCadenceOwner(cadenceId, userId))
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let query = `SELECT * FROM trips WHERE cadence_id = $1`;
    const params: string[] = [cadenceId];
    
    if (closed === 'true') {
      query += ` AND is_closed = true`;
    } else if (closed === 'false') {
      query += ` AND is_closed = false`;
    }
    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    return NextResponse.json(rows.map(mapTrip));
  } catch (error) {
    return handleValidationError(error);
  }
}

// POST /api/trips
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    
    const body = await req.json();
    const { cadenceId, id, description, referenceNumber, loadAddresses, unloadAddresses } = validateRequestBody(CreateTripSchema, body);

    if (!await verifyCadenceOwner(cadenceId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { rows } = await pool.query(
      `INSERT INTO trips (id, cadence_id, description, reference_number, load_addresses, unload_addresses, shift_ids, is_closed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false) RETURNING *`,
      [id, cadenceId, description, referenceNumber || null,
       JSON.stringify(loadAddresses || []), JSON.stringify(unloadAddresses || []), '[]']
    );
    return NextResponse.json(mapTrip(rows[0]), { status: 201 });
  } catch (error) {
    return handleValidationError(error);
  }
}

// PATCH /api/trips
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    
    const body = await req.json();
    const { id, cadenceId, isClosed, description, referenceNumber, loadAddresses, unloadAddresses } = validateRequestBody(UpdateTripSchema, body);

    if (!await verifyCadenceOwner(cadenceId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: string[] = [];
    const params: (string | number | boolean | null)[] = [];
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
  } catch (error) {
    return handleValidationError(error);
  }
}
