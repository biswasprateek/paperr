import React from 'react';
import { useUiStore } from '../../store/uiStore';
import { useWeatherCoords } from '../../hooks/useWeatherCoords';
import { useWeatherData } from '../../hooks/useWeatherData';
import { AnimatedWeatherIcon, weatherCategory, CATEGORY_LABEL } from '../../widgets/WeatherWidget';

// Per-date forecast readout (icon + temp) for the calendar's Day/Week views.
// Shares the same query cache as TopBarWeather and the dashboard widget, so
// no extra fetch — and the forecast only covers 7 days out, so dates beyond
// that (or with no location set) simply render nothing.
//
// variant="compact" → icon + high, for the Week view's day-header cells.
// variant="strip"   → full-width row with icon, condition, hi/lo, for Day view.
export default function DayWeather({ dateStr, variant = 'compact' }) {
  const { tempUnit, weatherRefreshMins } = useUiStore();
  const { data: coords } = useWeatherCoords();
  const { data } = useWeatherData(coords, { tempUnit, intervalMs: weatherRefreshMins * 60 * 1000 });

  const idx = data?.daily?.time?.indexOf(dateStr) ?? -1;
  if (idx === -1) return null;

  const code = data.daily.weather_code[idx];
  const hi   = Math.round(data.daily.temperature_2m_max[idx]);
  const lo   = Math.round(data.daily.temperature_2m_min[idx]);

  if (variant === 'strip') {
    return (
      <div className="flex items-center justify-end gap-2 px-3 py-1 border-b border-outline-variant/20 shrink-0 select-none">
        <AnimatedWeatherIcon code={code} isDay windy={false} size={22} />
        <span className="text-label-sm text-on-surface-variant">{CATEGORY_LABEL[weatherCategory(code)]}</span>
        <span className="text-xs font-bold text-on-surface tabular-nums">{hi}°{tempUnit}</span>
        <span className="text-xs text-on-surface-variant tabular-nums">/ {lo}°</span>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center gap-0.5 text-[10px] text-on-surface-variant tabular-nums select-none"
      title={`${CATEGORY_LABEL[weatherCategory(code)]} · high ${hi}°, low ${lo}°`}
    >
      <AnimatedWeatherIcon code={code} isDay windy={false} size={16} />
      {hi}°
    </span>
  );
}
