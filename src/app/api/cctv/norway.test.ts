import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import {
  extractKml,
  parseKamerakartetKml,
  resolveImageUrl,
  resolveEmbedUrl,
  isViewerPage,
} from './norway';

/** Build a one-entry zip the same shape Kamerakartet ships. */
function makeKmz(name: string, contents: string): Buffer {
  const nameBuf = Buffer.from(name);
  const body = deflateRawSync(Buffer.from(contents));
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);  // local file header signature
  header.writeUInt16LE(20, 4);          // version needed
  header.writeUInt16LE(8, 8);           // compression: deflate
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(contents.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  return Buffer.concat([header, nameBuf, body]);
}

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml><Document>
  <Placemark>
    <name>Bergen - Danmarksplass</name>
    <description><![CDATA[<a href="https://www.vegvesen.no/trafikk/vaerveikamera/1234">Vis kamera</a>]]></description>
    <Point><coordinates>5.33,60.37,0</coordinates></Point>
  </Placemark>
  <Placemark>
    <name>Voss</name>
    <description><![CDATA[<a href="https://multi.kamerakartet.no/voss.html">Vis kamera</a>]]></description>
    <Point><coordinates>6.41,60.63,0</coordinates></Point>
  </Placemark>
  <Placemark>
    <name>Broken - no coordinates</name>
    <description><![CDATA[<a href="https://example.com/cam.jpg">Vis kamera</a>]]></description>
  </Placemark>
</Document></kml>`;

describe('extractKml', () => {
  it('inflates the .kml entry out of a KMZ with no zip dependency', () => {
    expect(extractKml(makeKmz('alle.kml', KML))).toBe(KML);
  });

  it('throws when the archive holds no .kml', () => {
    expect(() => extractKml(makeKmz('readme.txt', 'nope'))).toThrow(/no .kml entry/);
  });
});

describe('parseKamerakartetKml', () => {
  it('reads name, link and lon,lat order, and drops placemarks missing a point', () => {
    const parsed = parseKamerakartetKml(KML);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      name: 'Bergen - Danmarksplass',
      href: 'https://www.vegvesen.no/trafikk/vaerveikamera/1234',
      lat: 60.37,
      lng: 5.33,
    });
  });
});

describe('resolveImageUrl', () => {
  it('rewrites a vegvesen camera page to its unauthenticated image API', () => {
    expect(resolveImageUrl('https://www.vegvesen.no/trafikk/vaerveikamera/1234'))
      .toBe('https://kamera.atlas.vegvesen.no/api/images/1234_1');
  });

  it('passes through direct stills and Axis CGI endpoints', () => {
    expect(resolveImageUrl('http://x.no/cam.jpg')).toBe('http://x.no/cam.jpg');
    expect(resolveImageUrl('http://1.2.3.4:8005/axis-cgi/jpg/image.cgi'))
      .toBe('http://1.2.3.4:8005/axis-cgi/jpg/image.cgi');
  });

  it('rejects a page that only wraps a camera', () => {
    expect(resolveImageUrl('https://www.skistar.com/hemsedal/webcam')).toBeNull();
  });
});

describe('resolveEmbedUrl', () => {
  it('turns every YouTube link shape carrying an id into an embed', () => {
    const embed = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1';
    expect(resolveEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(embed);
    expect(resolveEmbedUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(embed);
    expect(resolveEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(embed);
  });

  it('skips a channel live link with no video id', () => {
    expect(resolveEmbedUrl('https://www.youtube.com/@nrk/live')).toBeNull();
  });

  it('passes iframe-playable player pages through', () => {
    expect(resolveEmbedUrl('https://g0.ipcamlive.com/player/player.php?alias=abc'))
      .toBe('https://g0.ipcamlive.com/player/player.php?alias=abc');
  });
});

describe('isViewerPage', () => {
  it('matches both viewer hosts', () => {
    expect(isViewerPage('https://multi.kamerakartet.no/x.html')).toBe(true);
    expect(isViewerPage('https://multi-n.kamerakartet.no/x.html')).toBe(true);
    expect(isViewerPage('https://kamerakartet.no/tekst')).toBe(false);
  });
});
