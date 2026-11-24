import type {
  WeatherAlertItem,
  WeatherData,
  WeatherForecastDay,
  WeatherHourlyPoint,
  WeatherLocationMatch,
} from '../src/core/types.ts';
import { degreesToCompass } from '../src/core/weatherUtils.ts';

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
  56: 'Light Freezing Drizzle',
  57: 'Dense Freezing Drizzle',
  61: 'Slight Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  66: 'Light Freezing Rain',
  67: 'Heavy Freezing Rain',
  71: 'Slight Snow',
  73: 'Moderate Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Rain Showers',
  81: 'Moderate Showers',
  82: 'Violent Showers',
  85: 'Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ Hail',
  99: 'Severe Thunderstorm',
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map<string, { fetchedAt: number; data: WeatherData }>();

export async function searchWeatherLocations(query: string): Promise<WeatherLocationMatch[]> {
  const clean = query.trim();
  if (!clean || clean.length < 2) return [];
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=6&language=en&format=json`,
    { signal: AbortSignal.timeout(4500) }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  return (json.results ?? []).map((item) => ({
    name: item.name,
    region: item.admin1,
    country: item.country,
    latitude: item.latitude,
    longitude: item.longitude,
    label: [item.name, item.admin1, item.country].filter(Boolean).join(', '),
  }));
}

async function fetchNwsAlertsIfApplicable(latitude: number, longitude: number): Promise<WeatherAlertItem[]> {
  // NWS weather.gov covers US territories only (~lat 17..72, lon -179..-64)
  if (latitude < 17 || latitude > 72 || longitude < -179 || longitude > -64) {
    return [];
  }
  try {
    const res = await fetch(
      `https://api.weather.gov/alerts/active?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`,
      {
        headers: { 'User-Agent': 'FRIDAY-Command-Center/1.0 (local-desktop)' },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      features?: Array<{
        id?: string;
        properties?: {
          event?: string;
          severity?: string;
          headline?: string;
          description?: string;
          effective?: string;
          expires?: string;
        };
      }>;
    };
    return (json.features ?? []).slice(0, 5).map((f, idx) => {
      const p = f.properties || {};
      const sevRaw = (p.severity || '').toLowerCase();
      const severity: WeatherAlertItem['severity'] =
        sevRaw === 'extreme' || sevRaw === 'severe'
          ? 'warning'
          : sevRaw === 'moderate'
            ? 'watch'
            : 'advisory';
      return {
        id: String(f.id || `nws-${idx}`),
        title: p.event || 'Weather Alert',
        severity,
        description: (p.headline || p.description || 'Active meteorological alert.').slice(0, 280),
        source: 'National Weather Service (api.weather.gov)',
        effective: p.effective,
        expires: p.expires,
      };
    });
  } catch {
    return [];
  }
}

function deriveThresholdAdvisories(
  currentCode: number,
  windSpeedKmh: number,
  forecast: WeatherForecastDay[]
): WeatherAlertItem[] {
  const alerts: WeatherAlertItem[] = [];
  if (currentCode >= 95) {
    alerts.push({
      id: 'wmo-thunderstorm-now',
      title: WMO_CONDITIONS[currentCode] || 'Thunderstorm Active',
      severity: 'warning',
      description: 'Active thunderstorm conditions reported at your location. Take shelter if outdoors.',
      source: 'Open-Meteo WMO Telemetry',
    });
  } else if (currentCode === 65 || currentCode === 67 || currentCode === 82) {
    alerts.push({
      id: 'wmo-heavy-rain-now',
      title: 'Heavy Rainfall Advisory',
      severity: 'watch',
      description: `${WMO_CONDITIONS[currentCode] || 'Heavy rain'} currently observed with reduced visibility.`,
      source: 'Open-Meteo WMO Telemetry',
    });
  }
  if (windSpeedKmh >= 50) {
    alerts.push({
      id: 'wmo-high-wind',
      title: 'High Wind Advisory',
      severity: 'watch',
      description: `Sustained wind speed reached ${windSpeedKmh} km/h.`,
      source: 'Open-Meteo WMO Telemetry',
    });
  }
  const upcomingStorm = forecast.find((d) => d.code >= 95 || d.tempMax >= 41);
  if (upcomingStorm && !alerts.some((a) => a.id.startsWith('wmo-thunderstorm'))) {
    alerts.push({
      id: `wmo-forecast-${upcomingStorm.date}`,
      title: upcomingStorm.code >= 95 ? `Storm Outlook (${upcomingStorm.date})` : `Extreme Heat Outlook (${upcomingStorm.date})`,
      severity: 'advisory',
      description:
        upcomingStorm.code >= 95
          ? `Thunderstorms forecasted on ${upcomingStorm.date} (${upcomingStorm.precipProbMax ?? 0}% precipitation chance).`
          : `Peak high temperature of ${upcomingStorm.tempMax}°C forecasted on ${upcomingStorm.date}.`,
      source: 'Open-Meteo 7-Day Telemetry',
    });
  }
  return alerts;
}

export async function getWeatherForCoordinates(
  latitude: number,
  longitude: number,
  resolvedLabel?: string,
  forceRefresh = false
): Promise<WeatherData> {
  const cacheKey = `coord:${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);
  if (!forceRefresh && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      ...cached.data,
      isCached: false,
      cacheAgeMinutes: Math.floor((now - cached.fetchedAt) / 60000),
    };
  }

  let locationName = resolvedLabel?.trim() || `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
  if (!resolvedLabel) {
    try {
      const revRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (revRes.ok) {
        const revJson = (await revRes.json()) as {
          results?: Array<{ name: string; country?: string }>;
        };
        const first = revJson.results?.[0];
        if (first) {
          locationName = first.country ? `${first.name}, ${first.country}` : first.name;
        }
      }
    } catch {
      // Coordinate fallback label remains accurate
    }
  }

  try {
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,visibility,uv_index` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=7&forecast_hours=24`;

    const [res, nwsAlerts] = await Promise.all([
      fetch(weatherUrl, { signal: AbortSignal.timeout(6000) }),
      fetchNwsAlertsIfApplicable(latitude, longitude),
    ]);

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      current: {
        temperature_2m: number;
        relative_humidity_2m: number;
        apparent_temperature: number;
        precipitation?: number;
        weather_code: number;
        cloud_cover?: number;
        pressure_msl?: number;
        wind_speed_10m: number;
        wind_direction_10m?: number;
      };
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        apparent_temperature?: number[];
        precipitation_probability?: number[];
        weather_code?: number[];
        wind_speed_10m?: number[];
        visibility?: number[];
        uv_index?: number[];
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        uv_index_max?: number[];
        sunrise?: string[];
        sunset?: string[];
        wind_speed_10m_max?: number[];
      };
    };

    const forecast: WeatherForecastDay[] = (json.daily?.time ?? []).slice(0, 7).map((date, idx) => ({
      date,
      tempMax: Math.round(json.daily?.temperature_2m_max?.[idx] ?? 0),
      tempMin: Math.round(json.daily?.temperature_2m_min?.[idx] ?? 0),
      code: json.daily?.weather_code?.[idx] ?? 0,
      condition: WMO_CONDITIONS[json.daily?.weather_code?.[idx] ?? 0] ?? 'Clear',
      precipProbMax: json.daily?.precipitation_probability_max?.[idx],
      uvMax: json.daily?.uv_index_max?.[idx],
      sunrise: json.daily?.sunrise?.[idx],
      sunset: json.daily?.sunset?.[idx],
      windSpeedMaxKmh:
        typeof json.daily?.wind_speed_10m_max?.[idx] === 'number'
          ? Math.round(json.daily.wind_speed_10m_max[idx])
          : undefined,
    }));

    const hourly: WeatherHourlyPoint[] = (json.hourly?.time ?? []).slice(0, 24).map((time, idx) => {
      const code = json.hourly?.weather_code?.[idx] ?? 0;
      return {
        time,
        temp: Math.round(json.hourly?.temperature_2m?.[idx] ?? 0),
        feelsLike: Math.round(json.hourly?.apparent_temperature?.[idx] ?? 0),
        precipProb: Math.round(json.hourly?.precipitation_probability?.[idx] ?? 0),
        windSpeedKmh: Math.round(json.hourly?.wind_speed_10m?.[idx] ?? 0),
        code,
        condition: WMO_CONDITIONS[code] ?? 'Clear',
      };
    });

    const visMeters = json.hourly?.visibility?.[0];
    const uvNow = json.hourly?.uv_index?.[0] ?? forecast[0]?.uvMax;
    const windDirDeg = json.current.wind_direction_10m;
    const windSpeedKmh = Math.round(json.current.wind_speed_10m);
    const derivedAlerts = deriveThresholdAdvisories(json.current.weather_code, windSpeedKmh, forecast);
    const alerts = [...nwsAlerts, ...derivedAlerts];

    const data: WeatherData = {
      location: locationName,
      latitude,
      longitude,
      temperature: Math.round(json.current.temperature_2m),
      condition: WMO_CONDITIONS[json.current.weather_code] ?? 'Clear',
      conditionCode: json.current.weather_code,
      humidity: Math.round(json.current.relative_humidity_2m),
      windSpeedKmh,
      windDirectionDeg: typeof windDirDeg === 'number' ? Math.round(windDirDeg) : undefined,
      windDirectionLabel: degreesToCompass(windDirDeg),
      pressureHpa: typeof json.current.pressure_msl === 'number' ? Math.round(json.current.pressure_msl) : undefined,
      visibilityKm: typeof visMeters === 'number' ? Number((visMeters / 1000).toFixed(1)) : undefined,
      uvIndex: typeof uvNow === 'number' ? Number(uvNow.toFixed(1)) : undefined,
      precipitationMm:
        typeof json.current.precipitation === 'number' ? Number(json.current.precipitation.toFixed(1)) : 0,
      cloudCover: typeof json.current.cloud_cover === 'number' ? Math.round(json.current.cloud_cover) : undefined,
      sunrise: forecast[0]?.sunrise,
      sunset: forecast[0]?.sunset,
      feelsLike: Math.round(json.current.apparent_temperature),
      updatedAt: new Date().toISOString(),
      forecast,
      hourly,
      alerts,
      source: 'Open-Meteo Live API',
      isCached: false,
      cacheAgeMinutes: 0,
    };

    weatherCache.set(cacheKey, { fetchedAt: now, data });
    return data;
  } catch (err) {
    if (cached) {
      return {
        ...cached.data,
        isCached: true,
        cacheAgeMinutes: Math.max(1, Math.floor((now - cached.fetchedAt) / 60000)),
      };
    }
    throw err;
  }
}

export async function getWeatherForLocation(locationQuery: string, forceRefresh = false): Promise<WeatherData> {
  const cleanLocation = locationQuery.trim() || 'San Francisco, US';
  const cacheKey = `loc:${cleanLocation.toLowerCase()}`;
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);
  if (!forceRefresh && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      ...cached.data,
      isCached: false,
      cacheAgeMinutes: Math.floor((now - cached.fetchedAt) / 60000),
    };
  }

  try {
    const cityOnly = cleanLocation.split(',')[0].trim();
    const matches = await searchWeatherLocations(cityOnly);
    const first = matches[0];
    if (!first) {
      throw new Error(`Location "${cleanLocation}" was not found by the weather geocoder.`);
    }
    const resolvedName = first.country ? `${first.name}, ${first.country}` : first.name;
    const data = await getWeatherForCoordinates(first.latitude, first.longitude, resolvedName, forceRefresh);
    weatherCache.set(cacheKey, { fetchedAt: now, data });
    return data;
  } catch (err) {
    if (cached) {
      return {
        ...cached.data,
        isCached: true,
        cacheAgeMinutes: Math.max(1, Math.floor((now - cached.fetchedAt) / 60000)),
      };
    }
    throw err;
  }
}
