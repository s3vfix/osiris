import { describe, it, expect } from 'vitest';
import { mapAircraft } from './fr24';

/** A real row from the Europe zone. */
const row = ['40772E', 41.92, 40.79, 77, 34450, 459, '', 'T-MLAT1', 'A20N', 'G-UZHY',
             1788886030, 'LTN', 'TBS', 'U22649', 0, -896, 'EZY2649', 0, 'EZY'];

describe('mapAircraft', () => {
  it('maps a row into the ADSBexchange-v2 shape the classifier reads', () => {
    expect(mapAircraft(row)).toEqual({
      hex: '40772e',
      flight: 'U22649',
      lat: 41.92,
      lon: 40.79,
      alt_baro: 34450,
      gs: 459,
      track: 77,
      squawk: '',
      t: 'A20N',
      r: 'G-UZHY',
    });
  });

  it('rejects the feed metadata keys', () => {
    expect(mapAircraft(4000)).toBeNull();       // full_count
    expect(mapAircraft('4')).toBeNull();        // version
    expect(mapAircraft([])).toBeNull();
  });

  it('rejects an aircraft with no transponder hex', () => {
    expect(mapAircraft(['', 41.9, 40.7, ...row.slice(3)])).toBeNull();
  });

  it('rejects the 0,0 padding FR24 uses for an unknown position', () => {
    expect(mapAircraft(['40772E', 0, 0, ...row.slice(3)])).toBeNull();
  });

  it('leaves altitude in feet and speed in knots, not converted twice', () => {
    const ac = mapAircraft(row)!;
    expect(ac.alt_baro).toBe(34450);
    expect(ac.gs).toBe(459);
  });
});
