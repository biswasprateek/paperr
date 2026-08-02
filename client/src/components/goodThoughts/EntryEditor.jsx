import React, { useEffect, useRef, useState } from 'react';

// Inline character styling only — no block/layout editing. document.execCommand
// is deprecated but still broadly supported and is the smallest way to get
// five toggleable marks out of a contentEditable div without a new dependency.
const MARKS = [
  { cmd: 'bold', icon: 'format_bold', label: 'Bold' },
  { cmd: 'italic', icon: 'format_italic', label: 'Italic' },
  { cmd: 'underline', icon: 'format_underlined', label: 'Underline' },
  { cmd: 'strikeThrough', icon: 'format_strikethrough', label: 'Strikethrough' },
];

// Add/edit form for one thought entry. `entry` null means creating a new one.
export default function EntryEditor({ entry, onCancel, onSave, saving }) {
  const editorRef = useRef(null);
  const [attribution, setAttribution] = useState(entry?.attribution || '');
  const [empty, setEmpty] = useState(!entry?.body);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = entry?.body || '';
    setEmpty(!entry?.body);
  }, [entry?.id]);

  const exec = (cmd) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
  };
  const clearFormatting = () => {
    editorRef.current?.focus();
    document.execCommand('removeFormat', false, null);
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || '';
    if (!editorRef.current?.textContent?.trim()) return;
    onSave({ body: html, attribution: attribution.trim() || null });
  };

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container p-4 space-y-3">
      <div className="flex items-center gap-1">
        {MARKS.map((m) => (
          <button
            key={m.cmd}
            type="button"
            aria-label={m.label}
            title={m.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(m.cmd)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition"
          >
            <span className="material-symbols-outlined text-[16px]">{m.icon}</span>
          </button>
        ))}
        <button
          type="button"
          aria-label="Clear formatting"
          title="Clear formatting"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearFormatting}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition"
        >
          <span className="material-symbols-outlined text-[16px]">format_clear</span>
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => setEmpty(!editorRef.current?.textContent?.trim())}
        data-placeholder="Type a thought…"
        className={`min-h-[76px] rounded-xl bg-surface-container-lowest px-3.5 py-3 text-body-lg text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition ${
          empty ? "before:content-[attr(data-placeholder)] before:text-on-surface-variant/40 before:pointer-events-none" : ''
        }`}
      />

      <input
        value={attribution}
        onChange={(e) => setAttribution(e.target.value)}
        placeholder="Attribution (optional) — e.g. Marcus Aurelius"
        className="w-full bg-surface-container-lowest rounded-full px-3.5 py-2 text-body-sm text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition"
      />

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-full text-label-md text-on-surface-variant hover:bg-surface-container-high transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || empty}
          className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
