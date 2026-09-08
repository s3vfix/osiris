/**
 * OSIRIS - FlightRadar24 zone feed.
 *
 * The keyless global source for civilian traffic. OpenSky's anonymous pool is
 * 400 credits/day, which cannot sustain a live map, and the free
 * tar1090-shaped feeds this route used to fan out to are all key-gated or dead
 * now - so without OpenSky credentials the map had commercial, private and jet
 * traffic at zero while only the military feed answered.
 *
 * Aircraft come back in the same ADSBexchange-v2 field shape the rest of this
 * route already speaks, so classifyFlight() works on them unchanged. FR24
 * carries the aircraft type and registration that OpenSky omits, which means
 * the type-based half of that classifier finally fires.
 *
 * Each aircraft is a 19-element array:
 *   [0]=icao24 [1]=lat [2]=lon [3]=heading [4]=alt_ft [5]=speed_kts [6]=squawk
 *   [7]=radar [8]=type [9]=registration [10]=timestamp [11]=origin [12]=dest
 *   [13]=callsign [14]=? [15]=vert_rate [16]=flight_no [17]=? [18]=airline
 */

/** Seven boxes covering inhabited airspace; the feed caps each at 1500 aircraft. */
const ZONES = [
  '72,35,-15,45',      // Europe
  '72,15,-170,-50',    // North America
  '15,-60,-90,-30',    // South America
  '45,10,25,65',       // Middle East
  '55,5,65,150',       // East Asia
  '5,-50,100,180',     // Oceania
  '38,-40,-20,55',     // Africa
];

const FEED = 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js';
const PARAMS = 'faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=0&air=1&vehicles=0&estimated=0&maxage=14400&gliders=0&stats=0&limit=1500';

/** ADSBexchange-v2 shaped record, the shape classifyFlight() reads. */
export interface AdsbShapedAircraft {
  hex: string;
  flight: string;
  lat: number;
  lon: number;
  alt_baro: number | null;
  gs: number | null;
  track: number | null;
  squawk: string;
  t: string;
  r: string;
}

/**
 * Map one FR24 row. The feed also carries `full_count` and `version` keys,
 * and rows for aircraft with no transponder hex, so callers get null for
 * anything that is not a usable aircraft.
 */
export function mapAircraft(row: unknown): AdsbShapedAircraft | null {
  if (!Array.isArray(row) || row.length < 15) return null;

  const hex = String(row[0] || '').toLowerCase().trim();
  const lat = row[1];
  const lon = row[2];
  if (!hex || typeof lat !== 'number' || typeof lon !== 'number') return null;
  // FR24 pads unknown positions with 0,0 rather than omitting the row.
  if (lat === 0 && lon === 0) return null;

  return {
    hex,
    flight: String(row[13] || '').trim(),
    lat,
    lon,
    // Already feet and knots, which is what the classifier expects.
    alt_baro: typeof row[4] === 'number' ? row[4] : null,
    gs: typeof row[5] === 'number' ? row[5] : null,
    track: typeof row[3] === 'number' ? row[3] : null,
    squawk: String(row[6] || ''),
    t: String(row[8] || ''),
    r: String(row[9] || ''),
  };
}

async function fetchZone(bounds: string): Promise<AdsbShapedAircraft[]> {
  try {
    const res = await fetch(`${FEED}?bounds=${bounds}&${PARAMS}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OSIRIS/1.0)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return [];
    }
    const data = await res.json();
    const out: AdsbShapedAircraft[] = [];
    for (const row of Object.values(data)) {
      const ac = mapAircraft(row);
      if (ac) out.push(ac);
    }
    return out;
  } catch {
    return [];
  }
}

/** All zones at once. A zone that fails contributes nothing rather than throwing. */
export async function fetchFr24Aircraft(): Promise<AdsbShapedAircraft[]> {
  const zones = await Promise.all(ZONES.map(fetchZone));
  return zones.flat();
}
