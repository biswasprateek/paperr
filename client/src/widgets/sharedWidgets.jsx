import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useSpaceStore } from '../store/spaceStore';
import { useCelebrationStore } from '../store/celebrationStore';
import WidgetShell, { WidgetEmpty } from './WidgetShell';
import PillSelect from '../components/PillSelect';
import { TIME_SLOTS } from '../pages/routines/shared.jsx';

// Collaborative widgets — unlike the Tasks/Calendar/etc. widgets (which show
// one signed-in user's view of space-wide data), these are built to show
// every member's contribution at once: colour dots per attendee, a column
// per person, an avatar on every completed item. All four are registered for
// both boards (`boards: ['home', 'hub']`) — nothing here is Hub-only, the Hub
// only decides who may rearrange the board, not which widgets exist.

// Matches INDENT_PX/MAX_INDENT in ListsView so nested sub-items line up and
// cap out the same way in the compact widget as on the full list page.
const LIST_INDENT_PX = 24;
const LIST_MAX_INDENT = 4;

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function MemberDot({ user, size = 18, filled = true, onClick, title }) {
  const label = user?.nickname || user?.display_name || '?';
  const content = (
    <span
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 transition-transform"
      style={{
        width: size, height: size, fontSize: size * 0.42,
        backgroundColor: filled ? (user?.avatar_colour || '#6366f1') : 'transparent',
        border: filled ? 'none' : `1.5px solid ${user?.avatar_colour || '#94a3b8'}`,
        color: filled ? '#fff' : (user?.avatar_colour || '#94a3b8'),
      }}
    >
      {initials(label)}
    </span>
  );
  if (!onClick) return <span title={title || label}>{content}</span>;
  return (
    <button type="button" onClick={onClick} title={title || label} className="hover:scale-110 active:scale-95 transition-transform">
      {content}
    </button>
  );
}

// ── Our Calendar ─────────────────────────────────────────────────────────
// One column per member, day-view style — each person's own events for the
// window, side by side, rather than one merged list. An event with several
// attendees appears in each of their columns; one with none falls back to
// its creator's column.

const CALENDAR_RANGES = [
  { value: 'today', label: 'Today',  days: 0 },
  { value: '3day',  label: '3 Days', days: 2 },
  { value: 'week',  label: 'Week',   days: 6 },
];

export function SharedCalendarWidget({ editing, range = 'today', onUpdateProps }) {
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const isTeam = useSpaceStore((s) => s.currentSpace?.type === 'team');
  const cfg = CALENDAR_RANGES.find(r => r.value === range) || CALENDAR_RANGES[0];
  const from = new Date();
  const to = new Date(Date.now() + cfg.days * 86400000);
  const params = { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0], shared: 1 };

  const { data: members = [] } = useQuery({
    queryKey: ['space-members', spaceId],
    queryFn: () => api.get(`/spaces/${spaceId}/members`).then(r => r.data),
    enabled: !!spaceId,
  });

  const { data } = useQuery({
    queryKey: ['calendar', params.from, params.to, 'shared-calendar'],
    queryFn: () => api.get('/calendar', { params }).then(r => r.data),
  });
  const events = data?.events || [];

  const byMember = {};
  for (const m of members) byMember[m.id] = [];
  for (const e of events) {
    const memberIds = e.attendees?.length > 0 ? e.attendees.map(a => a.user_id) : [e.created_by];
    for (const uid of memberIds) {
      if (byMember[uid]) byMember[uid].push(e);
    }
  }
  const hasAny = events.length > 0;

  return (
    <WidgetShell icon="calendar_month" title={isTeam ? 'Team Calendar' : 'Our Calendar'} source="/calendar" editing={editing}>
      {onUpdateProps && (
        <div className="flex gap-1.5 mb-2">
          {CALENDAR_RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => onUpdateProps({ range: r.value })}
              className={`h-6 px-2.5 rounded-full text-[11px] font-bold transition ${
                r.value === range ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {!hasAny ? (
        <WidgetEmpty icon="event_available" label="No events coming up" />
      ) : (
        <div className="flex gap-4 overflow-x-auto -mx-1 px-1 pb-1 h-full">
          {members.map(m => {
            const memberEvents = [...(byMember[m.id] || [])].sort(
              (a, b) => new Date(a.start_datetime) - new Date(b.start_datetime)
            );
            return (
              <div key={m.id} className="flex-shrink-0 w-36">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MemberDot user={m} size={18} />
                  <span className="text-label-md font-semibold text-on-surface truncate">{m.nickname || m.display_name}</span>
                </div>
                {memberEvents.length === 0 ? (
                  <p className="text-label-sm text-on-surface-variant/50 py-1">Nothing scheduled</p>
                ) : (
                  memberEvents.map(e => (
                    <div key={e.id} className="flex items-start gap-1.5 py-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: e.colour || '#6366f1' }} />
                      <div className="min-w-0">
                        <span className="block text-label-sm text-on-surface truncate">{e.title}</span>
                        <span className="block text-[10px] text-on-surface-variant tabular-nums">
                          {format(new Date(e.start_datetime), e.all_day ? 'MMM d' : 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}

// ── List ─────────────────────────────────────────────────────────────────
// Shows one list's items, checked off by anyone who can see it. The picker
// (`/lists`) already returns both the viewer's personal lists and lists
// shared with the space, so this works for either — nothing here needs to
// know or care which kind is selected.

export function ListWidget({ editing, listId, allowAdd = true, onUpdateProps }) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState('');

  const { data: lists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get('/lists').then(r => r.data),
    enabled: !!onUpdateProps && !listId,
  });

  const { data: list } = useQuery({
    queryKey: ['list', listId],
    queryFn: () => api.get(`/lists/${listId}`).then(r => r.data),
    enabled: !!listId,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['list-items', listId],
    queryFn: () => api.get(`/lists/${listId}/items`).then(r => r.data),
    enabled: !!listId,
  });

  const toggle = useMutation({
    mutationFn: (itemId) => api.post(`/lists/items/${itemId}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', listId] }),
  });

  const addItem = useMutation({
    mutationFn: (title) => api.post(`/lists/${listId}/items`, { title }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['list-items', listId] }); setNewTitle(''); },
  });

  const updateItem = useMutation({
    mutationFn: ({ id: itemId, ...data }) => api.put(`/lists/items/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', listId] }),
  });

  const indentItem = (itemId, delta) => {
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    const current = it.indent_level || 0;
    const next = Math.max(0, Math.min(LIST_MAX_INDENT, current + delta));
    if (next !== current) updateItem.mutate({ id: itemId, indent_level: next });
  };

  if (!listId) {
    return (
      <WidgetShell icon="checklist" title="List" editing={editing}>
        {onUpdateProps ? (
          <div className="pt-1">
            <p className="text-label-sm text-on-surface-variant mb-2">Choose a list to show</p>
            <PillSelect
              icon="list"
              value=""
              onChange={(v) => onUpdateProps({ listId: parseInt(v) })}
              options={lists.map(l => ({ value: l.id, label: `${l.icon || '📋'} ${l.name}` }))}
              placeholder="Select a list…"
            />
          </div>
        ) : (
          <WidgetEmpty icon="checklist" label="No list selected yet" />
        )}
      </WidgetShell>
    );
  }

  return (
    <WidgetShell
      icon="checklist"
      title={list?.name || 'List'}
      source="/lists"
      editing={editing}
      footer={!editing && allowAdd && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (newTitle.trim()) addItem.mutate(newTitle.trim()); }}
          className="flex items-center gap-2"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add item…"
            className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface placeholder:text-on-surface-variant/50"
          />
          <button type="submit" disabled={!newTitle.trim()} className="text-primary disabled:opacity-30">
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
          </button>
        </form>
      )}
    >
      {items.length === 0
        ? <WidgetEmpty icon="checklist" label="Nothing on this list" />
        : items.map(item => (
          <div
            key={item.id}
            style={{ marginLeft: (item.indent_level || 0) * LIST_INDENT_PX }}
            className="group flex items-center gap-2.5 py-2 border-b border-outline-variant/10 last:border-0"
          >
            <button
              type="button"
              onClick={() => toggle.mutate(item.id)}
              disabled={editing}
              aria-label={item.is_completed ? 'Mark incomplete' : 'Mark complete'}
              className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition ${
                item.is_completed ? 'bg-primary border-transparent text-white' : 'border-outline hover:border-primary'
              }`}
            >
              {!!item.is_completed && <span className="material-symbols-outlined text-[13px]">check</span>}
            </button>
            <span className={`flex-1 min-w-0 text-body-md truncate ${item.is_completed ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
              {item.title}
            </span>
            {!!item.is_completed && item.completed_by_name && (
              <MemberDot
                user={{ display_name: item.completed_by_name, avatar_colour: item.completed_by_colour }}
                size={18}
                title={`Checked by ${item.completed_by_name}`}
              />
            )}
            {!editing && (
              <div className="flex items-center flex-shrink-0 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-within:opacity-100 transition">
                <button
                  type="button"
                  onClick={() => indentItem(item.id, -1)}
                  disabled={(item.indent_level || 0) === 0}
                  aria-label="Outdent item"
                  title="Outdent"
                  className="p-0.5 rounded-full hover:bg-surface-container transition text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <span className="material-symbols-outlined text-[15px]">format_indent_decrease</span>
                </button>
                <button
                  type="button"
                  onClick={() => indentItem(item.id, 1)}
                  disabled={(item.indent_level || 0) >= LIST_MAX_INDENT}
                  aria-label="Indent item"
                  title="Indent"
                  className="p-0.5 rounded-full hover:bg-surface-container transition text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <span className="material-symbols-outlined text-[15px]">format_indent_increase</span>
                </button>
              </div>
            )}
          </div>
        ))}
    </WidgetShell>
  );
}

// ── Space Routines ───────────────────────────────────────────────────────
// One column per member — each person's own habits, side by side, so the
// whole family/team's daily practice reads at a glance. Only the column
// owner can check off their own habits; everyone can see everyone's.

export function SpaceRoutinesWidget({ editing }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isTeam = useSpaceStore((s) => s.currentSpace?.type === 'team');
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data } = useQuery({
    queryKey: ['routines', 'space', today],
    queryFn: () => api.get('/routines/space', { params: { date: today } }).then(r => r.data),
  });
  const members = data?.members || [];
  const hasAny = members.some(m => (m.habits || []).length > 0);

  const toggle = useMutation({
    mutationFn: ({ habit, completed }) =>
      completed
        ? api.delete(`/routines/habits/${habit.id}/complete`, { params: { date: today } })
        : api.post(`/routines/habits/${habit.id}/complete`, { date: today }),
    onSuccess: (_data, { completed }) => { if (!completed) useCelebrationStore.getState().fire(); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  });

  return (
    <WidgetShell icon="groups" title={isTeam ? 'Team Routines' : 'Our Routines'} source="/routines" editing={editing}>
      {!hasAny ? (
        <WidgetEmpty icon="groups" label="No routines yet" />
      ) : (
        <div className="flex gap-4 overflow-x-auto -mx-1 px-1 pb-1 h-full">
          {members.filter(m => (m.habits || []).length > 0).map(m => {
            const done = m.habits.filter(h => h.completed).length;
            const isMe = m.id === user?.id;

            const bySlot = Object.fromEntries(TIME_SLOTS.map(s => [s.key, []]));
            for (const h of m.habits) {
              (bySlot[h.time_slot] ? bySlot[h.time_slot] : bySlot.morning).push(h);
            }

            return (
              <div key={m.id} className="flex-shrink-0 w-40">
                <div className="flex items-center gap-1.5 mb-1">
                  <MemberDot user={m} size={18} />
                  <span className="text-label-md font-semibold text-on-surface truncate">{m.nickname || m.display_name}</span>
                </div>
                <div className="h-1 rounded-full bg-surface-container overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${m.habits.length ? (done / m.habits.length) * 100 : 0}%`, backgroundColor: m.avatar_colour || '#6366f1' }}
                  />
                </div>
                {TIME_SLOTS.map(slot => bySlot[slot.key].length > 0 && (
                  <div key={slot.key} className="mb-2 last:mb-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[11px] leading-none">{slot.emoji}</span>
                      <span className="text-[10px] tracking-wider text-on-surface-variant/70 font-bold">{slot.label}</span>
                    </div>
                    {bySlot[slot.key].map(h => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={isMe && !editing ? () => toggle.mutate({ habit: h, completed: h.completed }) : undefined}
                        disabled={!isMe || editing}
                        className={`w-full flex items-center gap-1.5 py-1 text-left ${!isMe ? 'cursor-default' : ''}`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${h.completed ? 'border-transparent' : 'border-outline'}`}
                          style={h.completed ? { backgroundColor: h.protocol_color || m.avatar_colour || '#6366f1' } : undefined}
                        >
                          {h.completed && <span className="material-symbols-outlined text-white text-[10px]">check</span>}
                        </span>
                        {h.icon && <span className="text-[11px] flex-shrink-0">{h.icon}</span>}
                        <span className={`text-label-sm truncate ${h.completed ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                          {h.title}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}

// ── Sticky Pads ───────────────────────────────────────────────────────────

const STICKY_COLOURS = ['#FDE68A', '#BBF7D0', '#BFDBFE', '#FBCFE8', '#DDD6FE', '#FED7AA'];
const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never expires' },
  { value: '60',    label: 'Expires in 1 hour' },
  { value: '1440',  label: 'Expires in 1 day' },
  { value: '4320',  label: 'Expires in 3 days' },
  { value: '10080', label: 'Expires in 1 week' },
  { value: '43200', label: 'Expires in 30 days' },
];

// A small icon trigger whose content portals to document.body — mirrors
// PillSelect's approach, since the widget card's own overflow-hidden would
// otherwise clip a popover opening out of the composer footer.
function IconPopover({ icon, label, triggerClassName = '', children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const anchorRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (anchorRef.current && !anchorRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = () => {
    if (!open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.top - 8, left: r.left });
    }
    setOpen(v => !v);
  };

  return (
    <div ref={anchorRef} className="flex-shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-container text-on-surface-variant hover:text-on-surface ${triggerClassName}`}
      >
        {icon}
      </button>
      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateY(-100%)', zIndex: 9999 }}
          className="bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 p-2"
        >
          {children(() => setOpen(false))}
        </div>,
        document.body
      )}
    </div>
  );
}

function StickyComposer({ onPost }) {
  const [text, setText] = useState('');
  const [colour, setColour] = useState(STICKY_COLOURS[0]);
  const [expiresInMinutes, setExpiresInMinutes] = useState('never');

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onPost({ text: text.trim(), colour, expiresInMinutes: expiresInMinutes === 'never' ? null : expiresInMinutes });
    setText('');
  };

  const expiryLabel = EXPIRY_OPTIONS.find(o => o.value === expiresInMinutes)?.label;

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5 py-1">
      <IconPopover label="Choose color" triggerClassName="bg-transparent" icon={<span className="w-4 h-4 rounded-full block" style={{ backgroundColor: colour }} />}>
        {(close) => (
          <div className="flex items-center gap-1">
            {STICKY_COLOURS.map(c => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setColour(c); close(); }}
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: c }}
              >
                {colour === c && <span className="material-symbols-outlined text-[12px] text-on-surface/70">check</span>}
              </button>
            ))}
          </div>
        )}
      </IconPopover>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Leave a note for the space…"
        maxLength={280}
        className="flex-1 min-w-0 h-8 bg-surface-container rounded-full px-3 text-body-md text-on-surface placeholder:text-on-surface-variant/50 border-none focus:ring-2 focus:ring-primary/30"
      />

      <IconPopover label={expiryLabel} icon={<span className="material-symbols-outlined text-[16px]">schedule</span>}>
        {(close) => (
          <div className="flex flex-col min-w-[150px]">
            {EXPIRY_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setExpiresInMinutes(o.value); close(); }}
                className={`text-left px-3 py-1.5 rounded-lg text-label-md whitespace-nowrap ${
                  expiresInMinutes === o.value ? 'text-primary font-semibold bg-primary/5' : 'text-on-surface hover:bg-surface-container'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </IconPopover>

      <button
        type="submit"
        disabled={!text.trim()}
        aria-label="Post"
        className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-[16px]">send</span>
      </button>
    </form>
  );
}

export function StickyPadsWidget({ editing }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = useSpaceStore((s) => s.currentSpace?.my_role === 'admin');

  const { data: notes = [] } = useQuery({
    queryKey: ['sticky-notes'],
    queryFn: () => api.get('/sticky-notes').then(r => r.data),
  });

  const post = useMutation({
    mutationFn: (payload) => api.post('/sticky-notes', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sticky-notes'] }),
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/sticky-notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sticky-notes'] }),
  });

  return (
    <WidgetShell
      icon="sticky_note_2"
      title="Sticky Pads"
      editing={editing}
      footer={!editing && <StickyComposer onPost={(p) => post.mutate(p)} />}
    >
      {notes.length === 0 ? (
        <WidgetEmpty icon="sticky_note_2" label="No notes yet — leave one for the space" />
      ) : (
        <div className="flex flex-wrap gap-4 pt-1 pb-2 px-1">
          {notes.map(n => {
            const canDelete = !editing && (n.author_id === user?.id || isAdmin);
            // Deterministic per-note tilt — a real corkboard note never sits
            // perfectly straight. Range roughly -3.5° to 3.5°.
            const rot = (((n.id * 37) % 15) - 7) / 2;
            return (
              <div
                key={n.id}
                className="w-[45%] min-w-[110px] rounded-sm p-2.5 relative
                           rotate-[var(--rot)]
                           shadow-[0_3px_6px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.12)]
                           hover:shadow-[0_8px_16px_rgba(0,0,0,0.22),0_2px_4px_rgba(0,0,0,0.14)]
                           hover:rotate-0 hover:scale-[1.04] hover:z-10
                           transition-transform duration-200 ease-out"
                style={{ backgroundColor: n.colour || STICKY_COLOURS[0], '--rot': `${rot}deg` }}
              >
                {canDelete && (
                  <button
                    onClick={() => remove.mutate(n.id)}
                    aria-label="Remove note"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-black/40 hover:text-black/70 hover:bg-black/10 transition"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
                <p className="text-[13px] text-black/80 leading-snug break-words pr-4 line-clamp-4">{n.text}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <MemberDot user={{ display_name: n.author_name, avatar_colour: n.author_colour }} size={16} />
                  <span className="text-[10px] text-black/60 truncate">
                    {n.author_nickname || n.author_name?.split(' ')[0]}
                  </span>
                  {n.expires_at && (
                    <span className="ml-auto text-[9px] text-black/50 flex-shrink-0" title="Expires">
                      {formatDistanceToNow(parseISO(n.expires_at.replace(' ', 'T')), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}

// ── Deep Work ────────────────────────────────────────────────────────────
// Who's currently heads-down, and on what — live via the deepwork:started/
// deepwork:stopped socket events (see useSocket.js), which invalidate this
// query's key so the list updates without this widget managing its own
// socket subscription (same pattern every other widget in this file uses).
export function DeepWorkWidget({ editing }) {
  const { data: sessions = [] } = useQuery({
    queryKey: ['deep-work-active'],
    queryFn: () => api.get('/deep-work/active').then(r => r.data),
  });

  return (
    <WidgetShell icon="center_focus_strong" title="Deep Work" source="/tasks" editing={editing} count={sessions.length || null}>
      {sessions.length === 0 ? (
        <WidgetEmpty icon="center_focus_strong" label="No one's in deep work right now" />
      ) : (
        sessions.map(s => (
          <div key={s.id} className="flex items-center gap-2.5 py-2 border-b border-outline-variant/10 last:border-0">
            <MemberDot user={{ display_name: s.display_name, avatar_colour: s.avatar_colour }} size={22} />
            <div className="min-w-0 flex-1">
              <p className="text-body-md text-on-surface truncate">{s.task_title}</p>
              <p className="text-label-sm text-on-surface-variant/70 truncate">{s.display_name}</p>
            </div>
          </div>
        ))
      )}
    </WidgetShell>
  );
}
