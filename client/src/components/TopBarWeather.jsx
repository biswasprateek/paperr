import React from 'react';
import { useUiStore } from '../store/uiStore';
import { useWeatherCoords } from '../hooks/useWeatherCoords';
import { useWeatherData } from '../hooks/useWeatherData';
import { useWeatherLocationName } from '../hooks/useWeatherLocationName';
import { AnimatedWeatherIcon, weatherCategory, CATEGORY_LABEL } from '../widgets/WeatherWidget';

// Current conditions + daily hi/lo/precipitation, shown in the desktop and
// tablet top bars — same format as the Weather dashboard widget. Shares its
// data query (and therefore its is_day/condition) with the widget so the two
// never drift out of sync.
// Resolves coordinates from localStorage cache → browser geolocation → zip.
export default function TopBarWeather() {
  const { tempUnit, weatherRefreshMins } = useUiStore();

  // ── Step 1: resolve coordinates ────────────────────────────────────
  const {
    data: coords,
    isLoading: coordsLoading,
    isError: coordsError,
    refetch: refetchCoords,
  } = useWeatherCoords();

  // ── Step 2: fetch weather once coords are known ────────────────────
  const intervalMs = weatherRefreshMins * 60 * 1000;
  const { data, isLoading: weatherLoading, isError } = useWeatherData(coords, { tempUnit, intervalMs });
  const locationName = useWeatherLocationName(coords);

  // ── Skeleton while resolving ───────────────────────────────────────
  if (coordsLoading || (weatherLoading && coords)) {
    return (
      <div className="flex items-center gap-2 pl-3 animate-pulse select-none">
        <div className="w-px h-8 bg-outline-variant/40" />
        <div className="w-5 h-5 rounded-full bg-surface-container-high" />
        <div className="space-y-1">
          <div className="h-3 w-10 bg-surface-container-high rounded-full" />
          <div className="h-2 w-14 bg-surface-container-high rounded-full" />
        </div>
      </div>
    );
  }

  // ── No location — prompt user to set zip, offer manual retry ────────
  if (!coords) {
    return (
      <div className="flex items-center gap-2 pl-3 select-none">
        <div className="w-px h-8 bg-outline-variant/40" />
        <button
          onClick={() => window.location.assign('/settings')}
          className="flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors duration-150"
          title="Set zip code in Settings to show weather"
        >
          <span className="material-symbols-outlined text-[18px]">location_off</span>
          <span className="text-label-sm">Set location</span>
        </button>
        {/* If location detection failed (not still loading), offer a retry
            so the user can click after granting browser permission */}
        {coordsError && (
          <button
            onClick={() => {
              localStorage.removeItem('weather_coords');
              refetchCoords();
            }}
            className="text-on-surface-variant/60 hover:text-primary transition-colors duration-150"
            title="Retry location detection"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        )}
      </div>
    );
  }

  if (isError || !data?.current) return null;

  const temp  = Math.round(data.current.temperature_2m);
  const code  = data.current.weather_code;
  const hi    = Math.round(data.daily.temperature_2m_max[0]);
  const lo    = Math.round(data.daily.temperature_2m_min[0]);
  const pop   = data.daily.precipitation_probability_max?.[0];
  const precip = data.daily.precipitation_sum?.[0];
  const precipUnitLabel = tempUnit === 'F' ? 'in' : 'mm';
  const windy = data.current.wind_speed_10m >= 20;
  const unit  = `°${tempUnit}`;

  return (
    <div className="flex items-center gap-3 pl-3 select-none">
      <div className="w-px h-10 bg-outline-variant/40" />
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
          <AnimatedWeatherIcon code={code} isDay={!!data.current.is_day} windy={windy} size={32} />
          <span className="text-label-sm text-on-surface-variant leading-none whitespace-nowrap">
            {CATEGORY_LABEL[weatherCategory(code)]}
          </span>
        </div>

        <span className="text-headline-md text-on-surface font-bold tabular-nums flex-shrink-0">
          {temp}{unit}
        </span>

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-0.5 leading-none flex-shrink-0">
              <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px]">trending_up</span>
                {hi}{unit}
              </span>
              <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[12px]">trending_down</span>
                {lo}{unit}
              </span>
            </div>

            {pop != null && (
              <div className="flex flex-col gap-0.5 leading-none flex-shrink-0">
                <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[12px]">water_drop</span>
                  {pop}%
                </span>
                <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[12px]">rainy</span>
                  {precip}{precipUnitLabel}
                </span>
              </div>
            )}
          </div>

          {locationName && (
            <span className="text-label-sm text-primary truncate">{locationName}</span>
          )}
        </div>
      </div>
    </div>
  );
}
