import { useQuery } from '@tanstack/react-query';

// Shared current+daily(+hourly) forecast fetch for every weather surface
// (top bar, dashboard widget). Using one queryKey across all callers means
// they share a single React Query cache entry — so the top bar and the
// widget always show the same is_day/condition instead of drifting apart
// from two independently-timed fetches.
export function useWeatherData(coords, { tempUnit, intervalMs }) {
  return useQuery({
    queryKey: ['weather-current', coords?.lat, coords?.lon, tempUnit],
    queryFn: async () => {
      const unit = tempUnit === 'F' ? 'fahrenheit' : 'celsius';
      const precipUnit = tempUnit === 'F' ? 'inch' : 'mm';
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&current=temperature_2m,weather_code,wind_speed_10m,is_day` +
        `&hourly=precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,precipitation_sum,sunrise,sunset` +
        `&temperature_unit=${unit}&wind_speed_unit=mph&precipitation_unit=${precipUnit}&timezone=auto&forecast_days=7`;
      const r = await fetch(url);
      return r.json();
    },
    enabled: !!coords?.lat,
    staleTime: intervalMs,
    refetchInterval: intervalMs,
    retry: 1,
  });
}
