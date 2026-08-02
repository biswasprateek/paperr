import { useEffect, useMemo } from 'react';
import { useCelebrationStore } from '../store/celebrationStore';

const CONFETTI_COLORS = ['--tb-primary', '--tb-success', '--tb-warning', '--tb-tertiary', '--tb-secondary'];
const EMOJIS = ['🎉', '✨', '🔥', '⭐', '💪', '🙌'];
const TOAST_MESSAGES = ['Nice work! 🎉', 'Crushed it 💪', 'Boom! 🔥', 'Keep it up ✨', 'Well done!'];
const CELEBRATION_MS = 3000;

function particles(count) {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    rot: 180 + Math.random() * 360,
  }));
}

// Spans the full-width bottom stage directly (each piece positioned via
// inline `left`), rising from the bottom edge toward screen-center.
function ConfettiBurst() {
  const pieces = useMemo(() => particles(64), []);
  return pieces.map((p, i) => (
    <span
      key={i}
      className="absolute bottom-0 w-2 h-2 rounded-sm animate-confetti-rise"
      style={{
        left: `${p.left}%`,
        backgroundColor: `rgb(var(${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}))`,
        animationDelay: `${p.delay}s`,
        '--r': `${p.rot}deg`,
      }}
    />
  ));
}

function EmojiBurst() {
  const pieces = useMemo(
    () => particles(36).map((p) => ({ ...p, emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)] })),
    []
  );
  return pieces.map((p, i) => (
    <span
      key={i}
      className="absolute bottom-0 text-2xl animate-confetti-rise"
      style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, '--r': `${p.rot}deg` }}
    >
      {p.emoji}
    </span>
  ));
}

function Toast() {
  const msg = useMemo(() => TOAST_MESSAGES[Math.floor(Math.random() * TOAST_MESSAGES.length)], []);
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center">
      <div className="whitespace-nowrap bg-primary text-on-primary font-bold px-5 py-2.5 rounded-full shadow-heavy animate-celebrate-toast">
        {msg}
      </div>
    </div>
  );
}

const RENDERERS = { confetti: ConfettiBurst, emoji: EmojiBurst, toast: Toast };

// App-level driver mounted once (mirrors <ClockEngine/>) — renders nothing
// until a completion fires a celebration, then shows one of a few random
// effects rising from the bottom of the screen and clears itself.
export default function CelebrationEngine() {
  const active = useCelebrationStore((s) => s.active);
  const clear = useCelebrationStore((s) => s.clear);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(clear, CELEBRATION_MS);
    return () => clearTimeout(t);
  }, [active, clear]);

  if (!active) return null;
  const Renderer = RENDERERS[active.type];

  return (
    <div className="fixed inset-x-0 bottom-0 h-1/2 z-[110] pointer-events-none overflow-hidden">
      <Renderer key={active.id} />
    </div>
  );
}
