import { inflateRawSync } from 'node:zlib';
import type { CctvCamera } from './types';

/**
 * OSIRIS - Norway CCTV Cameras (Kamerakartet)
 * Source: https://kmz.kamerakartet.no/pm/alle.kmz
 * ~1700 placemarks covering Statens vegvesen road cameras, harbour cams,
 * ski resorts and privately hosted webcams - NO API KEY NEEDED.
 *
 * Kamerakartet publishes one KMZ (a zip holding a single .kml) rather than a
 * JSON API, so this module unzips it, parses the placemarks, and resolves each
 * placemark link into something the map can actually render.
 */

const KMZ_URL = 'https://kmz.kamerakartet.no/pm/alle.kmz';

/**
 * Extract the .kml entry from a KMZ buffer using only Node's zlib.
 *
 * A KMZ is a plain zip. Kamerakartet ships exactly one deflated entry with
 * correct sizes in its local file header, so walking local headers is enough -
 * no central-directory parse, and no zip dependency.
 */
export function extractKml(buf: Buffer): string {
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const csize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString();
    const start = off + 30 + nameLen + extraLen;
    // csize 0 means a streamed entry with the size in a trailing data
    // descriptor; slicing to the end of the buffer still inflates correctly.
    const body = csize > 0 ? buf.subarray(start, start + csize) : buf.subarray(start);

    if (name.toLowerCase().endsWith('.kml')) {
      return method === 0 ? body.toString('utf-8') : inflateRawSync(body).toString('utf-8');
    }
    if (csize === 0) break;
    off = start + csize;
  }
  throw new Error('KMZ contained no .kml entry');
}

interface Placemark {
  name: string;
  href: string;
  lat: number;
  lng: number;
}

/**
 * Parse Kamerakartet's KML into placemarks. Shape:
 *   <Placemark><name>..</name>
 *     <description><![CDATA[<a href="URL">Vis kamera</a>]]></description>
 *     <Point><coordinates>lon,lat,alt</coordinates></Point></Placemark>
 */
export function parseKamerakartetKml(kml: string): Placemark[] {
  const out: Placemark[] = [];
  for (const pm of kml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || []) {
    const name = pm.match(/<name>([^<]*)<\/name>/)?.[1]?.trim();
    const href = pm.match(/<a href="([^"]*)">/)?.[1];
    const coords = pm.match(/<coordinates>([^<]*)<\/coordinates>/)?.[1];
    if (!name || !href || !coords) continue;

    const [lonStr, latStr] = coords.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    out.push({ name, href: href.replace(/&amp;/g, '&'), lat, lng });
  }
  return out;
}

/**
 * Resolve a placemark link into a direct image URL (JPEG snapshot or MJPEG
 * stream - both render in an <img>). Only link shapes confirmed to serve raw
 * image bytes are accepted:
 *   - direct .jpg/.jpeg/.png/.mjpg/.mjpeg URLs
 *   - vegvesen.no camera pages, rewritten to their public unauthenticated
 *     image API (kamera.atlas.vegvesen.no/api/images/{id}_1)
 *   - that image API called directly
 *   - Axis network camera CGI endpoints, a fixed vendor convention
 */
export function resolveImageUrl(href: string): string | null {
  if (/\.(jpe?g|png|mjpe?g)(\?|$)/i.test(href)) return href;
  if (/kamera\.atlas\.vegvesen\.no\/api\/images\//i.test(href)) return href;
  const vegvesen = href.match(/vegvesen\.no\/trafikk\/vaerveikamera\/(\d+)/);
  if (vegvesen) return `https://kamera.atlas.vegvesen.no/api/images/${vegvesen[1]}_1`;
  if (/axis-cgi\/(jpg\/image|mjpg\/video)\.cgi/i.test(href)) return href;
  return null;
}

/**
 * Resolve a link that an iframe can play. YouTube links carrying a video ID
 * become official embeds; ipcamlive and SkylineWebcams player pages are passed
 * through, since inferStreamType() already classes both as iframe.
 *
 * youtube.com/@handle/live is skipped on purpose - it means "whatever this
 * channel is streaming now" with no ID in the URL, which needs the YouTube
 * Data API to resolve.
 */
export function resolveEmbedUrl(href: string): string | null {
  const yt = href.match(/youtu\.be\/([\w-]{6,})/)
    || href.match(/youtube\.com\/(?:live|embed)\/([\w-]{6,})/)
    || href.match(/youtube\.com\/watch\?v=([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1`;
  if (/ipcamlive\.com\/player|skylinewebcams\.com/i.test(href)) return href;
  return null;
}

/** Kamerakartet's own viewer pages - tiny static HTML wrapping the real snapshot. */
export function isViewerPage(href: string): boolean {
  return /multi(-n)?\.kamerakartet\.no\//i.test(href);
}

/**
 * Resolved viewer pages, cached far longer than the camera index itself.
 *
 * 202 placemarks point at a viewer page, and each one costs a second HTTP hop
 * to turn into an image URL. These pages change on the order of months, so
 * caching them for 6h (30min on failure) keeps the cost to one cold run rather
 * than one per index refresh.
 */
const viewerCache = new Map<string, { url: string | null; expiresAt: number }>();

async function resolveViewerPage(href: string): Promise<string | null> {
  const hit = viewerCache.get(href);
  if (hit && Date.now() < hit.expiresAt) return hit.url;

  let url: string | null = null;
  try {
    const res = await fetch(href, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'OSIRIS/1.0' },
    });
    if (res.ok) {
      const html = await res.text();
      url = html.match(/<img[^>]+src="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&') ?? null;
    }
  } catch {
    url = null;
  }
  viewerCache.set(href, { url, expiresAt: Date.now() + (url ? 6 * 3600_000 : 1800_000) });
  return url;
}

/**
 * Resolve viewer pages with bounded concurrency and an overall time budget, so
 * a cold cache cannot stall the whole Norway region. Anything past the budget
 * is left for the next refresh, which finds it cache-warm.
 */
async function resolveViewerPages(
  hrefs: string[],
  budgetMs = 8000,
  concurrency = 20,
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const deadline = Date.now() + budgetMs;
  let i = 0;

  const worker = async () => {
    while (i < hrefs.length && Date.now() < deadline) {
      const href = hrefs[i++];
      results.set(href, await resolveViewerPage(href));
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/**
 * Hand-curated Norwegian webcams the KMZ cannot resolve automatically -
 * privately hosted stills and live HLS streams. Added one at a time.
 */
const MANUAL_CAMERAS: CctvCamera[] = [
  {
    id: 'no-manual-oslohavn-radhuskaia',
    lat: 59.9110, lng: 10.7300,
    name: 'Oslo Havn - Rådhuskaia', city: 'Oslo', country: 'Norway',
    feed_url: 'https://www.oslohavn.no/webcam/raadhusintranett.jpg',
    stream_type: 'jpg', source: 'Kamerakartet',
  },
  {
    id: 'no-manual-oslohavn-kavringen',
    lat: 59.8094, lng: 10.6925,
    name: 'Oslo Havn - Kavringen', city: 'Oslo', country: 'Norway',
    feed_url: 'https://www.oslohavn.no/webcam/kavringen.jpg',
    stream_type: 'jpg', source: 'Kamerakartet',
  },
  {
    id: 'no-manual-oslohavn-vippetangen',
    lat: 59.9038, lng: 10.7488,
    name: 'Oslo Havn - Vippetangen', city: 'Oslo', country: 'Norway',
    feed_url: 'https://www.oslohavn.no/webcam/vippetangen.jpg',
    stream_type: 'jpg', source: 'Kamerakartet',
  },
  {
    id: 'no-manual-drobak-gjestebrygga',
    lat: 59.6636, lng: 10.6280,
    name: 'Drøbak Gjestebrygga', city: 'Drøbak', country: 'Norway',
    feed_url: 'http://193.214.77.234:8005/axis-cgi/jpg/image.cgi',
    stream_type: 'mjpeg', source: 'Kamerakartet',
  },
  {
    id: 'no-manual-bergen-vaagen',
    lat: 60.39647, lng: 5.32079,
    name: 'Bergen - Vågen', city: 'Bergen', country: 'Norway',
    stream_url: 'https://stream1.vossaskyen.no/bt/Vaagen.stream/playlist.m3u8',
    stream_type: 'hls', source: 'Kamerakartet',
  },
];

/** Kamerakartet names read "Region - Place"; the prefix is the best city label. */
function cityFromName(name: string): string {
  return name.includes(' - ') ? name.split(' - ')[0].trim() : 'Norway';
}

export async function fetchNorwayCameras(): Promise<CctvCamera[]> {
  try {
    const res = await fetch(KMZ_URL, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return MANUAL_CAMERAS;

    const placemarks = parseKamerakartetKml(extractKml(Buffer.from(await res.arrayBuffer())));

    const viewerHrefs = [...new Set(placemarks.filter(p => isViewerPage(p.href)).map(p => p.href))];
    const resolvedViewers = viewerHrefs.length ? await resolveViewerPages(viewerHrefs) : new Map();

    const cams: CctvCamera[] = [];
    for (const p of placemarks) {
      const image = isViewerPage(p.href)
        ? resolvedViewers.get(p.href) ?? null
        : resolveImageUrl(p.href);
      const embed = image ? null : resolveEmbedUrl(p.href);
      if (!image && !embed) continue;

      cams.push({
        id: `no-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}`,
        lat: p.lat,
        lng: p.lng,
        name: p.name,
        city: cityFromName(p.name),
        country: 'Norway',
        ...(image
          ? { feed_url: image, stream_type: 'jpg' as const }
          : { stream_url: embed!, stream_type: 'iframe' as const }),
        external_url: p.href,
        source: 'Kamerakartet',
      });
    }

    return [...cams, ...MANUAL_CAMERAS];
  } catch {
    return MANUAL_CAMERAS;
  }
}
