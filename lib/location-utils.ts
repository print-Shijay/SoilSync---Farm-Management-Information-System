export interface LocationData {
  address: string;
  latitude?: number;
  longitude?: number;
}

export function parseLocation(locationString: string | null | undefined): LocationData {
  if (!locationString) {
    return { address: '' };
  }

  try {
    const data = JSON.parse(locationString);
    if (data && typeof data === 'object' && 'address' in data) {
      return {
        address: data.address || '',
        latitude: typeof data.latitude === 'number' ? data.latitude : undefined,
        longitude: typeof data.longitude === 'number' ? data.longitude : undefined,
      };
    }
  } catch (error) {
    // It's not a valid JSON, meaning it's a legacy plain string location
  }

  return { address: locationString };
}

export function stringifyLocation(data: LocationData): string {
  return JSON.stringify(data);
}
