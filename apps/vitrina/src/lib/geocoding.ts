import 'server-only';

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface GoogleGeocodeResponse {
  status: string;
  results: {
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
  }[];
}

/**
 * Geocodifica una dirección con la Google Maps Geocoding API. Server-only:
 * la key no tiene restricción de dominio, así que nunca debe llegar al
 * navegador (ver GOOGLE_MAPS_API_KEY en .env.example).
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY no está configurada en el servidor.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Geocoding respondió ${response.status}.`);
  }

  const data = (await response.json()) as GoogleGeocodeResponse;
  if (data.status !== 'OK' || data.results.length === 0) {
    return null;
  }

  const result = data.results[0];
  if (!result) return null;

  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}
