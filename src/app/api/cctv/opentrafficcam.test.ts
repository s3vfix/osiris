import { describe, it, expect } from 'vitest';
import { mapDataset } from './opentrafficcam';

const dataset = {
  Ohio: {
    Cincinnati: [
      { description: 'I-75 at Hopple', latitude: 39.14, longitude: -84.54, direction: 'N', url: 'https://x/p.m3u8' },
      { description: 'no coords', url: 'https://x/q.m3u8' },
      { description: 'no url', latitude: 39.1, longitude: -84.5 },
      { description: 'plain http', latitude: 39.2, longitude: -84.6, url: 'http://x/s.m3u8' },
    ],
  },
  California: {
    'Los Angeles': [{ description: 'I-405', latitude: 34.0, longitude: -118.4, url: 'https://x/r.m3u8' }],
  },
};

describe('mapDataset', () => {
  it('maps an HLS camera and keeps the heading in the name', () => {
    expect(mapDataset(dataset)).toEqual([{
      id: 'otcm-Ohio-Cincinnati-0',
      lat: 39.14,
      lng: -84.54,
      name: 'I-75 at Hopple (N)',
      city: 'Cincinnati, Ohio',
      country: 'US',
      stream_url: 'https://x/p.m3u8',
      stream_type: 'hls',
      source: 'OpenTrafficCamMap',
    }]);
  });

  it('skips states OSIRIS already indexes from the authority itself', () => {
    expect(mapDataset(dataset).some(c => c.city.endsWith('California'))).toBe(false);
  });

  it('drops a plain-http stream, which cannot play on an https page', () => {
    expect(mapDataset(dataset).some(c => c.stream_url?.startsWith('http://'))).toBe(false);
  });

  it('drops rows with no coordinates, no stream, or an insecure stream', () => {
    expect(mapDataset(dataset)).toHaveLength(1);
  });

  it('survives an empty payload', () => {
    expect(mapDataset({})).toEqual([]);
  });
});
