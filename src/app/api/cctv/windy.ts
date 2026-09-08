import type { CctvCamera } from './types';

/**
 * OSIRIS - Windy Webcams (global)
 * Source: https://api.windy.com/webcams/api/v3/webcams
 * Scenic and weather webcams worldwide, each with an official iframe player.
 *
 * Needs WINDY_API_KEY (free tier). Without one this source is simply absent,
 * like every other optional key in OSIRIS.
 *
 * The API also returns a still image per webcam, but those URLs are
 * token-secured and expire after ~10 minutes, while camera indexes here are
 * cached for 30. The embed player carries no token and does not expire, so
 * that is what gets handed to the map.
 */

const API = 'https://api.windy.com/webcams/api/v3/webcams';

/** Free tier caps limit at 50 per request and offset at 1000 overall. */
const PAGE_SIZE = 50;
const PAGES = 4;

interface WindyWebcam {
  webcamId: number;
  title?: string;
  status?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
  };
}

export function mapWebcams(webcams: WindyWebcam[]): CctvCamera[] {
  return (webcams || [])
    .filter(w => w.status === 'active' && Number.isFinite(w.location?.latitude) && Number.isFinite(w.location?.longitude))
    .map(w => ({
      id: `windy-${w.webcamId}`,
      lat: w.location!.latitude!,
      lng: w.location!.longitude!,
      name: w.title || 'Windy Webcam',
      city: w.location!.city || w.location!.region || 'Unknown',
      country: w.location!.country || 'Unknown',
      // Matches the iframe shape inferStreamType() already recognises.
      stream_url: `https://www.windy.com/webcams/${w.webcamId}/embed`,
      stream_type: 'iframe' as const,
      external_url: `https://www.windy.com/webcams/${w.webcamId}`,
      source: 'Windy',
    }));
}

export async function fetchWindyCameras(): Promise<CctvCamera[]> {
  const apiKey = process.env.WINDY_API_KEY;
  if (!apiKey) return [];

  const cams: CctvCamera[] = [];
  try {
    for (let page = 0; page < PAGES; page++) {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        include: 'location',
        // Popularity order, so a capped pull is the webcams people actually watch.
        order: 'hotness',
      });
      const res = await fetch(`${API}?${params}`, {
        headers: { 'x-windy-api-key': apiKey },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) break;

      const data = await res.json();
      cams.push(...mapWebcams(data.webcams));
      if (!data.webcams || data.webcams.length < PAGE_SIZE) break;
    }
  } catch {
    return cams;
  }
  return cams;
}
