import { useQuery } from '@tanstack/react-query';
import { useUiStore } from '../store/uiStore';

// Resolves the coordinates used for all weather-related widgets.
// Chain: localStorage cache → browser geolocation → zip geocoding.
// NOTE: we throw (not return null) on total failure so React Query keeps the
// query in "error" state, which retries on window-focus. Returning null would
// be cached as a "fresh success" forever with staleTime:Infinity and callers
// would never recover.
export function useWeatherCoords() {
  const { zipCode } = useUiStore();

  return useQuery({
    queryKey: ['weather-coords', zipCode],
    queryFn: async () => {
      // 1. Use cached coords if available
      try {
        const cached = JSON.parse(localStorage.getItem('weather_coords'));
        if (cached?.lat && cached?.lon) return cached;
      } catch {}

      // 2. Try browser geolocation
      //    · enableHighAccuracy: false  → prefer fast network/wifi fix over GPS
      //    · maximumAge: 300_000        → accept a cached browser position up to 5 min old
      //    · timeout: 12_000            → extra headroom for Windows Location Service cold-start
      const fromGeo = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          ({ coords: c }) => resolve({ lat: c.latitude, lon: c.longitude }),
          ()              => resolve(null),
          { timeout: 12_000, enableHighAccuracy: false, maximumAge: 300_000 }
        );
      });

      if (fromGeo) {
        localStorage.setItem('weather_coords', JSON.stringify(fromGeo));
        return fromGeo;
      }

      // 3. Fall back to zip / postal code via Open-Meteo geocoding
      if (zipCode) {
        const r    = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(zipCode)}&count=1&format=json`);
        const json = await r.json();
        if (json.results?.[0]) {
          const { latitude: lat, longitude: lon } = json.results[0];
          const geo = { lat, lon };
          localStorage.setItem('weather_coords', JSON.stringify(geo));
          return geo;
        }
      }

      // All methods failed — throw so the query stays in error state
      // and retries automatically on window focus / tab switch.
      throw new Error('location-unavailable');
    },
    staleTime: Infinity, // coords don't expire once resolved; key change busts cache
    retry: 1,
  });
}
