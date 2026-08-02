import React from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { useUiStore } from '../store/uiStore';

// Compact toolbar — just the essentials for jotting thoughts while working.
const NOTE_COMMANDS = [
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.unorderedListCommand,
  commands.checkedListCommand,
  commands.divider,
  commands.link,
];

/**
 * Small markdown scratchpad for a task's freeform notes. Controlled: the
 * caller owns `value` and persistence (TaskForm saves on submit, the Deep Work
 * overlay autosaves). Reuses the same MDEditor the notebooks use, so styling
 * and theme handling are consistent app-wide.
 */
export default function TaskNotes({ value, onChange, height = 200, placeholder, onBlur }) {
  const theme = useUiStore((s) => s.theme);
  return (
    <div
      data-color-mode={theme === 'dark' ? 'dark' : 'light'}
      className="rounded-2xl overflow-hidden border border-outline-variant/30"
    >
      <MDEditor
        value={value || ''}
        onChange={(v = '') => onChange(v)}
        height={height}
        preview="edit"
        visibleDragbar={false}
        commands={NOTE_COMMANDS}
        textareaProps={{
          placeholder: placeholder || 'Jot notes, links and thoughts — markdown supported…',
          onBlur,
        }}
      />
    </div>
  );
}
