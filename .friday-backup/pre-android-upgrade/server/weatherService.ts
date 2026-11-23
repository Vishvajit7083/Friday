import type { WeatherData, WeatherForecastDay } from '../src/core/types.ts';

const WMO_CONDITIONS: Record<number, string> = {
  0: 'Clear Sky',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime Fog',
  51: 'Light Drizzle',
  53: 'Moderate Drizzle',
  55: 'Dense Drizzle',
  61: 'Slight Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  71: 'Slight Snow',
  73: 'Moderate Snow',
  75: 'Heavy Snow',
  80: 'Rain Showers',
  81: 'Moderate Showers',
  82: 'Violent Showers',
  95: 'Thunderstorm',
};

let cachedWeather: { key: string; fetchedAt: number; data: WeatherData } | null = null;

export async function getWeatherForLocation(locationQuery: string): Promise<WeatherData> {
  const cleanLocation = locationQuery.trim() || 'San Francisco, US';
  const now = Date.now();
  if (cachedWeather && cachedWeather.key === cleanLocation && now - cachedWeather.fetchedAt < 10 * 60 * 1000) {
    return cachedWeather.data;
  }

  let latitude = 37.7749;
  let longitude = -122.4194;
  let resolvedName = cleanLocation;

  try {
    const cityOnly = cleanLocation.split(',')[0].trim();
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityOnly)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (geoRes.ok) {
      const geoJson = (await geoRes.json()) as {
        results?: Array<{ name: string; country?: string; latitude: number; longitude: number }>;
      };
      const first = geoJson.results?.[0];
      if (first) {
        latitude = first.latitude;
        longitude = first.longitude;
        resolvedName = first.country ? `${first.name}, ${first.country}` : first.name;
      }
    }

    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;

    const res = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        apparent_temperature: number;
        weather_code: number;
        wind_speed_10m: number;
      };
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
      };
    };

    const forecast: WeatherForecastDay[] = (json.daily.time ?? []).slice(0, 4).map((date, idx) => ({
      date,
      tempMax: Math.round(json.daily.temperature_2m_max[idx] ?? 0),
      tempMin: Math.round(json.daily.temperature_2m_min[idx] ?? 0),
      code: json.daily.weather_code[idx] ?? 0,
      condition: WMO_CONDITIONS[json.daily.weather_code[idx] ?? 0] ?? 'Clear',
    }));

    const data: WeatherData = {
      location: resolvedName,
      latitude,
      longitude,
      temperature: Math.round(json.current.temperature_2m),
      condition: WMO_CONDITIONS[json.current.weather_code] ?? 'Clear',
      humidity: Math.round(json.current.relative_humidity_2m),
      windSpeedKmh: Math.round(json.current.wind_speed_10m),
      feelsLike: Math.round(json.current.apparent_temperature),
      updatedAt: new Date().toISOString(),
      forecast,
      source: 'Open-Meteo Live API',
    };

    cachedWeather = { key: cleanLocation, fetchedAt: now, data };
    return data;
  } catch (err) {
    if (cachedWeather) return cachedWeather.data;
    throw err;
  }
}
