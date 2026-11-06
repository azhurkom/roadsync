import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import pool from '@/lib/db';

const BASE_CITY = 'Schweinfurt';
const BASE_LAT = 50.0215;
const BASE_LON = 10.2255;

// Known city coordinates fallback for accurate road distance estimation
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'Schweinfurt': { lat: 50.0215, lon: 10.2255 },
  'Reith / Obertulba': { lat: 50.1955, lon: 9.9335 },
  'Baunatal / Kirchbauna': { lat: 51.2415, lon: 9.4385 },
  'Kassel': { lat: 51.301, lon: 9.525 },
  'München': { lat: 48.137, lon: 11.665 },
  'Ingolstadt': { lat: 48.749, lon: 11.439 },
  'Ludwigsau': { lat: 50.895, lon: 9.761 },
  'Volkmarsen': { lat: 51.408, lon: 9.118 },
  'Neckarsulm': { lat: 49.193, lon: 9.224 },
  'Heilbronn': { lat: 49.173, lon: 9.213 },
  'Ludwigsburg': { lat: 48.897, lon: 9.191 },
  'Merklingen': { lat: 48.513, lon: 9.754 },
  'Worms': { lat: 49.634, lon: 8.351 },
  'Deggendorf': { lat: 48.826, lon: 12.961 },
  'Ludwigsfelde': { lat: 52.302, lon: 13.257 },
  'Häusling': { lat: 49.582, lon: 10.929 },
  'Weingartsgreuth': { lat: 49.732, lon: 10.728 },
};

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
  if (lower.includes('baunatal') || lower.includes('kirchbauna') || lower.includes('rengershausen'))
    return 'Baunatal / Kirchbauna';
  if (lower.includes('kassel')) return 'Kassel';
  if (lower.includes('münchen') || lower.includes('muenchen') || lower.includes('munich')) return 'München';
  if (lower.includes('schweinfurt')) return 'Schweinfurt';
  if (lower.includes('reith') || lower.includes('obertulba')) return 'Reith / Obertulba';
  if (lower.includes('ingolstadt')) return 'Ingolstadt';
  if (lower.includes('ludwigsau') || lower.includes('mecklar')) return 'Ludwigsau';
  if (lower.includes('volkmarsen')) return 'Volkmarsen';
  if (lower.includes('neckarsulm')) return 'Neckarsulm';
  if (lower.includes('heilbronn')) return 'Heilbronn';
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

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Optional live GPS coordinates from client
    const latParam = req.nextUrl.searchParams.get('lat');
    const lonParam = req.nextUrl.searchParams.get('lon');
    const liveLat = latParam ? parseFloat(latParam) : null;
    const liveLon = lonParam ? parseFloat(lonParam) : null;
    const hasLiveGps =
      liveLat !== null &&
      liveLon !== null &&
      !isNaN(liveLat) &&
      !isNaN(liveLon) &&
      Math.abs(liveLat) > 0.1;

    // Fetch all user's cadences
    const { rows: cadences } = await pool.query(
      `SELECT id, end_date FROM cadences WHERE user_id = $1 ORDER BY start_date DESC`,
      [userId]
    );
    const cadenceIds = cadences.map((c) => c.id);
    if (cadenceIds.length === 0) {
      return NextResponse.json({ error: 'No cadences found' }, { status: 404 });
    }
    const activeCadenceRow = cadences.find((c) => !c.end_date) || cadences[0];
    const activeCadenceId = activeCadenceRow?.id;

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

    // Fetch saved addresses for coordinate lookup
    const { rows: addresses } = await pool.query(
      `SELECT name, address, entry_latitude, entry_longitude FROM addresses WHERE user_id = $1`,
      [userId]
    );

    // Helper for coordinate lookup of any address or city
    const resolveCoords = (addrOrCity: string): { lat: number; lon: number } | null => {
      if (!addrOrCity) return null;
      const norm = normalizeCity(addrOrCity);
      const exactAddr = addresses.find(
        (a) =>
          a.entry_latitude &&
          a.entry_longitude &&
          (a.address?.toLowerCase() === addrOrCity.toLowerCase() || normalizeCity(a.address || '') === norm)
      );
      if (exactAddr) {
        return { lat: Number(exactAddr.entry_latitude), lon: Number(exactAddr.entry_longitude) };
      }
      if (CITY_COORDS[norm]) {
        return CITY_COORDS[norm];
      }
      const logMatch = [...logs]
        .reverse()
        .find((l) => l.location_latitude && l.location_longitude && normalizeCity(l.location_name) === norm);
      if (logMatch) {
        return { lat: Number(logMatch.location_latitude), lon: Number(logMatch.location_longitude) };
      }
      return null;
    };

    const calcRoadKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const air = haversineKm(lat1, lon1, lat2, lon2);
      if (air < 2) return 0;
      return Math.round(air * 1.24);
    };

    // Find nearest known city/place name for live GPS coordinates
    const findNearestPlaceName = (lat: number, lon: number): string => {
      let bestName = '';
      let bestDist = 999999;

      for (const [city, coords] of Object.entries(CITY_COORDS)) {
        const d = haversineKm(lat, lon, coords.lat, coords.lon);
        if (d < bestDist) {
          bestDist = d;
          bestName = city;
        }
      }
      for (const a of addresses) {
        if (a.entry_latitude && a.entry_longitude) {
          const d = haversineKm(lat, lon, Number(a.entry_latitude), Number(a.entry_longitude));
          if (d < bestDist) {
            bestDist = d;
            bestName = normalizeCity(a.address || a.name);
          }
        }
      }
      for (let i = logs.length - 1; i >= Math.max(0, logs.length - 200); i--) {
        const l = logs[i];
        if (l.location_latitude && l.location_longitude && l.location_name) {
          const d = haversineKm(lat, lon, Number(l.location_latitude), Number(l.location_longitude));
          if (d < bestDist) {
            bestDist = d;
            bestName = l.location_name;
          }
        }
      }
      if (bestDist <= 25 && bestName) {
        return bestDist <= 5 ? bestName : `Поблизу ${bestName} (~${Math.round(bestDist)} км)`;
      }
      return `GPS (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
    };

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
        weekday: get('weekday'),
        timeStr: `${get('hour')}:${get('minute')}`,
        minutesOfDay: parseInt(get('hour') || '0', 10) * 60 + parseInt(get('minute') || '0', 10),
      };
    };

    // 2. Current driver state & Live GPS
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
    const openTrips = trips.filter((t) => !t.is_closed && t.cadence_id === activeCadenceId);
    // Oldest open trip is the currently executing trip!
    const currentActiveTrip = openTrips.length > 0 ? openTrips[0] : null;

    let activeShiftStart: string | null = null;
    let shiftStartOdo: number | null = null;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].action_type === 'start-shift') {
        activeShiftStart = logs[i].timestamp;
        shiftStartOdo = Number(logs[i].odometer);
        break;
      }
      if (logs[i].action_type === 'end-shift') {
        break;
      }
    }

    const currentLat = hasLiveGps ? liveLat! : lastLog ? Number(lastLog.location_latitude) : BASE_LAT;
    const currentLon = hasLiveGps ? liveLon! : lastLog ? Number(lastLog.location_longitude) : BASE_LON;
    const currentLocationName = hasLiveGps
      ? findNearestPlaceName(currentLat, currentLon)
      : lastLog?.location_name || BASE_CITY;
    const currentCity = normalizeCity(currentLocationName);

    const roadDistFromCurrentKm = calcRoadKm(currentLat, currentLon, BASE_LAT, BASE_LON);
    const driveHoursFromCurrent = roadDistFromCurrentKm / avgSpeedKmh;

    // 3. Build sequential step-by-step route timeline across ALL open trips in queue + return to Base
    // Constant: 1.0 hour (60 min) for each loading or unloading operation
    const RAMP_DURATION_HOURS = 1.0;

    interface TimelineStep {
      stepNumber: number;
      tripId: string;
      type: 'load' | 'unload' | 'return-base' | 'tachograph-break';
      label: string;
      address: string;
      city: string;
      roadKm: number;
      driveHours: number;
      workHours: number; // 1.0h for load/unload, 0.75h for break, 0 for return-base
      arrivalTimeBerlin: string;
      departureTimeBerlin: string;
      arrivalTimestampMs: number;
      departureTimestampMs: number;
      exceeds13hLimit: boolean;
      exceeds15hLimit: boolean;
      exceedsDriveLimit: boolean;
    }

    const timelineSteps: TimelineStep[] = [];
    let cursorLat = currentLat;
    let cursorLon = currentLon;
    let cursorMs = Date.now();

    // Estimate how much driving was already done in the current shift before now
    let alreadyDrivenKmInShift = 0;
    if (activeShiftStart && shiftStartOdo !== null && lastLog) {
      const loggedDist = Math.max(0, Number(lastLog.odometer) - shiftStartOdo);
      const extraGpsDist = hasLiveGps
        ? calcRoadKm(Number(lastLog.location_latitude), Number(lastLog.location_longitude), currentLat, currentLon)
        : 0;
      alreadyDrivenKmInShift = loggedDist + extraGpsDist;
    }
    let cumulativeDriveHours = alreadyDrivenKmInShift / avgSpeedKmh;
    let breakAdded = cumulativeDriveHours >= 4.5;

    const shiftStartMs = activeShiftStart ? new Date(activeShiftStart).getTime() : cursorMs;
    const shiftLimit13hMs = shiftStartMs + 13 * 3600 * 1000;
    const shiftLimit15hMs = shiftStartMs + 15 * 3600 * 1000;

    let stepNum = 1;

    for (const trip of openTrips) {
      const tripLogs = logs.filter((l) => l.trip_id === trip.id);
      const loadDoneCount = tripLogs.filter((l) => l.action_type === 'loading').length;
      const unloadDoneCount = tripLogs.filter((l) => l.action_type === 'unloading').length;

      const loadAddrs: string[] = Array.isArray(trip.load_addresses) ? trip.load_addresses : [];
      const unloadAddrs: string[] = Array.isArray(trip.unload_addresses) ? trip.unload_addresses : [];

      const remainingLoads = loadAddrs.slice(loadDoneCount);
      const remainingUnloads = unloadAddrs.slice(unloadDoneCount);

      for (const addr of remainingLoads) {
        const coords = resolveCoords(addr) || { lat: cursorLat, lon: cursorLon };
        const km = calcRoadKm(cursorLat, cursorLon, coords.lat, coords.lon);
        const dHours = km / avgSpeedKmh;

        // If driving this leg pushes cumulative driving over 4.5h and no break taken yet, add 45m tachograph break
        if (!breakAdded && cumulativeDriveHours + dHours > 4.5) {
          const breakMs = 0.75 * 3600 * 1000;
          const bStart = cursorMs;
          const bEnd = cursorMs + breakMs;
          timelineSteps.push({
            stepNumber: stepNum++,
            tripId: trip.id,
            type: 'tachograph-break',
            label: 'Пауза тахографа (45 хв)',
            address: 'Після 4.5 год керма',
            city: normalizeCity(addr),
            roadKm: 0,
            driveHours: 0,
            workHours: 0.75,
            arrivalTimeBerlin: toBerlin(new Date(bStart).toISOString()).timeStr,
            departureTimeBerlin: toBerlin(new Date(bEnd).toISOString()).timeStr,
            arrivalTimestampMs: bStart,
            departureTimestampMs: bEnd,
            exceeds13hLimit: bEnd > shiftLimit13hMs,
            exceeds15hLimit: bEnd > shiftLimit15hMs,
            exceedsDriveLimit: false,
          });
          cursorMs = bEnd;
          breakAdded = true;
        }

        cumulativeDriveHours += dHours;
        const arrMs = cursorMs + dHours * 3600 * 1000;
        const depMs = arrMs + RAMP_DURATION_HOURS * 3600 * 1000;

        timelineSteps.push({
          stepNumber: stepNum++,
          tripId: trip.id,
          type: 'load',
          label: `Завантаження (${trip.id})`,
          address: addr,
          city: normalizeCity(addr),
          roadKm: km,
          driveHours: Number(dHours.toFixed(2)),
          workHours: RAMP_DURATION_HOURS,
          arrivalTimeBerlin: toBerlin(new Date(arrMs).toISOString()).timeStr,
          departureTimeBerlin: toBerlin(new Date(depMs).toISOString()).timeStr,
          arrivalTimestampMs: arrMs,
          departureTimestampMs: depMs,
          exceeds13hLimit: depMs > shiftLimit13hMs,
          exceeds15hLimit: depMs > shiftLimit15hMs,
          exceedsDriveLimit: cumulativeDriveHours > 10,
        });

        cursorLat = coords.lat;
        cursorLon = coords.lon;
        cursorMs = depMs;
      }

      for (const addr of remainingUnloads) {
        const coords = resolveCoords(addr) || { lat: cursorLat, lon: cursorLon };
        const km = calcRoadKm(cursorLat, cursorLon, coords.lat, coords.lon);
        const dHours = km / avgSpeedKmh;

        if (!breakAdded && cumulativeDriveHours + dHours > 4.5) {
          const breakMs = 0.75 * 3600 * 1000;
          const bStart = cursorMs;
          const bEnd = cursorMs + breakMs;
          timelineSteps.push({
            stepNumber: stepNum++,
            tripId: trip.id,
            type: 'tachograph-break',
            label: 'Пауза тахографа (45 хв)',
            address: 'Після 4.5 год керма',
            city: normalizeCity(addr),
            roadKm: 0,
            driveHours: 0,
            workHours: 0.75,
            arrivalTimeBerlin: toBerlin(new Date(bStart).toISOString()).timeStr,
            departureTimeBerlin: toBerlin(new Date(bEnd).toISOString()).timeStr,
            arrivalTimestampMs: bStart,
            departureTimestampMs: bEnd,
            exceeds13hLimit: bEnd > shiftLimit13hMs,
            exceeds15hLimit: bEnd > shiftLimit15hMs,
            exceedsDriveLimit: false,
          });
          cursorMs = bEnd;
          breakAdded = true;
        }

        cumulativeDriveHours += dHours;
        const arrMs = cursorMs + dHours * 3600 * 1000;
        const depMs = arrMs + RAMP_DURATION_HOURS * 3600 * 1000;

        timelineSteps.push({
          stepNumber: stepNum++,
          tripId: trip.id,
          type: 'unload',
          label: `Розвантаження (${trip.id})`,
          address: addr,
          city: normalizeCity(addr),
          roadKm: km,
          driveHours: Number(dHours.toFixed(2)),
          workHours: RAMP_DURATION_HOURS,
          arrivalTimeBerlin: toBerlin(new Date(arrMs).toISOString()).timeStr,
          departureTimeBerlin: toBerlin(new Date(depMs).toISOString()).timeStr,
          arrivalTimestampMs: arrMs,
          departureTimestampMs: depMs,
          exceeds13hLimit: depMs > shiftLimit13hMs,
          exceeds15hLimit: depMs > shiftLimit15hMs,
          exceedsDriveLimit: cumulativeDriveHours > 10,
        });

        cursorLat = coords.lat;
        cursorLon = coords.lon;
        cursorMs = depMs;
      }
    }

    // Final leg: Return to Base Schweinfurt from the last point of open trips (if not already at Schweinfurt)
    const distToBaseFromLastKm = calcRoadKm(cursorLat, cursorLon, BASE_LAT, BASE_LON);
    const driveHoursToBaseFromLast = distToBaseFromLastKm / avgSpeedKmh;

    if (distToBaseFromLastKm > 5) {
      if (!breakAdded && cumulativeDriveHours + driveHoursToBaseFromLast > 4.5) {
        const breakMs = 0.75 * 3600 * 1000;
        const bStart = cursorMs;
        const bEnd = cursorMs + breakMs;
        timelineSteps.push({
          stepNumber: stepNum++,
          tripId: 'base',
          type: 'tachograph-break',
          label: 'Пауза тахографа (45 хв)',
          address: 'Перед поверненням на базу',
          city: BASE_CITY,
          roadKm: 0,
          driveHours: 0,
          workHours: 0.75,
          arrivalTimeBerlin: toBerlin(new Date(bStart).toISOString()).timeStr,
          departureTimeBerlin: toBerlin(new Date(bEnd).toISOString()).timeStr,
          arrivalTimestampMs: bStart,
          departureTimestampMs: bEnd,
          exceeds13hLimit: bEnd > shiftLimit13hMs,
          exceeds15hLimit: bEnd > shiftLimit15hMs,
          exceedsDriveLimit: false,
        });
        cursorMs = bEnd;
        breakAdded = true;
      }

      cumulativeDriveHours += driveHoursToBaseFromLast;
      const arrBaseMs = cursorMs + driveHoursToBaseFromLast * 3600 * 1000;
      timelineSteps.push({
        stepNumber: stepNum++,
        tripId: 'base',
        type: 'return-base',
        label: `Прибуття на базу (${BASE_CITY})`,
        address: BASE_CITY,
        city: BASE_CITY,
        roadKm: distToBaseFromLastKm,
        driveHours: Number(driveHoursToBaseFromLast.toFixed(2)),
        workHours: 0,
        arrivalTimeBerlin: toBerlin(new Date(arrBaseMs).toISOString()).timeStr,
        departureTimeBerlin: toBerlin(new Date(arrBaseMs).toISOString()).timeStr,
        arrivalTimestampMs: arrBaseMs,
        departureTimestampMs: arrBaseMs,
        exceeds13hLimit: arrBaseMs > shiftLimit13hMs,
        exceeds15hLimit: arrBaseMs > shiftLimit15hMs,
        exceedsDriveLimit: cumulativeDriveHours > 10,
      });
      cursorMs = arrBaseMs;
    }

    const finalArrivalAtBaseBerlin = toBerlin(new Date(cursorMs).toISOString()).timeStr;
    const fitsBefore15hLimit = cursorMs <= shiftLimit15hMs && cumulativeDriveHours <= 10;
    const fitsBefore13hLimit = cursorMs <= shiftLimit13hMs && cumulativeDriveHours <= 9;

    // Last unload step BEFORE the return-base step (e.g., when finishing the queued trips in Baunatal)
    const unloadSteps = timelineSteps.filter((s) => s.type === 'unload');
    const lastUnloadStep = unloadSteps.length > 0 ? unloadSteps[unloadSteps.length - 1] : null;

    // 4. Analyze historical Friday/Saturday weekend finishes across all weeks
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

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.action_type !== 'end-shift' && log.action_type !== 'start-shift') continue;
      const b = toBerlin(log.timestamp);
      if (b.weekday !== 'Fri' && b.weekday !== 'Sat') continue;

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

    fridayArrivalMinutes.sort((a, b) => a - b);
    const fmtMin = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    const medianMin =
      fridayArrivalMinutes.length > 0
        ? fridayArrivalMinutes[Math.floor(fridayArrivalMinutes.length / 2)]
        : 20 * 60 + 10;

    // 5. Markov chain for next trip after currentActiveTrip's target unload city
    const currentTripUnloads: string[] =
      currentActiveTrip && Array.isArray(currentActiveTrip.unload_addresses)
        ? currentActiveTrip.unload_addresses
        : [];
    const currentTripTargetAddress =
      currentTripUnloads.length > 0 ? currentTripUnloads[currentTripUnloads.length - 1] : null;
    const currentTripTargetCity = currentTripTargetAddress ? normalizeCity(currentTripTargetAddress) : null;

    // Also determine final queued destination across all openTrips
    const lastQueuedTrip = openTrips.length > 0 ? openTrips[openTrips.length - 1] : null;
    const lastQueuedUnloads: string[] =
      lastQueuedTrip && Array.isArray(lastQueuedTrip.unload_addresses) ? lastQueuedTrip.unload_addresses : [];
    const lastQueuedCity =
      lastQueuedUnloads.length > 0 ? normalizeCity(lastQueuedUnloads[lastQueuedUnloads.length - 1]) : null;

    // Pivot city for Markov prediction: if only 1 trip or none, use currentTripTargetCity || currentCity;
    // if multiple queued trips, we show both the queued next trip AND Markov after the last queued trip
    const pivotCity = lastQueuedCity || currentCity;

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
        const leadsTowardBase = [
          'Schweinfurt',
          'Reith / Obertulba',
          'Baunatal / Kirchbauna',
          'Kassel',
          'Ludwigsau',
        ].includes(nextUnloadCity);
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

    const predictedNextTrips = Array.from(transitions.values())
      .map((item) => ({
        ...item,
        probability: totalTransitionsFromPivot > 0 ? Math.round((item.count / totalTransitionsFromPivot) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

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

    // 6. Shift info and probability calculation
    const totalAnalyzedWeeks = weeks.length || 1;
    const baseFridayRate = Math.round(((fridayBaseCount + fridayReithCount) / totalAnalyzedWeeks) * 100);
    const baseWeekendRate = Math.round(
      ((fridayBaseCount + fridayReithCount + saturdayBaseCount) / totalAnalyzedWeeks) * 100
    );

    let shiftInfo = null;
    if (activeShiftStart) {
      const elapsedHours = (Date.now() - shiftStartMs) / (3600 * 1000);
      const remainingTo15h = Math.max(0, 15 - elapsedHours);
      const remainingTo13h = Math.max(0, 13 - elapsedHours);

      shiftInfo = {
        startTimeBerlin: toBerlin(activeShiftStart).timeStr,
        elapsedHours: Number(elapsedHours.toFixed(1)),
        limit13hBerlin: toBerlin(new Date(shiftLimit13hMs).toISOString()).timeStr,
        limit15hBerlin: toBerlin(new Date(shiftLimit15hMs).toISOString()).timeStr,
        remainingTo13h: Number(remainingTo13h.toFixed(1)),
        remainingTo15h: Number(remainingTo15h.toFixed(1)),
        alreadyDrivenKm: alreadyDrivenKmInShift,
        totalPlannedDriveHours: Number(cumulativeDriveHours.toFixed(2)),
        canCompleteAllAndReachBaseBefore15h: fitsBefore15hLimit,
        canCompleteAllAndReachBaseBefore13h: fitsBefore13hLimit,
        canFinishQueuedUnloadsBefore15h: lastUnloadStep ? !lastUnloadStep.exceeds15hLimit : true,
        lastUnloadDepartureBerlin: lastUnloadStep ? lastUnloadStep.departureTimeBerlin : null,
        lastUnloadCity: lastUnloadStep ? lastUnloadStep.city : null,
      };
    }

    // Dynamic probability based on whether the full planned chain fits before the 15h shift limit
    let currentFridayProbability = baseFridayRate;
    if (activeShiftStart && openTrips.length > 0) {
      if (fitsBefore13hLimit) {
        currentFridayProbability = 92;
      } else if (fitsBefore15hLimit) {
        currentFridayProbability = 80;
      } else if (lastUnloadStep && !lastUnloadStep.exceeds15hLimit) {
        // Finishes unloading in e.g. Baunatal before 21:01, but not enough time to also return 180km to Schweinfurt
        currentFridayProbability = 35;
      } else {
        currentFridayProbability = 20;
      }
    }

    const totalRemainingRoadKm = timelineSteps.reduce((acc, s) => acc + s.roadKm, 0);

    return NextResponse.json({
      base: {
        city: BASE_CITY,
        lat: BASE_LAT,
        lon: BASE_LON,
      },
      currentStatus: {
        isLiveGps: hasLiveGps,
        locationName: currentLocationName,
        city: currentCity,
        lastLoggedLocationName: lastLog?.location_name || null,
        lastActionType: lastLog?.action_type || null,
        lastActionTime: lastLog ? toBerlin(lastLog.timestamp).timeStr : null,
        roadDistToBaseKm: roadDistFromCurrentKm,
        driveHoursToBase: Number(driveHoursFromCurrent.toFixed(2)),
        openTripsQueue: openTrips.map((t, idx) => {
          const uAddrs: string[] = Array.isArray(t.unload_addresses) ? t.unload_addresses : [];
          const lAddrs: string[] = Array.isArray(t.load_addresses) ? t.load_addresses : [];
          const targetAddr = uAddrs[uAddrs.length - 1] || null;
          const tCoords = targetAddr ? resolveCoords(targetAddr) : null;
          const distBase = tCoords ? calcRoadKm(tCoords.lat, tCoords.lon, BASE_LAT, BASE_LON) : null;
          return {
            queuePosition: idx + 1,
            id: t.id,
            description: t.description,
            loadAddresses: lAddrs,
            unloadAddresses: uAddrs,
            targetUnloadAddress: targetAddr,
            targetUnloadCity: targetAddr ? normalizeCity(targetAddr) : null,
            roadDistFromTargetToBaseKm: distBase,
          };
        }),
        timelineSteps,
        totalRemainingRoadKm,
        finalArrivalAtBaseBerlin,
        shiftInfo,
      },
      fridayForecast: {
        fridayProbability: currentFridayProbability,
        weekendBaseProbability: baseWeekendRate,
        medianArrivalTime: fmtMin(medianMin),
        maxShiftEndTimeBerlin: shiftInfo ? shiftInfo.limit15hBerlin : '21:00',
        normalShiftEndTimeBerlin: shiftInfo ? shiftInfo.limit13hBerlin : '19:00',
        calculatedBaseEtaBerlin: finalArrivalAtBaseBerlin,
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
