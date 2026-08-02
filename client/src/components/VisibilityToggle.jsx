import React from 'react';

// "Shared" badge shown in list/card views next to a shared item's name —
// mirrors pages/routines/ProtocolsView.jsx. Personal items render nothing.
export function SharedBadge({ visibility }) {
  if (visibility !== 'shared') return null;
  return (
    <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant/60 bg-surface-container rounded-full px-2 py-0.5 flex-shrink-0">
      <span className="material-symbols-outlined text-[13px]">group</span>
      Shared
    </span>
  );
}

const VISIBILITIES = [
  { key: 'personal', label: 'Personal', icon: 'person' },
  { key: 'shared',   label: 'Shared',   icon: 'group' },
];

// Personal/Shared toggle used by Notebooks, Lists, Projects, and Custom Agents —
// mirrors the pattern from pages/routines/ProtocolFormModal.jsx.
export default function VisibilityToggle({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {VISIBILITIES.map(v => (
        <button
          key={v.key}
          type="button"
          onClick={() => onChange(v.key)}
          className={`flex-1 h-11 rounded-full flex items-center justify-center gap-2 text-label-md transition ${
            value === v.key
              ? 'bg-primary text-on-primary font-bold'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">{v.icon}</span>
          {v.label}
        </button>
      ))}
    </div>
  );
}
