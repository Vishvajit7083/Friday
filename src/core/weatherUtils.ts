import type { WeatherAlertItem, WeatherData, WeatherForecastDay } from './types';

export type TemperatureUnit = 'celsius' | 'fahrenheit';

export function convertTemperature(tempC: number, unit: TemperatureUnit): number {
  if (!Number.isFinite(tempC)) return 0;
  if (unit === 'fahrenheit') {
    return Math.round((tempC * 9) / 5 + 32);
  }
  return Math.round(tempC);
}

export function formatTemperature(tempC: number, unit: TemperatureUnit = 'celsius', withUnit = true): string {
  const val = convertTemperature(tempC, unit);
  if (!withUnit) return String(val);
  return `${val}°${unit === 'fahrenheit' ? 'F' : 'C'}`;
}

export function degreesToCompass(deg?: number | null): string {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return 'N/A';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.round(normalized / 45) % 8];
}

export function describeUvIndex(uv?: number | null): string {
  if (typeof uv !== 'number' || !Number.isFinite(uv)) return 'N/A';
  if (uv <= 2) return `${uv.toFixed(1)} (Low)`;
  if (uv <= 5) return `${uv.toFixed(1)} (Moderate)`;
  if (uv <= 7) return `${uv.toFixed(1)} (High)`;
  if (uv <= 10) return `${uv.toFixed(1)} (Very High)`;
  return `${uv.toFixed(1)} (Extreme)`;
}

export interface ParsedWeatherQuery {
  isWeather: boolean;
  location?: string;
  timeframe: 'current' | 'today' | 'tomorrow' | 'hourly' | 'week' | 'alerts';
  metric?: 'rain' | 'wind' | 'humidity' | 'uv' | 'pressure' | 'sunrise';
}

const NON_LOCATION_TAIL_WORDS = new Set([
  'today',
  'tomorrow',
  'now',
  'right now',
  'currently',
  'this week',
  'the week',
  'next week',
  'hourly',
  'tonight',
  'morning',
  'evening',
  'my area',
  'my city',
  'here',
  'outside',
]);

export function parseWeatherQuery(rawCommand: string): ParsedWeatherQuery {
  const clean = rawCommand
    .trim()
    .replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:please\s+)?/i, '')
    .trim();
  const lower = clean.toLowerCase();

  const hasWeatherKeyword =
    /\b(weather|forecast|temperature|rain(?:ing)?|umbrella|humidity|uv\s*index|sunrise|sunset|storm\s+alert|weather\s+alert)\b/i.test(
      lower
    );

  if (!hasWeatherKeyword) {
    return { isWeather: false, timeframe: 'current' };
  }

  let timeframe: ParsedWeatherQuery['timeframe'] = 'current';
  if (/\b(alert|alerts|warning|advisory)\b/i.test(lower)) timeframe = 'alerts';
  else if (/\b(7[\s-]*day|week|weekly|forecast)\b/i.test(lower)) timeframe = 'week';
  else if (/\b(hourly|next\s+hours?|hour\s+by\s+hour)\b/i.test(lower)) timeframe = 'hourly';
  else if (/\btomorrow\b/i.test(lower)) timeframe = 'tomorrow';
  else if (/\b(today|tonight)\b/i.test(lower)) timeframe = 'today';

  let metric: ParsedWeatherQuery['metric'];
  if (/\b(rain|raining|umbrella|precipitation|drizzle|shower)\b/i.test(lower)) metric = 'rain';
  else if (/\bwind\b/i.test(lower)) metric = 'wind';
  else if (/\bhumidity\b/i.test(lower)) metric = 'humidity';
  else if (/\buv\b/i.test(lower)) metric = 'uv';
  else if (/\bpressure\b/i.test(lower)) metric = 'pressure';
  else if (/\b(sunrise|sunset)\b/i.test(lower)) metric = 'sunrise';

  // Extract city name like "weather in Tokyo", "forecast for New York tomorrow", "Tokyo weather", "will it rain in Mumbai tomorrow"
  let location: string | undefined;
  const inForMatch = clean.match(
    /\b(?:in|for|at)\s+([A-Za-z][A-Za-z\s,.-]{1,48}?)(?=\s+(?:today|tomorrow|tonight|right\s+now|now|this\s+week|for\s+the\s+week|hourly|please)\b|[?.!]|$)/i
  );
  if (inForMatch?.[1]) {
    const candidate = inForMatch[1].trim().replace(/[,?.!]+$/, '').trim();
    if (candidate && !NON_LOCATION_TAIL_WORDS.has(candidate.toLowerCase())) {
      location = candidate;
    }
  } else {
    const prefixCityMatch = clean.match(/^([A-Za-z][A-Za-z\s.-]{1,36}?)\s+(?:weather|forecast|temperature)\b/i);
    if (prefixCityMatch?.[1]) {
      const candidate = prefixCityMatch[1]
        .replace(
          /^(?:what(?:'s|\s+is)|how(?:'s|\s+is)|tell\s+me|show\s+me|give\s+me|check|get|fetch)\s+/i,
          ''
        )
        .replace(/^(?:the|my|current|live|today'?s|tomorrow'?s|weekly|local)\b\s*/i, '')
        .trim();
      const nonCities = new Set(['the', 'a', 'an', 'is', 'was', 'what', 'how', 'my', 'current', 'live', 'local', 'your']);
      if (candidate && candidate.length >= 2 && !NON_LOCATION_TAIL_WORDS.has(candidate.toLowerCase()) && !nonCities.has(candidate.toLowerCase())) {
        location = candidate;
      }
    }
  }

  return {
    isWeather: true,
    location,
    timeframe,
    metric,
  };
}

export function buildWeatherChatSummary(
  weather: WeatherData,
  parsed: ParsedWeatherQuery,
  unit: TemperatureUnit = 'celsius'
): string {
  const unitChar = unit === 'fahrenheit' ? 'F' : 'C';
  const temp = convertTemperature(weather.temperature, unit);
  const feels = convertTemperature(weather.feelsLike, unit);

  if (parsed.timeframe === 'alerts') {
    if (!weather.alerts || weather.alerts.length === 0) {
      return `No active weather warnings or advisories for ${weather.location}. Current conditions: ${temp}°${unitChar}, ${weather.condition}.`;
    }
    return `Weather alerts for ${weather.location}:\n${weather.alerts
      .map((a) => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.description}`)
      .join('\n')}`;
  }

  if (parsed.timeframe === 'tomorrow' && weather.forecast.length > 1) {
    const tmr: WeatherForecastDay = weather.forecast[1];
    const maxT = convertTemperature(tmr.tempMax, unit);
    const minT = convertTemperature(tmr.tempMin, unit);
    const rainStr =
      typeof tmr.precipProbMax === 'number' ? ` Rain probability up to ${tmr.precipProbMax}%.` : '';
    return `Tomorrow's forecast for ${weather.location} (${tmr.date}): ${tmr.condition}, high ${maxT}°${unitChar} / low ${minT}°${unitChar}.${rainStr}`;
  }

  if (parsed.timeframe === 'week' && weather.forecast.length > 0) {
    const lines = weather.forecast.slice(0, 7).map((d) => {
      const rain = typeof d.precipProbMax === 'number' ? ` · ${d.precipProbMax}% rain` : '';
      return `- ${d.date}: ${d.condition} (${convertTemperature(d.tempMin, unit)}°–${convertTemperature(d.tempMax, unit)}°${unitChar}${rain})`;
    });
    return `7-Day Forecast for ${weather.location} (Current: ${temp}°${unitChar}, ${weather.condition}):\n${lines.join('\n')}`;
  }

  if (parsed.timeframe === 'hourly' && weather.hourly && weather.hourly.length > 0) {
    const nextHours = weather.hourly.slice(0, 6).map((h) => {
      const label = h.time.slice(11, 16);
      return `${label}: ${convertTemperature(h.temp, unit)}°${unitChar} (${h.condition}, ${h.precipProb}% rain)`;
    });
    return `Upcoming hours in ${weather.location}:\n${nextHours.join(' | ')}`;
  }

  if (parsed.metric === 'rain') {
    const todayRain = weather.forecast[0]?.precipProbMax;
    const nextRain = weather.hourly?.slice(0, 6).map((h) => `${h.time.slice(11, 16)}: ${h.precipProb}%`).join(', ');
    return `Rain outlook for ${weather.location}: currently ${weather.condition} (${temp}°${unitChar})${
      typeof todayRain === 'number' ? `, today's peak rain chance ${todayRain}%` : ''
    }${nextRain ? `. Next hours: ${nextRain}` : '.'}`;
  }

  if (parsed.metric === 'uv' && typeof weather.uvIndex === 'number') {
    return `UV Index in ${weather.location}: ${describeUvIndex(weather.uvIndex)}. Conditions: ${weather.condition}, ${temp}°${unitChar}.`;
  }

  if (parsed.metric === 'sunrise' && (weather.sunrise || weather.sunset)) {
    return `Sun schedule for ${weather.location}: Sunrise ${weather.sunrise?.slice(11, 16) || 'N/A'}, Sunset ${weather.sunset?.slice(11, 16) || 'N/A'}.`;
  }

  const extras: string[] = [];
  if (typeof weather.uvIndex === 'number') extras.push(`UV ${weather.uvIndex.toFixed(1)}`);
  if (typeof weather.pressureHpa === 'number') extras.push(`${weather.pressureHpa} hPa`);
  if (weather.windDirectionLabel) extras.push(`Wind ${weather.windSpeedKmh} km/h ${weather.windDirectionLabel}`);
  else extras.push(`Wind ${weather.windSpeedKmh} km/h`);

  const alertNote =
    weather.alerts && weather.alerts.length > 0
      ? ` Alert: ${weather.alerts[0].title}.`
      : '';
  const cacheNote = weather.isCached ? ' (cached reading)' : '';

  return `Weather in ${weather.location}${cacheNote}: ${temp}°${unitChar} (${weather.condition}), feels like ${feels}°${unitChar}, humidity ${weather.humidity}%, ${extras.join(', ')}.${alertNote}`;
}

export function getNewSevereWeatherAlertKey(alerts: WeatherAlertItem[] | undefined): string | null {
  if (!alerts || alerts.length === 0) return null;
  const urgent = alerts.find((a) => a.severity === 'warning' || a.severity === 'watch');
  return urgent ? `${urgent.id}:${urgent.title}` : null;
}
