// Matrikkel WFS API for fetching property parcel polygons
const WFS_BASE = 'https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig';

// Convert WGS84 (lat/lon) to UTM33N (EPSG:25833)
// Simplified conversion - for Norway
function wgs84ToUtm33(lat, lon) {
  // UTM zone 33 central meridian is 15°E
  const k0 = 0.9996;
  const a = 6378137; // WGS84 semi-major axis
  const e = 0.0818192; // WGS84 eccentricity
  const e2 = e * e;

  const lonRad = lon * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const lon0 = 15 * Math.PI / 180; // Central meridian for zone 33

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = (e2 / (1 - e2)) * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lon0);

  const M = a * (
    (1 - e2/4 - 3*e2*e2/64) * latRad
    - (3*e2/8 + 3*e2*e2/32) * Math.sin(2*latRad)
    + (15*e2*e2/256) * Math.sin(4*latRad)
  );

  const easting = k0 * N * (A + (1-T+C)*A**3/6) + 500000;
  const northing = k0 * (M + N * Math.tan(latRad) * (A**2/2 + (5-T+9*C+4*C**2)*A**4/24));

  return { easting, northing };
}

// Convert UTM33N back to WGS84 (simplified)
function utm33ToWgs84(easting, northing) {
  const k0 = 0.9996;
  const a = 6378137;
  const e = 0.0818192;
  const e2 = e * e;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const x = easting - 500000;
  const y = northing;

  const M = y / k0;
  const mu = M / (a * (1 - e2/4 - 3*e2*e2/64));

  const phi1 = mu + (3*e1/2 - 27*e1**3/32) * Math.sin(2*mu)
    + (21*e1**2/16) * Math.sin(4*mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1)**2);
  const T1 = Math.tan(phi1)**2;
  const C1 = (e2/(1-e2)) * Math.cos(phi1)**2;
  const R1 = a * (1-e2) / Math.pow(1 - e2*Math.sin(phi1)**2, 1.5);
  const D = x / (N1 * k0);

  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D**2/2 - (5+3*T1)*D**4/24);
  const lon = (15 * Math.PI / 180) + (D - (1+2*T1+C1)*D**3/6) / Math.cos(phi1);

  return {
    lat: lat * 180 / Math.PI,
    lon: lon * 180 / Math.PI
  };
}

// Parse GML polygon to array of [lon, lat] coordinates
function parseGmlPolygon(gmlText) {
  // Extract coordinates from GML posList
  const posListMatch = gmlText.match(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/);
  if (!posListMatch) return null;

  const coordsText = posListMatch[1].trim();
  const values = coordsText.split(/\s+/).map(Number);

  // GML posList is pairs of easting, northing (UTM)
  const coords = [];
  for (let i = 0; i < values.length; i += 2) {
    const easting = values[i];
    const northing = values[i + 1];
    const wgs84 = utm33ToWgs84(easting, northing);
    coords.push([wgs84.lon, wgs84.lat]);
  }

  return coords;
}

// Fetch property parcel (Teig) by coordinates
export async function fetchPropertyParcel(lat, lon) {
  // Convert to UTM33 and create a small bbox around the point
  const utm = wgs84ToUtm33(lat, lon);
  const buffer = 100; // 100m buffer

  const bbox = [
    utm.easting - buffer,
    utm.northing - buffer,
    utm.easting + buffer,
    utm.northing + buffer
  ].join(',');

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: 'Teig',
    BBOX: `${bbox},EPSG:25833`,
    SRSNAME: 'EPSG:25833',
    COUNT: '10'
  });

  const response = await fetch(`${WFS_BASE}?${params}`);

  if (!response.ok) {
    throw new Error(`WFS request failed: ${response.status}`);
  }

  const xmlText = await response.text();

  // Parse the GML response
  const parcels = parseTeigFeatures(xmlText, lat, lon);

  if (parcels.length === 0) {
    throw new Error('No property parcel found at this location');
  }

  // Return the parcel that contains our point (or closest)
  return parcels[0];
}

// Parse Teig features from WFS GML response
function parseTeigFeatures(xmlText, targetLat, targetLon) {
  const parcels = [];

  // Simple regex-based parsing (would use DOMParser in production)
  const teigMatches = xmlText.matchAll(/<app:Teig[^>]*>([\s\S]*?)<\/app:Teig>/g);

  for (const match of teigMatches) {
    const teigXml = match[1];

    // Extract matrikkelnummer
    const matrikkelMatch = teigXml.match(/<app:matrikkelnummer>([^<]+)<\/app:matrikkelnummer>/);
    const matrikkelnummer = matrikkelMatch ? matrikkelMatch[1] : 'Unknown';

    // Extract teig ID
    const teigIdMatch = teigXml.match(/<app:teigId>([^<]+)<\/app:teigId>/);
    const teigId = teigIdMatch ? teigIdMatch[1] : null;

    // Extract area
    const areaMatch = teigXml.match(/<app:beregnetAreal>([^<]+)<\/app:beregnetAreal>/);
    const area = areaMatch ? parseFloat(areaMatch[1]) : null;

    // Extract polygon coordinates
    const omradeMatch = teigXml.match(/<app:område>([\s\S]*?)<\/app:område>/);
    if (omradeMatch) {
      const coords = parseGmlPolygon(omradeMatch[1]);
      if (coords) {
        parcels.push({
          id: teigId,
          matrikkelnummer,
          area,
          polygon: coords, // Array of [lon, lat] pairs
          type: 'Polygon'
        });
      }
    }
  }

  // Sort by distance to target point (to get the correct parcel)
  parcels.sort((a, b) => {
    const distA = distanceToPolygon(targetLat, targetLon, a.polygon);
    const distB = distanceToPolygon(targetLat, targetLon, b.polygon);
    return distA - distB;
  });

  return parcels;
}

// Simple distance check (point to polygon centroid)
function distanceToPolygon(lat, lon, polygon) {
  if (!polygon || polygon.length === 0) return Infinity;

  // Calculate centroid
  let sumLat = 0, sumLon = 0;
  for (const [pLon, pLat] of polygon) {
    sumLat += pLat;
    sumLon += pLon;
  }
  const centLat = sumLat / polygon.length;
  const centLon = sumLon / polygon.length;

  // Euclidean distance (good enough for sorting)
  return Math.sqrt((lat - centLat) ** 2 + (lon - centLon) ** 2);
}
