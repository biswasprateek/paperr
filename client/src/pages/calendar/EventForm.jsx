import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../auth/AuthContext';
import { useSpaceStore } from '../../store/spaceStore';
import PillSelect from '../../components/PillSelect';

const RECUR_OPTIONS = [
  { value: 'daily',    label: 'Daily'         },
  { value: 'weekly',   label: 'Weekly'        },
  { value: 'weekdays', label: 'Specific days' },
  { value: 'monthly',  label: 'Monthly'       },
  { value: 'yearly',   label: 'Yearly'        },
];

// 0=Sun … 6=Sat, matching the task form and the server's recur_days storage.
const WEEKDAYS = [
  { value: 0, label: 'S' }, { value: 1, label: 'M' }, { value: 2, label: 'T' },
  { value: 3, label: 'W' }, { value: 4, label: 'T' }, { value: 5, label: 'F' },
  { value: 6, label: 'S' },
];

const COLOURS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];

// 15-minute interval time options in 12-hour format
const TIME_OPTIONS = (() => {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const ampm  = h < 12 ? 'AM' : 'PM';
      const dh    = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${dh}:${String(m).padStart(2, '0')} ${ampm}`;
      opts.push({ value, label });
    }
  }
  return opts;
})();

function snapTo15(timeStr) {
  if (!timeStr) return '09:00';
  const [h, m] = timeStr.split(':').map(Number);
  const rounded = Math.round(m / 15) * 15;
  if (rounded === 60) {
    const nh = (h + 1) % 24;
    return `${String(nh).padStart(2, '0')}:00`;
  }
  return `${String(h).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

function splitDt(dt) {
  if (!dt) return { date: '', time: '09:00' };
  const [date, time = '09:00'] = dt.split('T');
  return { date, time: snapTo15(time) };
}

function joinDt(date, time) {
  if (!date) return '';
  return `${date}T${time}`;
}

// Default a new event's end to start + 30m (matching the half-hour slot the
// user clicked) so the End picker isn't left blank.
function addThirtyMinutes(datetimeStr) {
  const d = new Date(datetimeStr);
  d.setMinutes(d.getMinutes() + 30);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  return iso.length === 10 ? iso + 'T00:00' : iso.slice(0, 16);
}

// Split date + time select for a single datetime field
function DateTimePicker({ label, value, onChange, disabled }) {
  const { date, time } = splitDt(value);

  function handleDate(e) {
    onChange(joinDt(e.target.value, time || '09:00'));
  }
  function handleTime(v) {
    onChange(joinDt(date, v));
  }

  return (
    <div>
      <label className="text-xs text-on-surface-variant font-label-sm mb-1 block">{label}</label>
      <div className="flex gap-1.5">
        <input
          type="date"
          value={date}
          onChange={handleDate}
          disabled={disabled}
          style={{ textAlign: 'center' }}
          className="flex-1 min-w-0 h-12 bg-surface-container rounded-full px-4 text-on-surface text-sm border border-transparent hover:border-primary focus:ring-2 focus:ring-primary/70 outline-none transition-all"
        />
        <div className="flex-1 min-w-0">
          <PillSelect
            value={time}
            onChange={handleTime}
            options={TIME_OPTIONS}
            placeholder="--:--"
            disabled={disabled || !date}
          />
        </div>
      </div>
    </div>
  );
}

export default function EventForm({ open, onClose, event = null, defaultDate = null }) {
  const qc = useQueryClient();
  const isEdit = !!event;

  const [form, setForm] = useState({
    title: '',
    description: '',
    start_datetime: '',
    end_datetime: '',
    all_day: false,
    location: '',
    colour: '',
    project_id: '',
    is_recurring: false,
    recur_interval: 'weekly',
    recur_days: [],
    recur_end_date: '',
    attendee_ids: [],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (event) {
      setForm({
        title:          event.title ?? '',
        description:    event.description ?? '',
        start_datetime: toDatetimeLocal(event.start_datetime),
        end_datetime:   toDatetimeLocal(event.end_datetime),
        all_day:        !!event.all_day,
        location:       event.location ?? '',
        colour:         event.colour ?? '',
        project_id:     event.project_id ?? '',
        is_recurring:   !!event.is_recurring,
        recur_interval: event.recur_interval ?? 'weekly',
        recur_days:     event.recur_days ? event.recur_days.split(',').filter(Boolean).map(Number) : [],
        recur_end_date: event.recur_end_date ?? '',
        attendee_ids:   (event.attendees ?? []).map(a => a.user_id),
      });
    } else {
      // defaultDate is date-only ("YYYY-MM-DD") from Month cells / header button,
      // but a full datetime ("YYYY-MM-DDTHH:MM") from Day/Week hour slots —
      // only append a default time when one isn't already there.
      let start = '';
      if (defaultDate) {
        start = defaultDate.includes('T')
          ? `${defaultDate.slice(0, 10)}T${snapTo15(defaultDate.slice(11, 16))}`
          : `${defaultDate}T09:00`;
      }
      setForm({
        title: '', description: '', start_datetime: start, end_datetime: start ? addThirtyMinutes(start) : '',
        all_day: false, location: '', colour: '', project_id: '',
        is_recurring: false, recur_interval: 'weekly', recur_days: [], recur_end_date: '', attendee_ids: [],
      });
    }
    setError('');
  }, [open, event, defaultDate]);

  const spaceId = useSpaceStore(s => s.currentSpaceId);
  const { data: users = [] } = useQuery({
    queryKey: ['spaces', spaceId, 'members'],
    queryFn: () => api.get(`/spaces/${spaceId}/members`).then(r => r.data),
    enabled: open && !!spaceId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const saveMutation = useMutation({
    mutationFn: (payload) => isEdit
      ? api.put(`/calendar/events/${event.id}`, payload).then(r => r.data)
      : api.post('/calendar/events', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: (err) => setError(err.response?.data?.error ?? 'Failed to save event'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/calendar/events/${event.id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: () => setError('Failed to delete event'),
  });

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleRecurDay(day) {
    setForm(f => ({
      ...f,
      recur_days: f.recur_days.includes(day)
        ? f.recur_days.filter(d => d !== day)
        : [...f.recur_days, day],
    }));
  }

  function toggleAttendee(uid) {
    setForm(f => ({
      ...f,
      attendee_ids: f.attendee_ids.includes(uid)
        ? f.attendee_ids.filter(id => id !== uid)
        : [...f.attendee_ids, uid],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.start_datetime) { setError('Start date/time is required'); return; }

    const payload = {
      ...form,
      project_id:     form.project_id     || null,
      colour:         form.colour         || null,
      end_datetime:   form.end_datetime   || null,
      recur_interval: form.is_recurring ? form.recur_interval : null,
      recur_days:     form.is_recurring && form.recur_interval === 'weekdays'
        ? form.recur_days.slice().sort((a, b) => a - b).join(',')
        : null,
      recur_end_date: form.is_recurring && form.recur_end_date ? form.recur_end_date : null,
    };
    saveMutation.mutate(payload);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 shrink-0">
          <h2 className="font-headline-md text-on-surface">
            {isEdit ? 'Edit Event' : 'New Event'}
          </h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <form id="event-form" onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Title */}
          <input
            type="text"
            placeholder="Event title"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            className="w-full bg-surface-container rounded-xl px-4 py-3 text-on-surface placeholder-on-surface-variant font-body-lg border-0 focus:ring-2 focus:ring-primary outline-none"
          />

          {/* All-day toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set('all_day', !form.all_day)}
              className={`w-10 h-6 rounded-full transition-colors flex items-center ${form.all_day ? 'bg-primary' : 'bg-outline-variant'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${form.all_day ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-on-surface-variant font-body-md">All day</span>
          </label>

          {/* Start / End */}
          {form.all_day ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-on-surface-variant font-label-sm mb-1 block">Start</label>
                <input
                  type="date"
                  value={form.start_datetime.slice(0, 10)}
                  onChange={e => set('start_datetime', e.target.value)}
                  className="w-full bg-surface-container rounded-xl px-3 py-2.5 text-on-surface text-sm border-0 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-on-surface-variant font-label-sm mb-1 block">End</label>
                <input
                  type="date"
                  value={form.end_datetime.slice(0, 10)}
                  onChange={e => set('end_datetime', e.target.value)}
                  className="w-full bg-surface-container rounded-xl px-3 py-2.5 text-on-surface text-sm border-0 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <DateTimePicker
                label="Start"
                value={form.start_datetime}
                onChange={v => set('start_datetime', v)}
              />
              <DateTimePicker
                label="End"
                value={form.end_datetime}
                onChange={v => set('end_datetime', v)}
              />
            </div>
          )}

          {/* Location */}
          <div className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-2.5">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">location_on</span>
            <input
              type="text"
              placeholder="Location (optional)"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              className="flex-1 bg-transparent text-on-surface placeholder-on-surface-variant font-body-md border-0 outline-none"
            />
          </div>

          {/* Description */}
          <textarea
            placeholder="Description (optional)"
            rows={2}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            className="w-full bg-surface-container rounded-xl px-4 py-3 text-on-surface placeholder-on-surface-variant font-body-md border-0 focus:ring-2 focus:ring-primary outline-none resize-none"
          />

          {/* Project link */}
          <div>
            <label className="text-xs text-on-surface-variant font-label-sm mb-1 block">Link to Project (optional)</label>
            <select
              value={form.project_id}
              onChange={e => set('project_id', e.target.value)}
              className="w-full bg-surface-container rounded-xl px-4 py-2.5 text-on-surface font-body-md border-0 focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Colour */}
          <div>
            <label className="text-xs text-on-surface-variant font-label-sm mb-2 block">Colour (optional)</label>
            <div className="flex gap-2 flex-wrap">
              {COLOURS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('colour', form.colour === c ? '' : c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: form.colour === c ? `3px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Attendees */}
          {users.length > 0 && (
            <div>
              <label className="text-xs text-on-surface-variant font-label-sm mb-2 block">Attendees</label>
              <div className="flex flex-wrap gap-2">
                {users.map(u => {
                  const selected = form.attendee_ids.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAttendee(u.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition
                        ${selected
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: u.avatar_colour ?? '#6366f1' }}
                      />
                      {u.display_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recurring */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => set('is_recurring', !form.is_recurring)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center ${form.is_recurring ? 'bg-primary' : 'bg-outline-variant'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${form.is_recurring ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-on-surface-variant font-body-md">Recurring</span>
            </label>
            {form.is_recurring && (
              <div className="flex flex-col gap-2 pl-1">
                <select
                  value={form.recur_interval}
                  onChange={e => set('recur_interval', e.target.value)}
                  className="bg-surface-container rounded-xl px-4 py-2 text-on-surface font-body-md border-0 focus:ring-2 focus:ring-primary outline-none"
                >
                  {RECUR_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {form.recur_interval === 'weekdays' && (
                  <div>
                    <p className="text-xs text-on-surface-variant font-label-sm mb-2">Repeat on</p>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map(d => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleRecurDay(d.value)}
                          className={`w-9 h-9 rounded-full text-sm font-medium transition
                            ${form.recur_days.includes(d.value)
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-on-surface-variant font-label-sm mb-1 block">End Date (optional)</label>
                  <input
                    type="date"
                    value={form.recur_end_date}
                    onChange={e => set('recur_end_date', e.target.value)}
                    className="bg-surface-container rounded-xl px-4 py-2 text-on-surface text-sm border-0 focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>
            )}
          </div>

        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 shrink-0 flex items-center justify-between gap-3">
          {isEdit && (
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-xl text-error font-label-md hover:bg-error-container/50 transition"
            >
              Delete
            </button>
          )}
          {error && <p className="text-error text-xs flex-1">{error}</p>}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md hover:bg-surface-container-high transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="event-form"
              disabled={saveMutation.isPending}
              className="px-5 py-2 rounded-xl bg-primary text-on-primary font-label-md hover:opacity-90 transition disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
