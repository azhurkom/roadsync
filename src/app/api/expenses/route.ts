import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';
import type { DatabaseRow } from '@/lib/types';

function mapExpense(r: DatabaseRow) {
  return {
    id: r.id,
    cadenceId: r.cadence_id,
    timestamp: r.timestamp,
    type: r.type,
    amount: r.amount,
    paymentMethod: r.payment_method,
    liters: r.liters,
    receiptUrl: r.receipt_url,
    odometer: r.odometer,
    locationName: r.location_name,
    notes: r.notes,
  };
}

async function verifyCadenceOwner(cadenceId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT id FROM cadences WHERE id = $1 AND user_id = $2`, [cadenceId, userId]
  );
  return rows.length > 0;
}

// GET /api/expenses?cadenceId=xxx
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const cadenceId = req.nextUrl.searchParams.get('cadenceId');
  if (!cadenceId) return NextResponse.json({ error: 'Missing cadenceId' }, { status: 400 });
  if (!await verifyCadenceOwner(cadenceId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows } = await pool.query(
    `SELECT * FROM expenses WHERE cadence_id = $1 ORDER BY timestamp DESC`, [cadenceId]
  );
  return NextResponse.json(rows.map(mapExpense));
}

// POST /api/expenses
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  const { cadenceId, timestamp, type, amount, paymentMethod, liters, receiptUrl, odometer, locationName, notes } = body;

  if (!cadenceId || !type || !amount || !paymentMethod || odometer === undefined)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  if (!await verifyCadenceOwner(cadenceId, userId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { rows } = await pool.query(
    `INSERT INTO expenses (cadence_id, timestamp, type, amount, payment_method, liters, receipt_url, odometer, location_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [cadenceId, timestamp || new Date().toISOString(), type, amount, paymentMethod,
     liters || null, receiptUrl || null, odometer, locationName || '', notes || null]
  );
  return NextResponse.json(mapExpense(rows[0]), { status: 201 });
}
