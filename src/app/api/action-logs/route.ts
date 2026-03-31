import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';
import type { DatabaseRow } from '@/lib/types';

function mapLog(r: DatabaseRow) {
  return {
    id: r.id,
    cadenceId: r.cadence_id,
    tripId: r.trip_id,
    timestamp: r.timestamp,
    odometer: r.odometer,
    locationLatitude: r.location_latitude,
    locationLongitude: r.location_longitude,
    locationName: r.location_name,
    actionType: r.action_type,
    notes: r.notes,
    weight: r.weight,
    drivingTime: r.driving_time,
    fileUrl: r.file_url,
    newVehicleNumber: r.new_vehicle_number,
    newTrailerNumber: r.new_trailer_number,
    oldVehicleNumber: r.old_vehicle_number,
    oldTrailerNumber: r.old_trailer_number,
  };
}

async function verifyCadenceOwner(cadenceId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT id FROM cadences WHERE id = $1 AND user_id = $2`, [cadenceId, userId]
  );
  return rows.length > 0;
}

// GET /api/action-logs?cadenceId=xxx&limit=50&tripId=xxx
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const cadenceId = req.nextUrl.searchParams.get('cadenceId');
  const tripId = req.nextUrl.searchParams.get('tripId');
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam) : 100;

  if (!cadenceId) return NextResponse.json({ error: 'Missing cadenceId' }, { status: 400 });
  if (!await verifyCadenceOwner(cadenceId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let query = `SELECT * FROM action_logs WHERE cadence_id = $1`;
  const params: (string | number | null)[] = [cadenceId];
  let idx = 2;

  if (tripId) { query += ` AND trip_id = $${idx++}`; params.push(tripId); }
  query += ` ORDER BY timestamp DESC LIMIT $${idx}`;
  params.push(limit);

  const { rows } = await pool.query(query, params);
  return NextResponse.json(rows.map(mapLog));
}

// POST /api/action-logs
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  const {
    cadenceId, tripId, timestamp, odometer, locationLatitude, locationLongitude,
    locationName, actionType, notes, weight, drivingTime, fileUrl,
    newVehicleNumber, newTrailerNumber, oldVehicleNumber, oldTrailerNumber
  } = body;

  if (!cadenceId || !actionType || odometer === undefined)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  if (!await verifyCadenceOwner(cadenceId, userId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows } = await pool.query(
    `INSERT INTO action_logs
     (cadence_id, trip_id, timestamp, odometer, location_latitude, location_longitude,
      location_name, action_type, notes, weight, driving_time, file_url,
      new_vehicle_number, new_trailer_number, old_vehicle_number, old_trailer_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [cadenceId, tripId || null, timestamp || new Date().toISOString(), odometer,
     locationLatitude || 0, locationLongitude || 0, locationName || '',
     actionType, notes || null, weight || null, drivingTime || null, fileUrl || null,
     newVehicleNumber || null, newTrailerNumber || null, oldVehicleNumber || null, oldTrailerNumber || null]
  );
  return NextResponse.json(mapLog(rows[0]), { status: 201 });
}
