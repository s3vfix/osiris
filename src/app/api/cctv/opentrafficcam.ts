import { isSecureFeed, type CctvCamera } from './types';

/**
 * OSIRIS - OpenTrafficCamMap (United States)
 * Source: https://github.com/AidanWelch/OpenTrafficCamMap
 * ~7000 crowdsourced state-DOT traffic cameras as raw HLS streams,
 * served as one static JSON from GitHub - NO API KEY NEEDED.
 *
 * Structure: { State: { City: [{ description, latitude, longitude,
 *             direction, url, encoding, format }] } }
 */

const DATASET_URL =
  'https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json';

/**
 * States OSIRIS already indexes from the traffic authority itself
 * (arizona.ts, georgia.ts, indiana.ts, Caltrans in us-west). Taking them from
 * here as well would put two pins on every camera.
 */
const ALREADY_COVERED = new Set(['Arizona', 'Georgia', 'Indiana', 'California']);

interface OtcmCamera {
  description?: string;
  latitude?: number;
  longitude?: number;
  direction?: string;
  url?: string;
}

export function mapDataset(data: Record<string, Record<string, OtcmCamera[]>>): CctvCamera[] {
  const cams: CctvCamera[] = [];

  for (const [state, cities] of Object.entries(data || {})) {
    if (ALREADY_COVERED.has(state)) continue;

    for (const [city, list] of Object.entries(cities || {})) {
      (list || []).forEach((cam, i) => {
        if (!Number.isFinite(cam.latitude) || !Number.isFinite(cam.longitude) || !cam.url) return;
        // 299 of the ~3500 streams are plain http and cannot play on an https page.
        if (!isSecureFeed(cam.url)) return;

        const direction = cam.direction ? ` (${cam.direction})` : '';
        cams.push({
          id: `otcm-${state}-${city}-${i}`.replace(/\s+/g, '_'),
          lat: cam.latitude!,
          lng: cam.longitude!,
          name: `${cam.description || `${city} Traffic Cam`}${direction}`,
          city: `${city}, ${state}`,
          country: 'US',
          stream_url: cam.url,
          stream_type: 'hls',
          source: 'OpenTrafficCamMap',
        });
      });
    }
  }

  return cams;
}

export async function fetchOpenTrafficCamCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch(DATASET_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    return mapDataset(await res.json());
  } catch {
    return [];
  }
}
