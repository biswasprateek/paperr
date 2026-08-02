import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useUiStore } from '../store/uiStore';
import { useWeatherCoords } from '../hooks/useWeatherCoords';
import { useThemeColors } from '../hooks/useThemeColors';
import { WidgetEmpty } from './WidgetShell';

// WMO weather interpretation code → animation category + Material Symbols icon.
// https://open-meteo.com/en/docs#weathervariables
// Exported so the top-bar weather readout (TopBarWeather) can share the same
// condition mapping and animated icon instead of duplicating them.
export function weatherCategory(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunder';
  return 'cloudy';
}

const CATEGORY_ICON = {
  clear: 'wb_sunny',
  clearNight: 'bedtime',
  cloudy: 'partly_cloudy_day',
  overcast: 'cloud',
  fog: 'foggy',
  rain: 'rainy',
  snow: 'weather_snowy',
  thunder: 'thunderstorm',
};

export const CATEGORY_LABEL = {
  clear: 'Clear', cloudy: 'Partly Cloudy', overcast: 'Overcast', fog: 'Foggy',
  rain: 'Rainy', snow: 'Snowy', thunder: 'Thunderstorms',
};

export function AnimatedWeatherIcon({ code, isDay, windy, size = 40 }) {
  const cat = weatherCategory(code);
  const icon = cat === 'clear' ? (isDay ? CATEGORY_ICON.clear : CATEGORY_ICON.clearNight) : CATEGORY_ICON[cat];
  const move = useUiStore((s) => !s.lowMotion && s.motionPrefs.weather !== false);

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      {cat === 'rain' && (
        <div className="absolute inset-x-0 top-1/2 flex justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className={`w-[2px] h-2 rounded-full bg-primary/70 ${move ? 'animate-rain-drop' : ''}`}
              style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      )}
      {cat === 'snow' && (
        <div className="absolute inset-x-0 top-1/2 flex justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className={`w-1 h-1 rounded-full bg-primary/70 ${move ? 'animate-snow-fall' : ''}`}
              style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
        </div>
      )}
      {cat === 'fog' && (
        <div className="absolute inset-x-1 bottom-1.5 flex flex-col gap-1">
          {[0, 1].map(i => (
            <span key={i} className={`h-[2px] rounded-full bg-on-surface-variant/40 ${move ? 'animate-fog-drift' : ''}`}
              style={{ animationDelay: `${i * 0.6}s` }} />
          ))}
        </div>
      )}
      {cat === 'thunder' && (
        <span className={`material-symbols-outlined absolute text-warning text-[14px] translate-x-2 translate-y-1.5 ${move ? 'animate-lightning-flash' : ''}`}>
          bolt
        </span>
      )}
      <span
        className={`material-symbols-outlined relative text-primary
          ${move && (cat === 'cloudy' || cat === 'overcast' || cat === 'thunder') ? 'animate-cloud-drift' : ''}
          ${move && cat === 'clear' ? 'animate-sun-pulse' : ''}`}
        style={{ fontSize: size * 0.85 }}
      >
        {icon}
      </span>
      {windy && (
        <div className="absolute -right-1 top-1 flex flex-col gap-1">
          {[0, 1].map(i => (
            <span key={i} className={`block w-2 h-[2px] rounded-full bg-on-surface-variant/50 ${move ? 'animate-wind-line' : ''}`}
              style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function aqiInfo(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50)  return { label: 'Good', tone: 'success' };
  if (aqi <= 100) return { label: 'Moderate', tone: 'warning' };
  if (aqi <= 150) return { label: 'Unhealthy (Sensitive)', tone: 'warning' };
  if (aqi <= 200) return { label: 'Unhealthy', tone: 'error' };
  if (aqi <= 300) return { label: 'Very Unhealthy', tone: 'error' };
  return { label: 'Hazardous', tone: 'error' };
}

function uvInfo(uv) {
  if (uv == null) return null;
  if (uv < 3)  return { label: 'Low', tone: 'success' };
  if (uv < 6)  return { label: 'Moderate', tone: 'warning' };
  if (uv < 8)  return { label: 'High', tone: 'warning' };
  if (uv < 11) return { label: 'Very High', tone: 'error' };
  return { label: 'Extreme', tone: 'error' };
}

function humidityInfo(rh) {
  if (rh == null) return null;
  if (rh < 30) return { label: 'Low', tone: 'warning' };
  if (rh <= 60) return { label: 'Comfortable', tone: 'success' };
  if (rh <= 80) return { label: 'High', tone: 'warning' };
  return { label: 'Very High', tone: 'error' };
}

const TONE_CLASSES = {
  success: 'bg-success-container text-on-success-container',
  warning: 'bg-warning-container text-on-warning-container',
  error:   'bg-error-container text-on-error-container',
};

const TONE_TEXT = {
  success: 'text-success',
  warning: 'text-warning',
  error:   'text-error',
};

// Inline icon+value readout — compact so it shares a single row with the
// current-condition and sunrise/sunset stats without forcing a wrap.
function InlineStat({ icon, value, tone }) {
  return (
    <span className={`text-[20px] leading-[1.3] font-bold flex items-center gap-1 whitespace-nowrap tabular-nums ${TONE_TEXT[tone.tone]}`}>
      <span className="material-symbols-outlined text-[19px]">{icon}</span>
      {value}
    </span>
  );
}

// Floating detail panel shown on hover — used for alert/warning descriptions
// and the 7-day forecast condition labels. Follows the cursor via a portal so
// it isn't clipped by the widget's overflow-hidden/scroll ancestors.
function HoverCard({ content, children, className = '', inline = false }) {
  const [pos, setPos] = useState(null);

  if (!content) return children;

  const handleMove = e => {
    const pad = 14;
    const maxLeft = window.innerWidth - 240;
    const maxTop = window.innerHeight - 60;
    setPos({
      left: Math.min(e.clientX + pad, Math.max(pad, maxLeft)),
      top: Math.min(e.clientY + pad, Math.max(pad, maxTop)),
    });
  };

  return (
    <div className={`${inline ? '' : 'w-full'} ${className}`} onMouseMove={handleMove} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && createPortal(
        <div
          className="pointer-events-none fixed z-50 max-w-xs bg-surface-container-lowest border border-outline-variant/20 rounded-lg shadow-heavy px-3 py-2
            text-label-sm text-on-surface leading-snug whitespace-pre-line max-h-40 overflow-y-auto no-scrollbar"
          style={{ left: pos.left, top: pos.top }}
        >
          {content}
        </div>,
        document.body
      )}
    </div>
  );
}

const ALERT_SEVERITY_TONE = {
  Extreme: 'error', Severe: 'error', Moderate: 'warning', Minor: 'warning', Unknown: 'warning',
};

const ALERT_ROTATE_MS = 15_000;

// Single-row alert banner. With more than one active alert it auto-advances
// to the next every ALERT_ROTATE_MS instead of stacking rows. Full details
// (headline, description, instructions) surface in a hover card.
function AlertBanner({ alerts }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [alerts]);

  useEffect(() => {
    if (alerts.length <= 1) return;
    const id = setInterval(() => setIdx(i => (i + 1) % alerts.length), ALERT_ROTATE_MS);
    return () => clearInterval(id);
  }, [alerts]);

  if (alerts.length === 0) return null;
  const a = alerts[idx];
  const tone = ALERT_SEVERITY_TONE[a.properties?.severity] || 'warning';
  const detail = [a.properties?.headline, a.properties?.description, a.properties?.instruction]
    .filter(Boolean).join('\n\n');

  return (
    <HoverCard content={detail}>
      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-default ${TONE_CLASSES[tone]}`}>
        <span className="material-symbols-outlined text-[15px] flex-shrink-0">warning</span>
        <p className="text-label-sm font-bold truncate flex-1 min-w-0">{a.properties?.event}</p>
        {alerts.length > 1 && (
          <span className="text-label-sm opacity-70 flex-shrink-0 tabular-nums">{idx + 1}/{alerts.length}</span>
        )}
      </div>
    </HoverCard>
  );
}

function DailyMiniRow({ label, code, pop, hi, lo }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-outline-variant/10 last:border-0 grow">
      <span className="text-label-sm text-on-surface-variant w-9 flex-shrink-0">{label}</span>
      <AnimatedWeatherIcon code={code} isDay windy={false} size={18} />
      <span className="text-label-sm text-primary/70 flex items-center gap-0.5 flex-shrink-0 w-9 tabular-nums">
        <span className="material-symbols-outlined text-[12px]">water_drop</span>
        {pop ?? 0}%
      </span>
      <span className="flex-1" />
      <span className="text-label-sm font-bold text-on-surface tabular-nums w-7 text-right">{hi}°</span>
      <span className="text-label-sm text-on-surface-variant/70 tabular-nums w-7 text-right">{lo}°</span>
    </div>
  );
}

// Text-tab switcher + sliding pages — lets the 7-day strip and the
// precipitation chart each use the full width instead of competing for it
// stacked in the same column.
function WeatherPager({ pages }) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-0.5">
        {pages.map((p, i) => (
          <button key={p.label} type="button" onClick={() => setActive(i)}
            className={`px-2.5 py-1 rounded-full text-label-sm transition ${
              i === active
                ? 'bg-surface-container text-on-surface font-bold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="relative overflow-x-hidden" style={{ height: 150 }}>
        {pages.map((p, i) => (
          <div key={p.label}
            className="absolute inset-0"
            style={{
              transition: 'transform 280ms cubic-bezier(0.23, 1, 0.32, 1), opacity 220ms ease-out',
              transform: i === active ? 'translateX(0)' : i < active ? 'translateX(-108%)' : 'translateX(108%)',
              opacity: i === active ? 1 : 0,
              pointerEvents: i === active ? 'auto' : 'none',
            }}
          >
            {p.node}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WeatherWidget({ editing, w = 2, h = 2 }) {
  const { tempUnit, weatherRefreshMins } = useUiStore();
  const { data: coords, isLoading: coordsLoading } = useWeatherCoords();
  const colors = useThemeColors();
  const intervalMs = weatherRefreshMins * 60 * 1000;

  const { data, isLoading: weatherLoading, isError } = useQuery({
    queryKey: ['weather-full', coords?.lat, coords?.lon, tempUnit],
    queryFn: async () => {
      const unit = tempUnit === 'F' ? 'fahrenheit' : 'celsius';
      const precipUnit = tempUnit === 'F' ? 'inch' : 'mm';
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
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

  const { data: aqData } = useQuery({
    queryKey: ['weather-aqi', coords?.lat, coords?.lon],
    queryFn: async () => {
      const url =
        `https://air-quality-api.open-meteo.com/v1/air-quality` +
        `?latitude=${coords.lat}&longitude=${coords.lon}&current=us_aqi&timezone=auto`;
      const r = await fetch(url);
      return r.json();
    },
    enabled: !!coords?.lat,
    staleTime: intervalMs,
    refetchInterval: intervalMs,
    retry: 1,
  });

  // Reverse-geocode the coordinates to a human-readable place name for the
  // header. BigDataCloud's client endpoint is free, keyless, and CORS-open —
  // coords rarely change, so this is cached indefinitely like the coords query.
  const { data: locationData } = useQuery({
    queryKey: ['weather-location-name', coords?.lat, coords?.lon],
    queryFn: async () => {
      const url =
        `https://api.bigdatacloud.net/data/reverse-geocode-client` +
        `?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=en`;
      const r = await fetch(url);
      return r.json();
    },
    enabled: !!coords?.lat,
    staleTime: Infinity,
    retry: 1,
  });

  // US NWS alerts — coverage is US-only; failures/empty results are treated
  // as "no active alerts" rather than surfaced as an error.
  const { data: alertsData } = useQuery({
    queryKey: ['weather-alerts', coords?.lat, coords?.lon],
    queryFn: async () => {
      const r = await fetch(`https://api.weather.gov/alerts/active?point=${coords.lat},${coords.lon}`, {
        headers: { Accept: 'application/geo+json' },
      });
      if (!r.ok) return [];
      const json = await r.json();
      return json.features || [];
    },
    enabled: !!coords?.lat,
    staleTime: intervalMs,
    refetchInterval: intervalMs,
    retry: false,
  });

  const chartData = useMemo(() => {
    if (!data?.hourly?.time) return [];
    const currentHour = data.current?.time?.slice(0, 13) + ':00';
    const nowIdx = Math.max(0, data.hourly.time.indexOf(currentHour));
    return data.hourly.time.slice(nowIdx, nowIdx + 12).map((t, i) => ({
      hour: format(new Date(t), 'ha'),
      pop: data.hourly.precipitation_probability[nowIdx + i],
    }));
  }, [data]);

  if (coordsLoading || (weatherLoading && coords)) {
    return (
      <div className="h-full flex flex-col bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 overflow-hidden animate-pulse p-4 gap-3">
        <div className="h-4 w-20 bg-surface-container-high rounded-full" />
        <div className="h-10 w-24 bg-surface-container-high rounded-full" />
        <div className="h-6 w-full bg-surface-container-high rounded-full" />
      </div>
    );
  }

  if (!coords || isError || !data?.current) {
    return (
      <div className="h-full flex flex-col bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
          <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[16px] text-primary">partly_cloudy_day</span>
          </span>
          <span className="text-body-md font-semibold text-on-surface flex-1 truncate">Weather</span>
        </div>
        <div className="flex-1 min-h-0">
          <WidgetEmpty icon="location_off" label="Set a location in Settings to show weather" />
        </div>
      </div>
    );
  }

  const cur   = data.current;
  const locationName = locationData?.city || locationData?.locality
    ? [locationData.city || locationData.locality, locationData.principalSubdivisionCode?.split('-')[1] || locationData.countryCode]
        .filter(Boolean).join(', ')
    : null;
  const unit  = `°${tempUnit}`;
  const hi    = Math.round(data.daily.temperature_2m_max[0]);
  const lo    = Math.round(data.daily.temperature_2m_min[0]);
  const popToday    = data.daily.precipitation_probability_max?.[0];
  const precipToday = data.daily.precipitation_sum?.[0];
  const precipUnitLabel = tempUnit === 'F' ? 'in' : 'mm';
  const windy = cur.wind_speed_10m >= 20;
  const aqi   = aqiInfo(aqData?.current?.us_aqi);
  const uv    = uvInfo(data.daily.uv_index_max?.[0]);
  const humidity = humidityInfo(cur.relative_humidity_2m);
  const alerts = alertsData || [];

  // Available room dictates which sections earn their keep — a 1x1 tile only
  // has room for the current condition; taller/wider tiles progressively
  // unlock inline stats, alerts, and the scrollable forecast/chart pages.
  const compact    = w <= 1 && h <= 1;
  const narrow     = w < 2;
  const showChips  = !compact;
  const showScroll = h >= 2;
  const showChart  = h >= 2 && w >= 2;

  // The two "pages" of the scrollable section when there's room for the chart.
  const PAGES = [
    {
      label: '7-Day',
      node: (
        <div className="grid grid-cols-7 gap-1 h-full">
          {data.daily.time.map((t, i) => (
            <HoverCard key={t} className="self-start" content={CATEGORY_LABEL[weatherCategory(data.daily.weather_code[i])]}>
              <div className="flex flex-col items-center justify-start gap-1.5 pt-2 pb-2 rounded-xl hover:bg-surface-container transition-colors">
                <span className="text-label-sm text-on-surface-variant">
                  {i === 0 ? 'Today' : format(new Date(t), 'EEE')}
                </span>
                <AnimatedWeatherIcon code={data.daily.weather_code[i]} isDay windy={false} size={26} />
                <span className="text-label-sm text-primary/70 flex items-center gap-0.5 tabular-nums">
                  <span className="material-symbols-outlined text-[12px]">water_drop</span>
                  {data.daily.precipitation_probability_max?.[i] ?? 0}%
                </span>
                <span className="text-label-sm text-primary/60 flex items-center gap-0.5 tabular-nums">
                  <span className="material-symbols-outlined text-[12px]">rainy</span>
                  {data.daily.precipitation_sum?.[i] ?? 0}{precipUnitLabel}
                </span>
                <span className="text-label-sm font-bold text-on-surface tabular-nums flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[12px]">trending_up</span>
                  {Math.round(data.daily.temperature_2m_max[i])}°
                </span>
                <span className="text-label-sm text-on-surface-variant/70 tabular-nums flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[12px]">trending_down</span>
                  {Math.round(data.daily.temperature_2m_min[i])}°
                </span>
              </div>
            </HoverCard>
          ))}
        </div>
      ),
    },
    {
      label: 'Precipitation',
      node: chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }} barCategoryGap="28%">
            <XAxis dataKey="hour" interval={1}
              tick={{ fontSize: 10, fill: colors.outline, fontFamily: 'Plus Jakarta Sans' }}
              axisLine={false} tickLine={false} />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              cursor={{ fill: colors.surfaceContainer, radius: 4 }}
              wrapperStyle={{ outline: 'none' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 shadow-heavy text-label-md pointer-events-none">
                    <span className="text-on-surface-variant">{label}</span>
                    <span className="ml-2 font-bold text-primary">{payload[0].value}%</span>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="pop" radius={[4, 4, 0, 0]} fill={colors.primary} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      ) : null,
    },
  ];

  return (
    <div className="relative h-full flex flex-col bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 overflow-hidden">
      {/* ── Fixed header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2 flex-shrink-0">
        <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[16px] text-primary">partly_cloudy_day</span>
        </span>
        <span className="text-body-md font-semibold text-on-surface flex-shrink-0">Weather</span>
        {locationName && (
          <span className="text-label-sm text-on-surface-variant truncate">· {locationName}</span>
        )}
      </div>

      {/* ── Always-visible: current conditions (+ inline AQI/UV), alerts ── */}
      <div className={`px-4 pb-2 flex flex-col gap-2 ${showScroll ? 'flex-shrink-0' : 'flex-1 justify-center'}`}>
        <div className={`flex items-center flex-wrap gap-x-3 gap-y-1.5 ${narrow ? 'justify-center text-center' : 'justify-start'}`}>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
              <AnimatedWeatherIcon code={cur.weather_code} isDay={!!cur.is_day} windy={windy} size={40} />
              <span className="text-label-sm text-on-surface-variant text-center leading-none whitespace-nowrap">
                {CATEGORY_LABEL[weatherCategory(cur.weather_code)]}
              </span>
            </div>

            <span className="text-[20px] leading-[1.3] text-on-surface font-bold tabular-nums flex-shrink-0">
              {Math.round(cur.temperature_2m)}{unit}
            </span>

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

            {popToday != null && (
              <div className="flex flex-col gap-0.5 leading-none flex-shrink-0">
                <HoverCard inline content={`${popToday}% Chance of Precipitation Today`}>
                  <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">water_drop</span>
                    {popToday}%
                  </span>
                </HoverCard>
                <HoverCard inline content={`${precipToday}${precipUnitLabel} of Precipitation Expected Today`}>
                  <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">rainy</span>
                    {precipToday}{precipUnitLabel}
                  </span>
                </HoverCard>
              </div>
            )}
          </div>

          {showChips && (aqi || uv || (!narrow && humidity)) && (
            <div className="flex items-center gap-2 flex-shrink-0 pl-3 border-l border-outline-variant/20">
              {aqi && (
                <HoverCard inline content={`${aqi.label} Air Quality (AQI ${aqData.current.us_aqi})`}>
                  <InlineStat icon="air" value={`AQI ${aqData.current.us_aqi}`} tone={aqi} />
                </HoverCard>
              )}
              {uv && (
                <HoverCard inline content={`${uv.label} UV index`}>
                  <InlineStat icon="wb_sunny" value={`UV ${Math.round(data.daily.uv_index_max[0])}`} tone={uv} />
                </HoverCard>
              )}
              {!narrow && humidity && (
                <HoverCard inline content={`${humidity.label} Humidity`}>
                  <InlineStat icon="humidity_percentage" value={`${Math.round(cur.relative_humidity_2m)}%`} tone={humidity} />
                </HoverCard>
              )}
            </div>
          )}

          {showChips && !narrow && data.daily.sunrise && (
            <div className="flex flex-col gap-0.5 leading-none flex-shrink-0 pl-3 border-l border-outline-variant/20 ml-auto">
              <HoverCard inline content={`Sunrise at ${format(new Date(data.daily.sunrise[0]), 'h:mm a')}`}>
                <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]" style={{ transform: 'scaleY(-1)' }}>wb_twilight</span>
                  {format(new Date(data.daily.sunrise[0]), 'h:mm a')}
                </span>
              </HoverCard>
              <HoverCard inline content={`Sunset at ${format(new Date(data.daily.sunset[0]), 'h:mm a')}`}>
                <span className="text-label-md text-on-surface-variant tabular-nums whitespace-nowrap flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">wb_twilight</span>
                  {format(new Date(data.daily.sunset[0]), 'h:mm a')}
                </span>
              </HoverCard>
            </div>
          )}
        </div>

        {showScroll && <AlertBanner alerts={alerts} />}
      </div>

      {/* ── Scrollable: 7-day forecast / precipitation chart ─────────── */}
      {showScroll && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 no-scrollbar flex flex-col">
          {showChart ? (
            <WeatherPager pages={PAGES} />
          ) : (
            // Narrow column — a horizontal strip + chart won't fit legibly,
            // so the 7-day forecast becomes a scrollable vertical list instead.
            // Rows grow to fill any extra height rather than leaving it blank.
            <div className="flex-1 flex flex-col">
              {data.daily.time.map((t, i) => (
                <DailyMiniRow key={t}
                  label={i === 0 ? 'Today' : format(new Date(t), 'EEE')}
                  code={data.daily.weather_code[i]}
                  pop={data.daily.precipitation_probability_max?.[i]}
                  hi={Math.round(data.daily.temperature_2m_max[i])}
                  lo={Math.round(data.daily.temperature_2m_min[i])}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!compact && (
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="absolute bottom-1 right-2.5 z-10 text-[9px] text-on-surface-variant/50 hover:text-on-surface-variant transition"
        >
          Weather data by Open-Meteo.com
        </a>
      )}
    </div>
  );
}
