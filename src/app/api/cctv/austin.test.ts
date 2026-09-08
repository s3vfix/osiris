import { describe, it, expect } from 'vitest';
import { mapRecords } from './austin';

const rows = [
  {
    camera_id: '17',
    location_name: '  Congress / 6th  ',
    camera_status: 'TURNED_ON',
    screenshot_address: 'https://cctv.austinmobility.io/image/17.jpg',
    location: { coordinates: [-97.7431, 30.2672] as [number, number] },
  },
  {
    camera_id: '18',
    location_name: 'Dead camera',
    camera_status: 'TURNED_OFF',
    screenshot_address: 'https://cctv.austinmobility.io/image/18.jpg',
    location: { coordinates: [-97.74, 30.26] as [number, number] },
  },
  { camera_id: '19', location_name: 'No geometry', camera_status: 'TURNED_ON', screenshot_address: 'https://x/19.jpg' },
];

describe('mapRecords', () => {
  it('maps a live camera, trims the name and reads lng,lat order', () => {
    expect(mapRecords(rows)).toEqual([{
      id: 'austin-17',
      lat: 30.2672,
      lng: -97.7431,
      name: 'Congress / 6th',
      city: 'Austin, TX',
      country: 'US',
      feed_url: 'https://cctv.austinmobility.io/image/17.jpg',
      stream_type: 'jpg',
      source: 'City of Austin',
    }]);
  });

  it('drops cameras that are switched off or have no location', () => {
    expect(mapRecords(rows)).toHaveLength(1);
  });
});
