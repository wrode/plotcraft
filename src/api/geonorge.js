const ADDRESS_API = 'https://ws.geonorge.no/adresser/v1';

export async function searchAddresses(query) {
  if (!query || query.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    sok: query,
    treffPerSide: '10',
    utkoordsys: '4326', // WGS84 for Leaflet
  });

  const response = await fetch(`${ADDRESS_API}/sok?${params}`);

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const data = await response.json();

  return data.adresser.map(addr => ({
    id: addr.adressekode + '-' + addr.nummer + (addr.bokstav || ''),
    text: addr.adressetekst,
    streetName: addr.adressenavn,
    number: addr.nummer,
    letter: addr.bokstav || '',
    postalCode: addr.postnummer,
    postalPlace: addr.poststed,
    municipality: addr.kommunenavn,
    municipalityCode: addr.kommunenummer,
    lat: addr.representasjonspunkt?.lat,
    lon: addr.representasjonspunkt?.lon,
    // Cadastral info for future parcel lookup
    gardsnummer: addr.gardsnummer,
    bruksnummer: addr.bruksnummer,
  }));
}

export async function reverseGeocode(lat, lon, radius = 100) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius: radius.toString(),
    koordsys: '4326',
    utkoordsys: '4326',
    treffPerSide: '1',
  });

  const response = await fetch(`${ADDRESS_API}/punktsok?${params}`);

  if (!response.ok) {
    throw new Error(`Reverse geocode failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.adresser.length === 0) {
    return null;
  }

  const addr = data.adresser[0];
  return {
    text: addr.adressetekst,
    municipality: addr.kommunenavn,
    distance: addr.meterDistanseTilPunkt,
  };
}
