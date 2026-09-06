import React, { useEffect, useRef, useState } from 'react';

// Address this tab is served from — LAN IP on other devices, localhost on the host.
const HOST = window.location.host;

const SHOW_MS   = 15000;  // first reveal on load
const REHIDE_MS = 2000;   // after the pointer leaves

// Quiet pill left of the dotAi launcher naming the address paperr is reachable at.
// Rests as a dot, expands on hover/focus, click copies. Tablet + desktop only.
export default function HostedAtBadge() {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const timer = useRef();

  const hideAfter = (ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), ms);
  };

  const hold = () => { clearTimeout(timer.current); setOpen(true); };

  useEffect(() => {
    hideAfter(SHOW_MS);
    return () => clearTimeout(timer.current);
  }, []);

  const copy = () => {
    navigator.clipboard?.writeText(HOST)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <button
      onMouseEnter={hold}
      onMouseLeave={() => hideAfter(REHIDE_MS)}
      onFocus={hold}
      onBlur={() => hideAfter(REHIDE_MS)}
      onClick={copy}
      title={`Copy ${HOST}`}
      aria-label={`Hosted at ${HOST} — click to copy`}
      className={`
        fixed bottom-6 right-24 z-40 h-8 flex items-center rounded-full
        bg-surface-container-lowest border border-outline-variant/20 shadow-soft
        text-[12.5px] leading-none text-on-surface-variant whitespace-nowrap
        hover:bg-surface-container transition-[width,padding,gap,background-color] duration-300 ease-out
        ${open ? 'gap-2 px-3' : 'w-8 gap-0 px-0 justify-center'}
      `}
    >
      <span className="w-[7px] h-[7px] rounded-full bg-primary ring-[3px] ring-primary/20 flex-shrink-0" />
      <span
        className={`flex items-center gap-1.5 overflow-hidden transition-[max-width,opacity] duration-300 ease-out
                    ${open ? 'max-w-[320px] opacity-100' : 'max-w-0 opacity-0'}`}
      >
        <span className="opacity-75">{copied ? 'copied' : 'hosted at'}</span>
        <span className="font-mono font-semibold tracking-tight text-on-surface">{HOST}</span>
      </span>
    </button>
  );
}
