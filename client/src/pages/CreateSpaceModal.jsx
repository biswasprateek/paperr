import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker from 'emoji-picker-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useSpaceStore } from '../store/spaceStore';
import { useUiStore } from '../store/uiStore';
import AppsSetupStep from '../components/AppsSetupStep';

const FAMILY_ICON = '🏠';
const TEAM_ICON = '💼';

const ICON_PRESETS = {
  family: ['🏠', '🏡', '👨‍👩‍👧', '👪', '🏘️', '🌿', '☀️', '🌙'],
  team:   ['💼', '🏢', '💻', '🚀', '⚡', '🎯', '💡', '🔧'],
};

const PICKER_W = 300;
const PICKER_H = 350;

function EmojiPopover({ onChange }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const appTheme = useUiStore(s => s.theme);

  const pickerTheme = appTheme === 'dark'
    ? 'dark'
    : appTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  // Rendered into a portal at a viewport-relative position (not absolute
  // inside the button's own DOM position) so the modal's overflow-hidden
  // card and scrollable form can't clip it. Position is computed once on
  // open and clamped to the viewport; the popover closes on scroll rather
  // than tracking it, since it's a short-lived picker, not a persistent panel.
  const openPicker = () => {
    const rect = btnRef.current.getBoundingClientRect();
    const top = rect.bottom + PICKER_H + 8 > window.innerHeight
      ? Math.max(8, rect.top - PICKER_H - 8)
      : rect.bottom + 8;
    const left = Math.min(rect.left, window.innerWidth - PICKER_W - 8);
    setCoords({ top, left: Math.max(8, left) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  return (
    <>
      {/* Fixed hint glyph, deliberately never mirrors the current selection —
          the preset row itself (via the custom chip below) is what shows the
          picked value, so this button always reads as "more emoji here". */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        title="Pick any other emoji"
        className="relative w-9 h-9 rounded-xl text-lg flex items-center justify-center bg-surface-container-high hover:bg-surface-container border-2 border-dashed border-outline transition-colors shrink-0"
      >
        🙂
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary text-on-primary text-[10px] leading-none flex items-center justify-center">+</span>
      </button>
      {open && coords && createPortal(
        <div
          ref={popRef}
          className="fixed z-50 shadow-heavy rounded-xl overflow-hidden"
          style={{ top: coords.top, left: coords.left }}
        >
          <EmojiPicker
            onEmojiClick={(data) => { onChange(data.emoji); setOpen(false); }}
            searchPlaceholder="Search emojis..."
            height={PICKER_H}
            width={PICKER_W}
            theme={pickerTheme}
            lazyLoadEmojis
          />
        </div>,
        document.body,
      )}
    </>
  );
}

export default function CreateSpaceModal({ onClose, onCreated, space, onUpdated, onDeleted }) {
  const { addSpace, updateSpace, removeSpace } = useSpaceStore();
  const qc = useQueryClient();
  const isEdit = !!space;

  const [type, setType]       = useState(space?.type || 'family');
  const [name, setName]       = useState(space?.name || '');
  const [icon, setIcon]       = useState(space?.icon || FAMILY_ICON);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [createdSpace, setCreatedSpace] = useState(null); // set once creation succeeds -> shows the apps step

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const deleteConfirmPhrase = `DELETE ${space?.name || ''}`;

  const deleteSpace = useMutation({
    mutationFn: () => api.delete(`/spaces/${space.id}`),
    onSuccess: () => {
      removeSpace(space.id);
      qc.clear();
      onDeleted?.();
    },
  });

  const handleTypeChange = (t) => {
    setType(t);
    if (!isEdit) setIcon(t === 'family' ? FAMILY_ICON : TEAM_ICON);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter a space name'); return; }
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        const { data } = await api.put(`/spaces/${space.id}`, { name: name.trim(), icon });
        updateSpace(data);
        onUpdated?.(data);
      } else {
        const { data } = await api.post('/spaces', { name: name.trim(), type, icon });
        addSpace(data);
        setCreatedSpace(data);
        // Deliberately not switching to the new space yet — SpaceGuard (App.jsx)
        // swaps the whole screen the instant currentSpaceId is set, which would
        // unmount this modal before the apps step below ever shows. The apps
        // step targets the new space explicitly (see AppsSetupStep's spaceId
        // prop); onCreated (called once the user finishes) does the real switch.
      }
    } catch (err) {
      setError(err.response?.data?.error || (isEdit ? 'Failed to save changes' : 'Failed to create space'));
    } finally {
      setLoading(false);
    }
  };

  // A custom (non-preset) pick swaps into the last slot instead of appending
  // a 9th chip, so the row's width — and the trigger button's position — never
  // shifts based on what's selected.
  const basePresets = ICON_PRESETS[type] || ICON_PRESETS.family;
  const iconList = basePresets.includes(icon) ? basePresets : [...basePresets.slice(0, -1), icon];

  return (
    <div
      className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
          <h2 className="text-headline-md font-light tracking-wide text-on-background">
            {isEdit ? 'Edit space' : createdSpace ? createdSpace.name : 'Create a space'}
          </h2>
          <button
            onClick={() => (createdSpace ? onCreated?.(createdSpace) : onClose())}
            aria-label="Close"
            className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {createdSpace ? (
          <div className="px-6 py-5 overflow-y-auto">
            <AppsSetupStep
              mode="new-space"
              spaceId={createdSpace.id}
              doneLabel="Done"
              onDone={() => onCreated?.(createdSpace)}
            />
          </div>
        ) : (
        <>
        {/* Scrollable body */}
        <div className="overflow-y-auto">
        <form id="space-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Type selector — create mode only */}
          {!isEdit && (
            <div>
              <p className="text-label-md font-medium text-on-surface-variant mb-2">Space type</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'family', label: 'Family', icon: FAMILY_ICON, desc: 'Home & personal' },
                  { value: 'team',   label: 'Team',   icon: TEAM_ICON,   desc: 'Work & collaboration' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleTypeChange(opt.value)}
                    className={`flex flex-col items-start p-4 rounded-2xl border-2 text-left transition-all
                      ${type === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant/30 hover:border-outline-variant'
                      }`}
                  >
                    <span className="text-2xl mb-1">{opt.icon}</span>
                    <span className="text-label-lg font-semibold text-on-surface">{opt.label}</span>
                    <span className="text-label-sm text-on-surface-variant">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-label-md font-medium text-on-surface-variant mb-1.5 block">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={type === 'family' ? 'e.g. The Johnson Family' : 'e.g. Design Team'}
              maxLength={60}
              className="w-full px-4 py-3 bg-surface-container rounded-xl border border-outline-variant/30 text-body-md text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          {/* Icon */}
          <div>
            <p className="text-label-md font-medium text-on-surface-variant mb-2">Icon</p>
            <div className="flex flex-nowrap items-center gap-1.5">
              {iconList.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all border-2 shrink-0
                    ${icon === e ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-surface-container'}`}
                >
                  {e}
                </button>
              ))}
              <div className="w-px h-7 bg-outline-variant/30 mx-0.5 shrink-0" />
              <EmojiPopover onChange={setIcon} />
            </div>
          </div>

          {error && <p className="text-body-sm text-error">{error}</p>}
        </form>

        {/* Danger Zone — space admins only; backend also blocks deleting your only space */}
        {isEdit && space?.my_role === 'admin' && (
          <div className="px-6 pb-5">
            <div className="rounded-xl border border-error/30 p-4 space-y-3">
              <div>
                <p className="text-label-md font-bold text-error">Danger Zone</p>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Permanently delete this space and everything in it. This cannot be undone.
                </p>
              </div>

              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 rounded-full border border-error text-error text-label-sm font-bold hover:bg-error/10 transition"
                >
                  Delete space
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-body-sm text-on-surface">
                    Type <span className="font-mono font-bold">{deleteConfirmPhrase}</span> to confirm.
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder={deleteConfirmPhrase}
                    className="w-full px-4 py-2.5 bg-surface-container rounded-xl border border-outline-variant/30 text-body-sm font-mono text-on-surface focus:outline-none focus:border-error focus:ring-1 focus:ring-error transition-colors"
                  />
                  {deleteSpace.isError && (
                    <p className="text-body-sm text-error">{deleteSpace.error?.response?.data?.error || 'Failed to delete space'}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => deleteSpace.mutate()}
                      disabled={deleteConfirmText.toLowerCase() !== deleteConfirmPhrase.toLowerCase() || deleteSpace.isPending}
                      className="h-10 px-5 rounded-full bg-error text-white text-label-md font-bold hover:bg-error/90 transition disabled:opacity-40 flex items-center gap-2"
                    >
                      {deleteSpace.isPending && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                      Delete Permanently
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                      className="h-10 px-5 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-outline-variant/30 text-body-md font-medium text-on-surface hover:bg-surface-container transition-colors"
          >
            Cancel
          </button>
          <button
            form="space-form"
            type="submit"
            disabled={loading}
            className="flex-1 py-3 rounded-full bg-primary text-on-primary text-body-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <span className="w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />}
            {isEdit ? 'Save changes' : 'Create space'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
