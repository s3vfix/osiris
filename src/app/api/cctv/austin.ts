import type { CctvCamera } from './types';

/**
 * OSIRIS - Austin, Texas CCTV Cameras
 * Source: https://data.austintexas.gov/resource/b4k4-adkb.json
 * City of Austin open-data traffic cameras - NO API KEY NEEDED.
 */

const API_URL = 'https://data.austintexas.gov/resource/b4k4-adkb.json?$limit=2000';

interface AustinRecord {
  camera_id?: string;
  location_name?: string;
  camera_status?: string;
  screenshot_address?: string;
  location?: { coordinates?: [number, number] };
}

export function mapRecords(rows: AustinRecord[]): CctvCamera[] {
  return (rows || [])
    .filter(r => r.camera_status === 'TURNED_ON' && r.screenshot_address && r.location?.coordinates)
    .map(r => ({
      id: `austin-${r.camera_id}`,
      lat: r.location!.coordinates![1],
      lng: r.location!.coordinates![0],
      name: (r.location_name || 'Austin Traffic Cam').trim(),
      city: 'Austin, TX',
      country: 'US',
      feed_url: r.screenshot_address!,
      stream_type: 'jpg' as const,
      source: 'City of Austin',
    }))
    .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

export async function fetchAustinCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    return mapRecords(await res.json());
  } catch {
    return [];
  }
}
