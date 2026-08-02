import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useFrameStore } from '../../store/frameStore';
import { useFrameCollections, useFrameSettings } from '../../hooks/useFrameCollections';
import { useFramePlaylist } from '../../hooks/useFramePlaylist';
import { useThoughtCollections } from '../../hooks/useThoughtCollections';
import { useThoughtPlaylist } from '../../hooks/useThoughtPlaylist';

// Sentinel "url" for title-card and Good-Thoughts text-card slides — neither
// has an image, but showSlide()'s missing-photo retry logic and FrameSlide's
// `if (!url)` guard both key off truthiness, so these just need to be non-empty.
const TITLE_SLIDE_URL = 'title-card';
const TEXT_SLIDE_URL = 'text-card';

// Interleaves Good Thoughts text slides into the photo playlist — one thought
// every `everyN` photos — so a collection tagged "show in Frame" hands off
// into the same fullscreen slideshow rather than needing a separate surface.
// Text-only (no photos yet) falls back to playing just the thoughts, so Frame
// doubles as a quote board on its own.
function interleaveThoughts(photoSlides, thoughtSlides, everyN = 4) {
  if (!thoughtSlides.length) return photoSlides;
  if (!photoSlides.length) return thoughtSlides.map((t) => ({ isText: true, ...t }));
  const result = [];
  let ti = 0;
  photoSlides.forEach((slide, i) => {
    result.push(slide);
    if ((i + 1) % everyN === 0) {
      result.push({ isText: true, ...thoughtSlides[ti % thoughtSlides.length] });
      ti++;
    }
  });
  return result;
}

// Fully load an image into the browser cache before it's shown, so the
// crossfade never reveals a half-painted photo on a slow Wi-Fi link. The
// actual <img> render afterwards is a cache hit (the serve route marks
// responses immutable). Resolves false on failure so the slide gets skipped.
function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// `light` flips to dark text for the White background mode — white text with
// a drop shadow (tuned for photos/black) all but disappears on a light backdrop.
function DateTimeWidget({ light }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={`text-right ${light ? 'text-[#1a1a1a]' : 'text-white drop-shadow-lg'}`}>
      <div className="text-6xl font-light tabular-nums">{format(now, 'HH:mm')}</div>
      <div className="text-xl">{format(now, 'EEEE, MMMM d')}</div>
    </div>
  );
}

// Per spec §05 — each non-"none" style is a cosmetic box around the
// contained image; "caption" reserves a bottom strip for the collection name
// (Polaroid-style instant-print look).
const FRAME_BOX = {
  postcard: { box: 'bg-white p-3 pb-4 shadow-2xl' },
  mat:      { box: 'bg-[#F7F6F1] p-10 pb-20 ring-1 ring-black/10 shadow-2xl' },
  wood:     { box: 'p-4 ring-2 ring-black/50 shadow-2xl bg-gradient-to-br from-[#8b6239] via-[#6b4423] to-[#5c3a1e]' },
  metal:    { box: 'bg-neutral-950 p-1.5 ring-1 ring-[#A8763A]/60 shadow-xl' },
  polaroid: { box: 'bg-white p-3 shadow-2xl', caption: true },
};

function FrameSlide({ url, meta, visible, backgroundMode }) {
  if (!url) return null;

  if (meta?.isTitle) {
    return (
      <div className={`absolute inset-0 transition-opacity duration-1000 bg-black flex items-center justify-center px-12 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-white font-serif text-5xl text-center">{meta.collectionName}</div>
      </div>
    );
  }

  // Good Thoughts hand-off — body is sanitized server-side to an allowlist
  // of b/i/u/s/br, safe to render directly.
  if (meta?.isText) {
    return (
      <div className={`absolute inset-0 transition-opacity duration-1000 bg-black flex items-center justify-center px-16 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-3xl text-center">
          <span className="block text-white font-serif italic text-4xl leading-snug" dangerouslySetInnerHTML={{ __html: meta.body }} />
          {meta.attribution && <span className="block mt-5 text-white/60 text-xl">— {meta.attribution}</span>}
          {meta.color && <div className="mx-auto mt-6 h-1 w-16 rounded-full" style={{ backgroundColor: meta.color }} />}
        </div>
      </div>
    );
  }

  const config = FRAME_BOX[meta?.frameStyle];
  const isArtwork = meta?.collectionType === 'Artwork';
  const hasCaption = meta?.description || meta?.artist || meta?.year;

  return (
    <div className={`absolute inset-0 transition-opacity duration-1000 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {config ? (
        <>
          {/* Backdrop around a contained (non-full-bleed) image — a blurred
              wash of the photo itself (spec §05), or a flat black/white
              surround, per the space's chosen background_mode. */}
          {backgroundMode === 'black' ? (
            <div className="absolute inset-0 bg-black" />
          ) : backgroundMode === 'white' ? (
            <div className="absolute inset-0 bg-[#F2F1EC]" />
          ) : (
            <div className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-60" style={{ backgroundImage: `url(${url})` }} />
          )}
          <div className="relative w-full h-full flex items-center justify-center p-[4%]">
            <div className={`max-w-[90%] overflow-hidden flex flex-col items-center ${config.box}`}>
              <img src={url} alt="" className="max-w-full max-h-[80vh] object-contain" />
              {config.caption && (
                <div className="mt-3 mb-1 min-h-[28px] w-full text-center font-serif italic text-black/70 text-lg">
                  {meta.collectionName}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <img src={url} alt="" className="w-full h-full object-cover" />
      )}
      {/* Gallery placard: Artwork gets title + "Artist · Year"; Photographs
          keep a simple title-only pill. */}
      {hasCaption && (
        isArtwork ? (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[80%] px-7 py-4 bg-[#F7F5F0] text-[#1a1a1a] text-center shadow-xl">
            {meta.description && <div className="font-serif text-lg leading-snug">{meta.description}</div>}
            {(meta.artist || meta.year) && (
              <div className="text-sm text-[#1a1a1a]/60 italic mt-0.5">
                {[meta.artist, meta.year].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        ) : meta.description && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[80%] px-5 py-2 rounded-full bg-black/50 text-white text-center backdrop-blur-sm">
            {meta.description}
          </div>
        )
      )}
    </div>
  );
}

// Global, always-mounted (by FrameEngine) slideshow surface. Renders nothing
// while idle.
export default function FramePlaybackOverlay() {
  const isPlaying = useFrameStore((s) => s.isPlaying);
  const paused = useFrameStore((s) => s.paused);
  const togglePaused = useFrameStore((s) => s.togglePaused);
  const close = useFrameStore((s) => s.close);
  const { collections } = useFrameCollections();
  const { settings } = useFrameSettings();
  const { collections: thoughtCollections } = useThoughtCollections();

  const rootRef = useRef(null);
  const { playlist: photoSlides, loading } = useFramePlaylist(collections, { enabled: isPlaying, withTitles: true });

  // Collections opted into "Include in Frame playback" hand off their
  // entries into this same slideshow — see GoodThoughtsWidget's manage modal.
  const frameEligibleThoughts = useMemo(
    () => thoughtCollections.filter((c) => c.enabled && c.show_in_frame),
    [thoughtCollections]
  );
  const { playlist: thoughtSlides } = useThoughtPlaylist(frameEligibleThoughts, {
    enabled: isPlaying && frameEligibleThoughts.length > 0,
  });

  const playlist = useMemo(() => interleaveThoughts(photoSlides, thoughtSlides), [photoSlides, thoughtSlides]);

  const [layerUrls, setLayerUrls] = useState([null, null]);
  const [layerMeta, setLayerMeta] = useState([null, null]);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const indexRef = useRef(0);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { indexRef.current = 0; }, [playlist]);

  // Preloads a slide, loads it into whichever layer is currently inactive,
  // then flips — that's the actual crossfade. Skips (and retries the next
  // index) if the photo fails to load (deleted server-side, network blip).
  const showSlide = useCallback(async (idx, attempt = 0) => {
    if (!playlist.length || attempt >= playlist.length) return;
    const slide = playlist[idx % playlist.length];
    const url = slide.isTitle ? TITLE_SLIDE_URL : slide.isText ? TEXT_SLIDE_URL : slide.url;
    if (!slide.isTitle && !slide.isText && !(await preloadImage(url))) {
      const nextIdx = (idx + 1) % playlist.length;
      indexRef.current = nextIdx;
      showSlide(nextIdx, attempt + 1);
      return;
    }
    const inactive = activeRef.current === 0 ? 1 : 0;
    setLayerUrls((prev) => { const c = [...prev]; c[inactive] = url; return c; });
    setLayerMeta((prev) => {
      const c = [...prev];
      c[inactive] = {
        isTitle: slide.isTitle, frameStyle: slide.frameStyle, collectionName: slide.collectionName, collectionType: slide.collectionType,
        description: slide.description, artist: slide.artist, year: slide.year,
        isText: slide.isText, body: slide.body, attribution: slide.attribution, color: slide.color,
      };
      return c;
    });
    setActive(inactive);
  }, [playlist]);

  // Kick off the first slide + advance interval once a playlist exists.
  // `restartInterval` is also used by manual prev/next navigation so a
  // manual step doesn't get immediately undone by the auto-advance timer.
  // Reads `paused` through a ref (not a dependency) so toggling pause never
  // changes this callback's identity — that would re-trigger the mount
  // effect below and jump the slideshow back to slide 0.
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const intervalRef = useRef(null);
  const restartInterval = useCallback(() => {
    clearInterval(intervalRef.current);
    if (!playlist.length || pausedRef.current) return;
    const ms = (settings?.interval_seconds || 5) * 1000;
    intervalRef.current = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % playlist.length;
      showSlide(indexRef.current);
    }, ms);
  }, [playlist, settings?.interval_seconds, showSlide]);

  useEffect(() => {
    if (!isPlaying || !playlist.length) return;
    showSlide(0);
    restartInterval();
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, playlist, restartInterval, showSlide]);

  // Pausing/resuming toggles just the timer, without re-showing slide 0.
  useEffect(() => {
    if (!isPlaying || !playlist.length) return;
    restartInterval();
  }, [paused, isPlaying, playlist, restartInterval]);

  const goTo = useCallback((direction) => {
    if (!playlist.length) return;
    indexRef.current = (indexRef.current + direction + playlist.length) % playlist.length;
    showSlide(indexRef.current);
    restartInterval();
  }, [playlist, showSlide, restartInterval]);

  // Real fullscreen is requested synchronously by the "Start now" click
  // handler itself (Frame.jsx / FrameWidget.jsx) — that's the only place with
  // a genuine user gesture to spend. Doing it here in an effect would fire
  // too late (after the gesture's transient activation has passed) and would
  // fight over which element owns the fullscreen element. Idle-triggered
  // activation never attempts real fullscreen at all — it relies on this
  // component's own fixed inset-0 covering div instead (see plan notes).

  // Controls (exit, play/pause, the fullscreen badge) only show on Escape /
  // on-screen button or mouse movement/touch — not on any incidental input,
  // so the slideshow doesn't get dismissed by e.g. a stray mousemove.
  const [showControls, setShowControls] = useState(false);
  const hideControlsTimerRef = useRef(null);
  const doExit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    close();
  }, [close]);

  // Auto-stops the session after the configured "Run duration" (Frame.jsx),
  // so a screensaver triggered by idle doesn't run all day. 0 = Manual Stop.
  useEffect(() => {
    if (!isPlaying) return;
    const minutes = settings?.max_runtime_minutes ?? 60;
    if (!minutes) return;
    const id = setTimeout(doExit, minutes * 60 * 1000);
    return () => clearTimeout(id);
  }, [isPlaying, settings?.max_runtime_minutes, doExit]);

  useEffect(() => {
    if (!isPlaying) return;

    const revealControls = () => {
      setShowControls(true);
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') doExit();
      else if (e.key === 'ArrowRight') goTo(1);
      else if (e.key === 'ArrowLeft') goTo(-1);
      else if (e.key === ' ') { e.preventDefault(); togglePaused(); revealControls(); }
    };
    const onFullscreenChange = () => { if (!document.fullscreenElement) close(); };
    const revealEvents = ['mousemove', 'touchstart'];

    // Defer attaching by a tick — the click that just triggered "Start now"
    // is still bubbling up to window in this same dispatch (React flushes the
    // isPlaying update, and runs this effect, synchronously within that same
    // event). Attaching immediately would let a listener catch that same
    // opening click/move before it's finished.
    const attachId = setTimeout(() => {
      revealEvents.forEach((e) => window.addEventListener(e, revealControls));
      window.addEventListener('keydown', onKeyDown);
    }, 0);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      clearTimeout(attachId);
      clearTimeout(hideControlsTimerRef.current);
      revealEvents.forEach((e) => window.removeEventListener(e, revealControls));
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [isPlaying, close, doExit, goTo, togglePaused]);

  // Show controls immediately whenever playback is paused, so the paused
  // state is never silently invisible.
  useEffect(() => {
    if (!isPlaying) return;
    if (paused) {
      setShowControls(true);
      clearTimeout(hideControlsTimerRef.current);
    }
  }, [paused, isPlaying]);

  // Reset when the overlay closes.
  useEffect(() => {
    if (isPlaying) return;
    setLayerUrls([null, null]);
    setLayerMeta([null, null]);
    setActive(0);
    setShowControls(false);
  }, [isPlaying]);

  if (!isPlaying) return null;

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100] bg-black overflow-hidden">
      {!playlist.length && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-body-md">
          {loading ? 'Loading photos…' : 'No photos to play — add some in Frame.'}
        </div>
      )}
      {[0, 1].map((layer) => (
        <FrameSlide key={layer} url={layerUrls[layer]} meta={layerMeta[layer]} visible={active === layer} backgroundMode={settings?.background_mode ?? 'white'} />
      ))}
      {(settings?.corner_widget_enabled ?? 1) ? (
        <div className="absolute bottom-6 right-6">
          <DateTimeWidget light={(settings?.background_mode ?? 'white') === 'white'} />
        </div>
      ) : null}

      {/* Unambiguous "you are in fullscreen" badge — the only visual
          difference from the Home widget's own mini slideshow preview is
          otherwise just size, which is easy to miss on a large display. */}
      <div
        className={`absolute top-6 left-6 flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full bg-black/50 text-white text-label-sm font-bold backdrop-blur-sm transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <span className="material-symbols-outlined text-[16px]">fullscreen</span>
        paperr | Frame · Fullscreen
      </div>

      <div className={`absolute top-6 right-6 flex items-center gap-2 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={togglePaused}
          aria-label={paused ? 'Play' : 'Pause'}
          className="w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm active:scale-95"
        >
          <span className="material-symbols-outlined">{paused ? 'play_arrow' : 'pause'}</span>
        </button>
        <button
          onClick={doExit}
          aria-label="Exit"
          className="w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm active:scale-95"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  );
}
