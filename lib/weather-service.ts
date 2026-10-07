import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@weather_cache';
const LOCATION_KEY = '@weather_location';

// Default: San Pablo, Laguna
const DEFAULT_LOCATION = {
  lat: 14.0722,
  lon: 121.3262,
  name: 'San Pablo, Laguna',
};

// Fallback key, but ideally use EXPO_PUBLIC_OPENWEATHER_API_KEY in .env
const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY || '5ed71056a178124d2037e4af5ac9e861';

export interface WeatherData {
  current: {
    temp: number;
    humidity: number;
    weather: Array<{ main: string; description: string; icon: string }>;
    wind_speed: number;
  };
  daily: Array<{
    dt: number;
    temp: { min: number; max: number; day: number };
    weather: Array<{ main: string; description: string; icon: string }>;
    pop: number;
  }>;
  hourly: Array<{
    dt: number;
    temp: number;
    weather: Array<{ main: string; description: string; icon: string }>;
    pop: number;
  }>;
}

export interface CachedWeather {
  data: WeatherData;
  expiresAt: number;
  locationName: string;
}

export async function getLocation() {
  try {
    const loc = await AsyncStorage.getItem(LOCATION_KEY);
    if (loc) {
      return JSON.parse(loc);
    }
  } catch (e) {
    console.error('Error reading location from storage', e);
  }
  return DEFAULT_LOCATION;
}

export async function setLocation(lat: number, lon: number, name: string = 'Current Location') {
  const loc = { lat, lon, name };
  await AsyncStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
  return loc;
}

function getMidnightTimestamp() {
  const now = new Date();
  now.setHours(24, 0, 0, 0); // Next midnight
  return now.getTime();
}

export async function getWeatherData(
  forceRefresh = false,
  allowCachedFallback = true
): Promise<CachedWeather | null> {
  try {
    const loc = await getLocation();
    
    if (!forceRefresh) {
      const cachedStr = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedStr) {
        const cached: CachedWeather = JSON.parse(cachedStr);
        // Only return cache if it hasn't expired AND it matches the current location (approximately)
        // For simplicity, we just check expiration here. If user updates location, we forceRefresh anyway.
        if (Date.now() < cached.expiresAt) {
          return cached;
        }
      }
    }

    // Fetch new data with a 2.5-second timeout to never block offline UX
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${loc.lat}&lon=${loc.lon}&exclude=minutely,alerts&appid=${API_KEY}&units=metric`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error('Weather API failed');
    }
    
    const data: WeatherData = await response.json();
    const cachedData: CachedWeather = {
      data,
      expiresAt: getMidnightTimestamp(),
      locationName: loc.name,
    };
    
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
    return cachedData;
    
  } catch (error) {
    console.error('Error fetching weather data:', error);
    if (!allowCachedFallback) return null;
    // Try to return stale cache as fallback
    try {
      const cachedStr = await AsyncStorage.getItem(CACHE_KEY);
      if (cachedStr) {
        return JSON.parse(cachedStr);
      }
    } catch (e) {}
    
    return null;
  }
}
