export type CctvStreamType = 'jpg' | 'hls' | 'iframe' | 'mjpeg';

export interface CctvCamera {
  id: string;
  lat: number;
  lng: number;
  name: string;
  city: string;
  country: string;
  /** Static image URL (MJPEG/JPG snapshot) */
  feed_url?: string;
  /** Live video stream (HLS .m3u8) or embed URL (YouTube/rtsp.me) */
  stream_url?: string;
  stream_type?: CctvStreamType;
  external_url?: string;
  source: string;
}

export function normalizeFeedUrl(url: string): string {
  if (url.startsWith('pics/')) {
    return `http://free-webcambg.com/${url.split('?')[0]}`;
  }
  return url.split('?')[0];
}

export function inferStreamType(url: string): CctvStreamType {
  if (/\.m3u8(\?|$)/i.test(url)) return 'hls';
  if (/youtube\.com\/embed|youtube-nocookie\.com\/embed|rtsp\.me\/embed|ipcamlive\.com\/player|click2stream\.com|windy\.com\/webcams\/\d+\/embed|skylinewebcams\.com|voyage\.aprr\.fr/i.test(url)) {
    return 'iframe';
  }
  return 'jpg';
}

/**
 * A plain-http feed cannot render on an https page: browsers auto-upgrade
 * image and media requests and block whatever fails, so such a camera is a
 * dead pin rather than a working one. Sources whose upstream index mixes both
 * schemes filter with this rather than shipping tiles that cannot load.
 */
export function isSecureFeed(url: string): boolean {
  return url.startsWith('https://');
}
