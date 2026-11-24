import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  Compass,
  Droplets,
  Eye,
  Gauge,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  Star,
  Sun,
  Sunrise,
  Sunset,
  Wind,
  X,
} from 'lucide-react';
import type { WeatherData, WeatherLocationMatch } from '../core/types';
import {
  describeUvIndex,
  formatTemperature,
  type TemperatureUnit,
} from '../core/weatherUtils';

interface WeatherDetailModalProps {
  open: boolean;
  onClose: () => void;
  weather: WeatherData | null;
  weatherError: string | null;
  loadingWeather: boolean;
  unit: TemperatureUnit;
  favorites: string[];
  onToggleUnit: (unit: TemperatureUnit) => void;
  onSelectLocation: (locationQuery: string, force?: boolean) => Promise<void>;
  onSelectCoordinates: (lat: number, lon: number, label?: string) => Promise<void>;
  onToggleFavorite: (location: string) => void;
  onRefresh: () => Promise<void>;
}

function formatHourLabel(isoTime: string): string {
  if (!isoTime) return '';
  const hhmm = isoTime.slice(11, 16);
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return hhmm;
  const mer = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr || '00'} ${mer}`;
}

function formatDayName(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function WeatherDetailModal({
  open,
  onClose,
  weather,
  weatherError,
  loadingWeather,
  unit,
  favorites,
  onToggleUnit,
  onSelectLocation,
  onSelectCoordinates,
  onToggleFavorite,
  onRefresh,
}: WeatherDetailModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WeatherLocationMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/weather/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Location search unavailable');
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      } catch (err) {
        setSearchError((err as Error).message);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open, searchQuery]);

  if (!open) return null;

  const handleSelectCity = async (match: WeatherLocationMatch) => {
    setSearchQuery('');
    setSearchResults([]);
    setGeoStatus(null);
    await onSelectCoordinates(match.latitude, match.longitude, match.label);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation is unavailable in this browser or desktop host.');
      return;
    }
    setGeoStatus('Detecting current GPS / system location...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setGeoStatus(null);
        await onSelectCoordinates(pos.coords.latitude, pos.coords.longitude, 'Current Location');
      },
      (err) => {
        setGeoStatus(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Allow location access or search a city manually.'
            : `Unable to detect location: ${err.message}`
        );
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  const activeLocationName = weather?.location || '';
  const isFavorite = favorites.some((f) => f.toLowerCase() === activeLocationName.toLowerCase());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live Weather Intelligence & Forecast"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="hud-panel rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col bg-[#0c041c]/95 border border-fuchsia-400/50 shadow-[0_0_40px_rgba(192,38,211,0.35)] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-purple-500/35 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <MapPin className="w-4 h-4 text-fuchsia-400 shrink-0" aria-hidden="true" />
            <h2 className="font-display text-base sm:text-lg font-bold text-white truncate">
              {weather?.location || 'Live Weather Forecast'}
            </h2>
            {weather && (
              <button
                type="button"
                onClick={() => onToggleFavorite(weather.location)}
                aria-label={isFavorite ? `Remove ${weather.location} from favorites` : `Save ${weather.location} to favorites`}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isFavorite
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-purple-950/60 border-purple-700/60 text-purple-300 hover:text-white'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-300' : ''}`} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-purple-500/45 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => onToggleUnit('celsius')}
                aria-pressed={unit === 'celsius'}
                className={`px-2.5 py-1 font-semibold transition-colors ${
                  unit === 'celsius'
                    ? 'bg-fuchsia-500/35 text-white'
                    : 'bg-[#120626] text-purple-200 hover:text-white'
                }`}
              >
                °C
              </button>
              <button
                type="button"
                onClick={() => onToggleUnit('fahrenheit')}
                aria-pressed={unit === 'fahrenheit'}
                className={`px-2.5 py-1 font-semibold transition-colors ${
                  unit === 'fahrenheit'
                    ? 'bg-fuchsia-500/35 text-white'
                    : 'bg-[#120626] text-purple-200 hover:text-white'
                }`}
              >
                °F
              </button>
            </div>

            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loadingWeather}
              aria-label="Refresh live weather"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-950/80 border border-purple-500/40 text-purple-100 hover:border-fuchsia-400 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWeather ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close weather details"
              className="p-1.5 rounded-lg text-purple-200 hover:text-white hover:bg-purple-900/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* City Search + GPS + Favorites */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-purple-300 absolute left-3 top-2.5" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      e.preventDefault();
                      void onSelectLocation(searchQuery.trim(), true);
                      setSearchQuery('');
                      setSearchResults([]);
                    }
                  }}
                  placeholder="Search city or region (e.g., Tokyo, New York, Pune)..."
                  aria-label="Search weather city"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#13052b] border border-purple-500/40 text-xs text-white placeholder:text-purple-300/60 focus:outline-none focus:border-fuchsia-400"
                />
              </div>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-purple-950/90 border border-purple-500/45 text-purple-100 hover:border-fuchsia-400"
              >
                <LocateFixed className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                <span>Use My Location</span>
              </button>
            </div>

            {searching && <div className="text-xs text-purple-300">Searching locations...</div>}
            {searchError && <div className="text-xs text-rose-300">{searchError}</div>}
            {geoStatus && <div className="text-xs text-amber-300">{geoStatus}</div>}

            {searchResults.length > 0 && (
              <div className="rounded-xl border border-purple-500/35 bg-[#120527] divide-y divide-purple-500/20 max-h-44 overflow-y-auto">
                {searchResults.map((match) => (
                  <button
                    key={`${match.latitude}-${match.longitude}`}
                    type="button"
                    onClick={() => void handleSelectCity(match)}
                    className="w-full text-left px-3 py-2 text-xs text-purple-100 hover:bg-purple-900/40 flex items-center justify-between gap-2"
                  >
                    <span>{match.label}</span>
                    <span className="text-[11px] font-mono-tabular text-purple-300">
                      {match.latitude.toFixed(2)}, {match.longitude.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {favorites.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-purple-300/85 mr-1">Favorites:</span>
                {favorites.map((fav) => (
                  <div
                    key={fav}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                      fav.toLowerCase() === activeLocationName.toLowerCase()
                        ? 'bg-fuchsia-500/25 border-fuchsia-400/60 text-white'
                        : 'bg-[#120626] border-purple-600/40 text-purple-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void onSelectLocation(fav)}
                      className="hover:text-white"
                    >
                      {fav}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(fav)}
                      aria-label={`Remove favorite ${fav}`}
                      className="text-purple-300 hover:text-rose-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {weatherError && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200">
              {weatherError}
            </div>
          )}

          {/* Weather Alerts */}
          {weather?.alerts && weather.alerts.length > 0 && (
            <div className="space-y-2">
              {weather.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    alert.severity === 'warning'
                      ? 'bg-rose-950/60 border-rose-500/50 text-rose-100'
                      : 'bg-amber-950/55 border-amber-500/45 text-amber-100'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="uppercase">[{alert.severity}]</span>
                    <span>{alert.title}</span>
                  </div>
                  <p className="text-[11px] opacity-90">{alert.description}</p>
                </div>
              ))}
            </div>
          )}

          {weather && (
            <>
              {/* Current Overview + Detailed Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
                <div className="hud-inset-box rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs text-purple-200/80">Current Conditions</div>
                    <div className="font-display text-4xl font-bold text-white tabular-nums mt-1">
                      {formatTemperature(weather.temperature, unit)}
                    </div>
                    <div className="text-sm font-medium text-fuchsia-200 mt-1">{weather.condition}</div>
                    <div className="text-xs text-purple-200/80 mt-0.5">
                      Feels like {formatTemperature(weather.feelsLike, unit)}
                    </div>
                  </div>
                  <div className="text-[11px] text-purple-300/80 pt-3 border-t border-purple-500/20 mt-3">
                    {weather.isCached
                      ? `Cached reading (${weather.cacheAgeMinutes ?? 0}m old)`
                      : `Live via ${weather.source}`}
                    <div className="font-mono-tabular opacity-80">
                      Updated {new Date(weather.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="hud-inset-box rounded-xl p-3 space-y-1">
                    <div className="text-purple-200/80 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                      <span>Humidity</span>
                    </div>
                    <div className="font-mono-tabular font-semibold text-white text-sm">{weather.humidity}%</div>
                  </div>

                  <div className="hud-inset-box rounded-xl p-3 space-y-1">
                    <div className="text-purple-200/80 flex items-center gap-1.5">
                      <Wind className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                      <span>Wind</span>
                    </div>
                    <div className="font-mono-tabular font-semibold text-white text-sm">
                      {weather.windSpeedKmh} km/h {weather.windDirectionLabel || ''}
                    </div>
                  </div>

                  <div className="hud-inset-box rounded-xl p-3 space-y-1">
                    <div className="text-purple-200/80 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                      <span>Pressure</span>
                    </div>
                    <div className="font-mono-tabular font-semibold text-white text-sm">
                      {typeof weather.pressureHpa === 'number' ? `${weather.pressureHpa} hPa` : 'N/A'}
                    </div>
                  </div>

                  <div className="hud-inset-box rounded-xl p-3 space-y-1">
                    <div className="text-purple-200/80 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                      <span>Visibility</span>
                    </div>
                    <div className="font-mono-tabular font-semibold text-white text-sm">
                      {typeof weather.visibilityKm === 'number' ? `${weather.visibilityKm} km` : 'N/A'}
                    </div>
                  </div>

                  <div className="hud-inset-box rounded-xl p-3 space-y-1">
                    <div className="text-purple-200/80 flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                      <span>UV Index</span>
                    </div>
                    <div className="font-mono-tabular font-semibold text-white text-sm">
                      {describeUvIndex(weather.uvIndex)}
                    </div>
                  </div>

                  <div className="hud-inset-box rounded-xl p-3 space-y-1">
                    <div className="text-purple-200/80 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                      <span>Cloud / Sun</span>
                    </div>
                    <div className="font-mono-tabular text-white text-[11px] flex items-center gap-2">
                      <span>{typeof weather.cloudCover === 'number' ? `${weather.cloudCover}%` : '--'}</span>
                      {weather.sunrise && (
                        <span className="inline-flex items-center gap-0.5 text-amber-200">
                          <Sunrise className="w-3 h-3" aria-hidden="true" />
                          {weather.sunrise.slice(11, 16)}
                        </span>
                      )}
                      {weather.sunset && (
                        <span className="inline-flex items-center gap-0.5 text-purple-200">
                          <Sunset className="w-3 h-3" aria-hidden="true" />
                          {weather.sunset.slice(11, 16)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 24-Hour Hourly Forecast */}
              {weather.hourly && weather.hourly.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-200 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                    <span>24-Hour Hourly Forecast</span>
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {weather.hourly.slice(0, 24).map((pt) => (
                      <div
                        key={pt.time}
                        className="hud-inset-box rounded-xl px-3 py-2 shrink-0 min-w-[92px] text-center space-y-1"
                      >
                        <div className="text-[11px] font-mono-tabular text-purple-200">{formatHourLabel(pt.time)}</div>
                        <div className="text-sm font-bold text-white tabular-nums">
                          {formatTemperature(pt.temp, unit)}
                        </div>
                        <div className="text-[10px] text-purple-200/85 truncate">{pt.condition}</div>
                        <div className="text-[10px] font-mono-tabular text-cyan-300">{pt.precipProb}% rain</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 7-Day Extended Forecast */}
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-200">
                  7-Day Outlook
                </h3>
                <div className="divide-y divide-purple-500/20 hud-inset-box rounded-xl">
                  {weather.forecast.slice(0, 7).map((day, idx) => (
                    <div
                      key={day.date}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs tabular-nums"
                    >
                      <span className="font-medium text-white min-w-[115px]">{formatDayName(day.date, idx)}</span>
                      <span className="text-purple-200 flex-1 truncate">{day.condition}</span>
                      <span className="font-mono-tabular text-cyan-300 text-[11px] min-w-[64px] text-right">
                        {typeof day.precipProbMax === 'number' ? `${day.precipProbMax}% rain` : ''}
                      </span>
                      <span className="font-mono-tabular font-semibold text-white min-w-[96px] text-right">
                        {formatTemperature(day.tempMax, unit)} / {formatTemperature(day.tempMin, unit)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
