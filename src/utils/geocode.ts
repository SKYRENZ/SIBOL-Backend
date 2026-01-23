import axios from "axios";

export async function geocodeAddress(address: string) {
  const photon = await callPhoton(address);
  if (photon) return photon;
  return callNominatim(address);
}

async function callPhoton(address: string) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'SIBOL-App/1.0' } });
    if (data.features && data.features.length > 0) {
      const { geometry } = data.features[0];
      return { lat: geometry.coordinates[1], lon: geometry.coordinates[0] };
    }
    return null;
  } catch (error) {
    console.error("Photon geocoding error:", error);
    return null;
  }
}

async function callNominatim(address: string) {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;
    const response = await axios.get(url, { headers: { 'User-Agent': 'SIBOL-App/1.0' } });
    if (response.data && response.data.length > 0) {
      const { lat, lon } = response.data[0];
      return { lat: parseFloat(lat), lon: parseFloat(lon) };
    }
    return null;
  } catch (error) {
    console.error("Nominatim geocoding error:", error);
    return null;
  }
}