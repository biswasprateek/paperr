import React, { useMemo } from 'react';

// Small line-and-area trend chart — one series, a handful of weekly points.
// `data` is `[{ label, value }]` in chronological order; a `null` value
// leaves a gap in the line rather than being interpolated across (used by
// Mood, where a week with zero check-ins genuinely has nothing to plot).
const W = 520, H = 110, PAD_T = 10, PAD_B = 18, PAD_X = 6;

export default function TrendChart({ data, guide, axisMax, formatTooltip, formatValue }) {
  const { lineSegs, areaSegs, points, baselineY, guideY } = useMemo(() => {
    const values = data.map(d => d.value).filter(v => v != null);
    const max = Math.max(...values, axisMax || 0, 1) * 1.1;
    const n = data.length;
    const stepX = n > 1 ? (W - PAD_X * 2) / (n - 1) : 0;

    const points = data.map((d, i) => ({
      x: PAD_X + i * stepX,
      y: d.value == null ? null : PAD_T + (H - PAD_T - PAD_B) * (1 - d.value / max),
      raw: d,
    }));

    const segments = [];
    let current = [];
    for (const p of points) {
      if (p.y == null) { if (current.length) segments.push(current); current = []; }
      else current.push(p);
    }
    if (current.length) segments.push(current);

    const baselineY = H - PAD_B;
    const lineSegs = segments.map(seg => seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));
    const areaSegs = segments.map(seg => {
      const line = seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      return `${line} L${seg[seg.length - 1].x.toFixed(1)} ${baselineY} L${seg[0].x.toFixed(1)} ${baselineY} Z`;
    });
    const guideY = guide != null ? PAD_T + (H - PAD_T - PAD_B) * (1 - guide / max) : null;

    return { lineSegs, areaSegs, points, baselineY, guideY };
  }, [data, axisMax, guide]);

  const plotted = points.filter(p => p.y != null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-auto">
      <line x1={PAD_X} y1={baselineY} x2={W - PAD_X} y2={baselineY} stroke="rgb(var(--tb-outline-variant) / 0.5)" strokeWidth="1" />
      {guideY != null && (
        <line x1={PAD_X} y1={guideY} x2={W - PAD_X} y2={guideY} stroke="rgb(var(--tb-outline-variant) / 0.5)" strokeWidth="1" strokeDasharray="3,3" />
      )}
      {areaSegs.map((d, i) => <path key={`a${i}`} d={d} fill="rgb(var(--tb-primary) / 0.1)" stroke="none" />)}
      {lineSegs.map((d, i) => <path key={`l${i}`} d={d} fill="none" stroke="rgb(var(--tb-primary))" strokeWidth="2" />)}
      {plotted.map((p, i) => {
        const isLast = i === plotted.length - 1;
        return (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={isLast ? 4 : 2.5}
            fill={isLast ? 'rgb(var(--tb-primary))' : 'rgb(var(--tb-surface-container-lowest))'}
            stroke="rgb(var(--tb-primary))"
            strokeWidth="1.5"
          >
            <title>{formatTooltip ? formatTooltip(p.raw) : `${p.raw.label}: ${formatValue ? formatValue(p.raw.value) : p.raw.value}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
