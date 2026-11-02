import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';

const BASE_CITY = 'Schweinfurt';
const BASE_LAT = 50.0215;
const BASE_LON = 10.2255;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCity(raw: string): string {
  if (!raw) return 'Невідомо';
  const s = raw.trim();
  const lower = s.toLowerCase();
  if (lower.includes('baunatal') || lower.includes('kirchbauna')) return 'Baunatal / Kirchbauna';
  if (lower.includes('kassel')) return 'Kassel';
  if (lower.includes('münchen') || lower.includes('muenchen') || lower.includes('munich')) return 'München';
  if (lower.includes('schweinfurt')) return 'Schweinfurt';
  if (lower.includes('reith') || lower.includes('obertulba')) return 'Reith / Obertulba';
  if (lower.includes('ingolstadt')) return 'Ingolstadt';
  if (lower.includes('ludwigsau')) return 'Ludwigsau';
  if (lower.includes('volkmarsen')) return 'Volkmarsen';
  if (lower.includes('neckarsulm')) return 'Neckarsulm';
  if (lower.includes('ludwigsburg')) return 'Ludwigsburg';
  if (lower.includes('merklingen')) return 'Merklingen';
  if (lower.includes('worms')) return 'Worms';
  if (lower.includes('deggendorf')) return 'Deggendorf';
  if (lower.includes('ludwigsfelde')) return 'Ludwigsfelde';
  if (lower.includes('häusling') || lower.includes('haeusling')) return 'Häusling';
  if (lower.includes('weingartsgreuth')) return 'Weingartsgreuth';

  const zipMatch = s.match(/\b\d{5}\s+([A-Za-zÄÖÜäöüß\-]+)/);
  if (zipMatch) return zipMatch[1];

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (!p.match(/^\d/) && p !== 'Німеччина' && p !== 'Germany') {
      return p;
    }
  }
  return parts[0] || s;
}

function parseDrivingHours(s?: string | null): number {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return isNaN(h) || isNaN(m) ? 0 : h + m / 60;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Fetch all user's cadences
    const { rows: cadences } = await pool.query(
      `SELECT id, end_date FROM cadences WHERE user_id = $1 ORDER BY start_date DESC`,
      [userId]
    );
    const cadenceIds = cadences.map((c) => c.id);
    const activeCadenceRow = cadences.find((c) => !c.end_date) || cadences[0];
    const activeCadenceId = activeCadenceRow?.id;
    if (cadenceIds.length === 0) {
      return NextResponse.json({ error: 'No cadences found' }, { status: 404 });
    }

    // Fetch all action_logs across all cadences ordered chronologically
    const { rows: logs } = await pool.query(
      `SELECT id, cadence_id, trip_id, timestamp, odometer, location_latitude, location_longitude,
              location_name, action_type, notes, weight, driving_time
       FROM action_logs
       WHERE cadence_id = ANY($1)
       ORDER BY timestamp ASC`,
      [cadenceIds]
    );

    // Fetch all trips across all cadences ordered chronologically
    const { rows: trips } = await pool.query(
      `SELECT id, cadence_id, description, reference_number, load_addresses, unload_addresses, is_closed, created_at
       FROM trips
       WHERE cadence_id = ANY($1)
       ORDER BY created_at ASC`,
      [cadenceIds]
    );

    //Fetch saved addresses for coordinate lookup
    const { rows: addresses } = await pool.query(
      `SELECT name, address, entry_latitude, entry_longitude FROM addresses WHERE user_id = $1`,
      [userId]
    );

    // 1. Compute real average driving speed across all shifts
    let totalShiftKm = 0;
    let totalShiftHours = 0;
    let lastStartOdo: number | null = null;

    for (const log of logs) {
      if (log.action_type === 'start-shift') {
        lastStartOdo = Number(log.odometer);
      } else if (log.action_type === 'end-shift' && lastStartOdo !== null) {
        const dist = Number(log.odometer) - lastStartOdo;
        const hrs = parseDrivingHours(log.driving_time);
        if (dist > 5 && dist < 1200 && hrs > 0.2) {
          totalShiftKm += dist;
          totalShiftHours += hrs;
        }
        lastStartOdo = null;
      }
    }
    const avgSpeedKmh = totalShiftHours > 0 ? totalShiftKm / totalShiftHours : 71.5;

    // 2. Current driver state
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const activeTrips = trips.filter((t) => !t.is_closed && t.cadence_id === activeCadenceId);
    const activeTrip = activeTrips.length > 0 ? activeTrips[activeTrips.length - 1] : null;

    // Determine if shift is currently active
    let activeShiftStart: string | null = null;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].action_type === 'start-shift') {
        activeShiftStart = logs[i].timestamp;
        break;
      }
      if (logs[i].action_type === 'end-shift') {
        break;
      }
    }

    const currentLat = lastLog ? Number(lastLog.location_latitude) : BASE_LAT;
    const currentLon = lastLog ? Number(lastLog.location_longitude) : BASE_LON;
    const currentLocationName = lastLog?.location_name || BASE_CITY;
    const currentCity = normalizeCity(currentLocationName);

    // Calculate road distance (approx 1.24x air distance on German Autobahn)
    const airDistFromCurrent = haversineKm(currentLat, currentLon, BASE_LAT, BASE_LON);
    const roadDistFromCurrentKm = Math.round(airDistFromCurrent * 1.24);
    const driveHoursFromCurrent = roadDistFromCurrentKm / avgSpeedKmh;

    // If there is an active trip, find its final unload target and distance to base
    let targetUnloadAddress: string | null = null;
    let targetUnloadCity: string | null = null;
    let roadDistFromTargetKm: number | null = null;
    let driveHoursFromTarget: number | null = null;

    if (activeTrip && Array.isArray(activeTrip.unload_addresses) && activeTrip.unload_addresses.length > 0) {
      targetUnloadAddress = activeTrip.unload_addresses[activeTrip.unload_addresses.length - 1];
      targetUnloadCity = normalizeCity(targetUnloadAddress || '');
      // Try finding coordinates from addresses or past logs
      const addrMatch = addresses.find(
        (a) =>
          a.address?.toLowerCase() === targetUnloadAddress?.toLowerCase() ||
          normalizeCity(a.address || '') === targetUnloadCity
      );
      if (addrMatch && addrMatch.entry_latitude && addrMatch.entry_longitude) {
        const air = haversineKm(Number(addrMatch.entry_latitude), Number(addrMatch.entry_longitude), BASE_LAT, BASE_LON);
        roadDistFromTargetKm = Math.round(air * 1.24);
      } else {
        const logMatch = [...logs]
          .reverse()
          .find((l) => l.location_latitude && normalizeCity(l.location_name) === targetUnloadCity);
        if (logMatch) {
          const air = haversineKm(Number(logMatch.location_latitude), Number(logMatch.location_longitude), BASE_LAT, BASE_LON);
          roadDistFromTargetKm = Math.round(air * 1.24);
        }
      }
      if (roadDistFromTargetKm !== null) {
        driveHoursFromTarget = roadDistFromTargetKm / avgSpeedKmh;
      }
    }

    // 3. Analyze historical Friday/Saturday weekend finishes across all weeks
    const weekMap = new Map<
      string,
      {
        weekKey: string;
        fridayStartCity?: string;
        fridayStartTime?: string;
        fridayEndCity?: string;
        fridayEndTime?: string;
        fridayKm?: number;
        fridayDriveTime?: string;
        satEndCity?: string;
        satEndTime?: string;
        outcome: 'friday_base' | 'friday_reith' | 'saturday_base' | 'away';
      }
    >();

    // Helper for Berlin local time components
    const toBerlin = (iso: string) => {
      const d = new Date(iso);
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
      return {
        dateStr: `${get('year')}-${get('month')}-${get('day')}`,
        weekday: get('weekday'), // Mon, Tue, Wed, Thu, Fri, Sat, Sun
        timeStr: `${get('hour')}:${get('minute')}`,
        minutesOfDay: parseInt(get('hour') || '0', 10) * 60 + parseInt(get('minute') || '0', 10),
      };
    };

    // Group Friday and Saturday shifts by ISO week
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.action_type !== 'end-shift' && log.action_type !== 'start-shift') continue;
      const b = toBerlin(log.timestamp);
      if (b.weekday !== 'Fri' && b.weekday !== 'Sat') continue;

      // Key by Friday's date (if Sat, subtract 1 day)
      const d = new Date(log.timestamp);
      if (b.weekday === 'Sat') d.setUTCDate(d.getUTCDate() - 1);
      const friDate = toBerlin(d.toISOString()).dateStr;

      if (!weekMap.has(friDate)) {
        weekMap.set(friDate, { weekKey: friDate, outcome: 'away' });
      }
      const w = weekMap.get(friDate)!;

      if (b.weekday === 'Fri' && log.action_type === 'start-shift') {
        w.fridayStartCity = normalizeCity(log.location_name);
        w.fridayStartTime = b.timeStr;
      } else if (b.weekday === 'Fri' && log.action_type === 'end-shift') {
        w.fridayEndCity = normalizeCity(log.location_name);
        w.fridayEndTime = b.timeStr;
        w.fridayDriveTime = log.driving_time || undefined;
        // find matching start-shift odometer
        for (let j = i - 1; j >= 0; j--) {
          if (logs[j].action_type === 'start-shift') {
            const dist = Number(log.odometer) - Number(logs[j].odometer);
            if (dist >= 0 && dist < 1500) w.fridayKm = dist;
            break;
          }
        }
      } else if (b.weekday === 'Sat' && log.action_type === 'end-shift') {
        w.satEndCity = normalizeCity(log.location_name);
        w.satEndTime = b.timeStr;
      }
    }

    const weeks = Array.from(weekMap.values())
      .filter((w) => w.fridayEndCity || w.satEndCity)
      .sort((a, b) => b.weekKey.localeCompare(a.weekKey));

    let fridayBaseCount = 0;
    let fridayReithCount = 0;
    let saturdayBaseCount = 0;
    const fridayArrivalMinutes: number[] = [];

    for (const w of weeks) {
      if (w.fridayEndCity === 'Schweinfurt') {
        w.outcome = 'friday_base';
        fridayBaseCount++;
        if (w.fridayEndTime) {
          const [hh, mm] = w.fridayEndTime.split(':').map(Number);
          fridayArrivalMinutes.push(hh * 60 + mm);
        }
      } else if (w.satEndCity === 'Schweinfurt') {
        w.outcome = 'saturday_base';
        saturdayBaseCount++;
      } else if (w.fridayEndCity === 'Reith / Obertulba') {
        w.outcome = 'friday_reith';
        fridayReithCount++;
        if (w.fridayEndTime) {
          const [hh, mm] = w.fridayEndTime.split(':').map(Number);
          fridayArrivalMinutes.push(hh * 60 + mm);
        }
      } else {
        w.outcome = 'away';
      }
    }

    // Calculate typical Friday arrival window (25th to 75th percentile & median)
    fridayArrivalMinutes.sort((a, b) => a - b);
    const fmtMin = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    const medianMin =
      fridayArrivalMinutes.length > 0
        ? fridayArrivalMinutes[Math.floor(fridayArrivalMinutes.length / 2)]
        : 20 * 60 + 15;
    const p25Min =
      fridayArrivalMinutes.length > 2
        ? fridayArrivalMinutes[Math.floor(fridayArrivalMinutes.length * 0.25)]
        : 18 * 60 + 15;
    const p75Min =
      fridayArrivalMinutes.length > 2
        ? fridayArrivalMinutes[Math.floor(fridayArrivalMinutes.length * 0.75)]
        : 21 * 60 + 50;

    // 4. Build Markov transition statistics for next trips from the pivot city
    // Pivot city is targetUnloadCity (if on active trip) or currentCity
    const pivotCity = targetUnloadCity || currentCity;

    interface NextTripPattern {
      loadCity: string;
      unloadCity: string;
      sampleLoadAddress: string;
      sampleUnloadAddress: string;
      sampleDescription: string;
      count: number;
      probability: number;
      leadsTowardBase: boolean;
    }

    const transitions = new Map<string, NextTripPattern>();
    let totalTransitionsFromPivot = 0;

    for (let i = 0; i < trips.length - 1; i++) {
      const curr = trips[i];
      const next = trips[i + 1];
      const currUnloads: string[] = Array.isArray(curr.unload_addresses) ? curr.unload_addresses : [];
      const nextLoads: string[] = Array.isArray(next.load_addresses) ? next.load_addresses : [];
      const nextUnloads: string[] = Array.isArray(next.unload_addresses) ? next.unload_addresses : [];

      if (currUnloads.length === 0 || nextUnloads.length === 0) continue;
      const lastUnloadCity = normalizeCity(currUnloads[currUnloads.length - 1]);
      if (lastUnloadCity !== pivotCity) continue;

      const nextLoadCity = nextLoads.length > 0 ? normalizeCity(nextLoads[0]) : lastUnloadCity;
      const nextUnloadCity = normalizeCity(nextUnloads[nextUnloads.length - 1]);
      const key = `${nextLoadCity} -> ${nextUnloadCity}`;

      totalTransitionsFromPivot++;
      const existing = transitions.get(key);
      if (existing) {
        existing.count++;
      } else {
        const leadsTowardBase = ['Schweinfurt', 'Reith / Obertulba', 'Baunatal / Kirchbauna', 'Kassel', 'Ludwigsau'].includes(
          nextUnloadCity
        );
        transitions.set(key, {
          loadCity: nextLoadCity,
          unloadCity: nextUnloadCity,
          sampleLoadAddress: nextLoads[0] || currUnloads[currUnloads.length - 1],
          sampleUnloadAddress: nextUnloads[nextUnloads.length - 1],
          sampleDescription: next.description || `Перевезення до ${nextUnloadCity}`,
          count: 1,
          probability: 0,
          leadsTowardBase,
        });
      }
    }

    // If pivotCity is rare and has < 2 transitions, also include general common routes from that region or overall top routes
    let predictedNextTrips = Array.from(transitions.values())
      .map((item) => ({
        ...item,
        probability: totalTransitionsFromPivot > 0 ? Math.round((item.count / totalTransitionsFromPivot) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // Also compute top Friday/Thursday return routes across the entire database
    const returnTransitions = new Map<string, { route: string; count: number; sampleDescription: string }>();
    for (const t of trips) {
      const b = toBerlin(t.created_at);
      if (b.weekday !== 'Thu' && b.weekday !== 'Fri') continue;
      const loads: string[] = Array.isArray(t.load_addresses) ? t.load_addresses : [];
      const unloads: string[] = Array.isArray(t.unload_addresses) ? t.unload_addresses : [];
      if (unloads.length === 0) continue;
      const lCity = loads.length > 0 ? normalizeCity(loads[0]) : 'База';
      const uCity = normalizeCity(unloads[unloads.length - 1]);
      const key = `${lCity} → ${uCity}`;
      const ex = returnTransitions.get(key);
      if (ex) ex.count++;
      else returnTransitions.set(key, { route: key, count: 1, sampleDescription: t.description });
    }
    const topThuFriRoutes = Array.from(returnTransitions.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 5. Calculate dynamic Friday arrival probability for current situation
    const totalAnalyzedWeeks = weeks.length || 1;
    const baseFridayRate = Math.round(((fridayBaseCount + fridayReithCount) / totalAnalyzedWeeks) * 100);
    const baseWeekendRate = Math.round(
      ((fridayBaseCount + fridayReithCount + saturdayBaseCount) / totalAnalyzedWeeks) * 100
    );

    const effectiveDistKm = roadDistFromTargetKm !== null ? roadDistFromTargetKm : roadDistFromCurrentKm;
    const effectiveDriveHours = driveHoursFromTarget !== null ? driveHoursFromTarget : driveHoursFromCurrent;

    // Adjust probability based on distance from base
    let currentFridayProbability = baseFridayRate;
    if (effectiveDistKm <= 60) currentFridayProbability = Math.min(96, baseFridayRate + 18);
    else if (effectiveDistKm <= 180) currentFridayProbability = Math.min(90, baseFridayRate + 10);
    else if (effectiveDistKm > 420) currentFridayProbability = Math.max(45, baseFridayRate - 15);

    // Direct ETA if heading straight to Schweinfurt now / after active shift
    const nowMs = Date.now();
    const bufferHours = activeTrip ? 1.25 : 0.25; // include unloading buffer if active trip
    const directEtaDate = new Date(nowMs + (effectiveDriveHours + bufferHours) * 3600 * 1000);
    const directEtaBerlin = toBerlin(directEtaDate.toISOString()).timeStr;

    // Shift limit calculation if shift is active
    let shiftInfo = null;
    if (activeShiftStart) {
      const startMs = new Date(activeShiftStart).getTime();
      const elapsedHours = (nowMs - startMs) / (3600 * 1000);
      const limit13hDate = new Date(startMs + 13 * 3600 * 1000);
      const limit15hDate = new Date(startMs + 15 * 3600 * 1000);
      const remainingTo15h = Math.max(0, 15 - elapsedHours);
      const canReachBaseInCurrentShift = remainingTo15h >= effectiveDriveHours + bufferHours;

      shiftInfo = {
        startTimeBerlin: toBerlin(activeShiftStart).timeStr,
        elapsedHours: Number(elapsedHours.toFixed(1)),
        limit13hBerlin: toBerlin(limit13hDate.toISOString()).timeStr,
        limit15hBerlin: toBerlin(limit15hDate.toISOString()).timeStr,
        remainingTo15h: Number(remainingTo15h.toFixed(1)),
        canReachBaseInCurrentShift,
      };
    }

    return NextResponse.json({
      base: {
        city: BASE_CITY,
        lat: BASE_LAT,
        lon: BASE_LON,
      },
      currentStatus: {
        locationName: currentLocationName,
        city: currentCity,
        lastActionType: lastLog?.action_type || null,
        lastActionTime: lastLog?.timestamp || null,
        roadDistToBaseKm: roadDistFromCurrentKm,
        driveHoursToBase: Number(driveHoursFromCurrent.toFixed(2)),
        activeTrip: activeTrip
          ? {
              id: activeTrip.id,
              description: activeTrip.description,
              targetUnloadAddress,
              targetUnloadCity,
              roadDistFromTargetToBaseKm: roadDistFromTargetKm,
              driveHoursFromTargetToBase:
                driveHoursFromTarget !== null ? Number(driveHoursFromTarget.toFixed(2)) : null,
            }
          : null,
        shiftInfo,
      },
      fridayForecast: {
        fridayProbability: currentFridayProbability,
        weekendBaseProbability: baseWeekendRate,
        medianArrivalTime: fmtMin(medianMin),
        typicalWindowStart: fmtMin(p25Min),
        typicalWindowEnd: fmtMin(p75Min),
        directEtaIfNow: directEtaBerlin,
        avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
        totalTripsAnalyzed: trips.length,
        totalWeeksAnalyzed: weeks.length,
        counts: {
          fridayBaseCount,
          fridayReithCount,
          saturdayBaseCount,
        },
      },
      nextTripPredictions: {
        pivotCity,
        totalCasesFromPivot: totalTransitionsFromPivot,
        predictions: predictedNextTrips,
        topThuFriRoutes,
      },
      recentFridays: weeks.slice(0, 10),
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Forecast API error:', err);
    return NextResponse.json({ error: err.message || 'Forecast calculation failed' }, { status: 500 });
  }
}
