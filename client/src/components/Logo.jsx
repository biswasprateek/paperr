import React from 'react';

export function DotIcon({ size = 32, className = '', color = '#e86343' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-label="dotAi Assistant"
    >
      <path
        d="M50 5 L89 27.5 V72.5 L50 95 L11 72.5 V27.5 L50 5Z"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <line x1="50" y1="5"  x2="50" y2="38" stroke={color} strokeWidth="4" strokeLinecap="butt" />
      <line x1="89" y1="27.5" x2="62" y2="43" stroke={color} strokeWidth="4" strokeLinecap="butt" />
      <line x1="89" y1="72.5" x2="62" y2="57" stroke={color} strokeWidth="4" strokeLinecap="butt" />
      <line x1="50" y1="95" x2="50" y2="62" stroke={color} strokeWidth="4" strokeLinecap="butt" />
      <line x1="11" y1="72.5" x2="38" y2="57" stroke={color} strokeWidth="4" strokeLinecap="butt" />
      <line x1="11" y1="27.5" x2="38" y2="43" stroke={color} strokeWidth="4" strokeLinecap="butt" />
      <circle cx="50" cy="50" r="8" fill={color} />
    </svg>
  );
}

// Just the paperr mark (no wordmark) — for narrow spaces like the tablet rail,
// where the name is rendered separately underneath.
export function PaperrMark({ size = 34, className = '', mono = false }) {
  const fill = mono ? 'currentColor' : 'url(#paperr-mark-grad)';
  return (
    <svg
      viewBox="8 16 82 70"
      width={size}
      height={size}
      className={`select-none ${className}`}
      aria-label="paperr"
    >
      {!mono && (
        <defs>
          <linearGradient id="paperr-mark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
      )}
      <polygon points="14,52 82,22 58,56" fill={fill} />
      <polygon points="58,56 82,22 64,78" fill={fill} opacity="0.65" />
      <polygon points="48,58 58,56 60,70" fill={mono ? 'currentColor' : 'rgba(0,0,0,0.18)'} opacity={mono ? 0.35 : 1} />
    </svg>
  );
}

const SIZES = {
  sm: { width: 168, height: 60 },
  md: { width: 210, height: 75 },
  lg: { width: 280, height: 100 },
};

export default function Logo({ size = 'md', className = '', mono = false }) {
  const { width, height } = SIZES[size] ?? SIZES.md;
  const fill = mono ? 'currentColor' : 'url(#paperr-logo-grad)';

  return (
    <svg
      viewBox="0 0 280 100"
      width={width}
      height={height}
      className={`select-none text-on-surface ${className}`}
      aria-label="paperr"
    >
      {!mono && (
        <defs>
          <linearGradient id="paperr-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
      )}
      <polygon points="14,52 82,22 58,56" fill={fill} />
      <polygon points="58,56 82,22 64,78" fill={fill} opacity="0.65" />
      <polygon points="48,58 58,56 60,70" fill={mono ? 'currentColor' : 'rgba(0,0,0,0.18)'} opacity={mono ? 0.35 : 1} />
      <text
        x="98"
        y="68"
        fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontSize="44"
        fontWeight="600"
        fill="currentColor"
        letterSpacing="-1"
      >
        paperr
      </text>
    </svg>
  );
}

export { Logo as LogoIcon };
