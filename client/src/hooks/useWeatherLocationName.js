import { useQuery } from '@tanstack/react-query';

// Reverse-geocodes coordinates to a short "City, Region" label for display
// next to weather readouts. BigDataCloud's client endpoint is free, keyless,
// and CORS-open — coords rarely change, so this is cached indefinitely like
// the coords themselves.
export function useWeatherLocationName(coords) {
  const { data } = useQuery({
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

  const city = data?.city || data?.locality;
  if (!city) return null;
  const region = data?.principalSubdivisionCode?.split('-')[1] || data?.countryCode;
  return [city, region].filter(Boolean).join(', ');
}
