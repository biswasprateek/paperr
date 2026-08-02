import { useMemo } from 'react';
import { useUiStore } from '../store/uiStore';

/**
 * Resolved theme colors for places that can't use Tailwind classes
 * (recharts fills/strokes, canvas, etc.).
 *
 * Reads the active palette's CSS variables off <html> and re-resolves
 * whenever the theme or palette changes, so charts follow the user's
 * palette and dark mode instead of hardcoding hex values.
 */
function readVar(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : '';
}

export function useThemeColors() {
  const theme   = useUiStore((s) => s.theme);
  const palette = useUiStore((s) => s.colorPalette);

  return useMemo(() => ({
    primary:           readVar('--tb-primary'),
    error:             readVar('--tb-error'),
    success:           readVar('--tb-success'),
    warning:           readVar('--tb-warning'),
    outline:           readVar('--tb-outline'),
    outlineVariant:    readVar('--tb-outline-variant'),
    onSurfaceVariant:  readVar('--tb-on-surface-variant'),
    surfaceContainer:  readVar('--tb-surface-container'),
    secondaryFixedDim: readVar('--tb-secondary-fixed-dim'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme, palette]);
}
