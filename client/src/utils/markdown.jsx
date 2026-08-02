import React from 'react';

// Minimal markdown renderer shared by chat messages and agent insight cards.
// Supports bold inline text, bullet/numbered lists, and pipe tables — enough
// for the LLM's typical output without pulling in a full markdown library.

export function renderInline(str) {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-on-surface">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const [, hashes, headingText] = heading;
      const HeadingTag = ['h4', 'h5', 'h6'][hashes.length - 1];
      const headingClass = hashes.length === 1
        ? 'text-body-lg font-bold text-on-surface mt-2'
        : hashes.length === 2
          ? 'text-body-md font-bold text-on-surface mt-2'
          : 'text-label-md font-bold uppercase tracking-wide text-on-surface-variant mt-2';
      elements.push(<HeadingTag key={`h-${i}`} className={headingClass}>{renderInline(headingText)}</HeadingTag>);
      i++;
      continue;
    }

    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] /, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1.5 my-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1.5 my-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5">
              <span className="text-primary font-semibold text-label-sm flex-shrink-0 mt-0.5 min-w-[1rem] text-right">{j + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const parseRow = (row) =>
        row.split('|').slice(1, -1).map(cell => cell.trim());
      const isSeparator = (row) => /^[\s|:\-]+$/.test(row);
      const rows = tableLines.filter(r => !isSeparator(r));
      if (rows.length > 0) {
        const [headerRow, ...dataRows] = rows;
        const headers = parseRow(headerRow);
        elements.push(
          <div key={`tbl-${i}`} className="my-2 w-full overflow-x-auto rounded-xl border border-outline-variant/20">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="bg-surface-container">
                  {headers.map((h, j) => (
                    <th key={j} className="px-3 py-2 text-left text-label-sm font-semibold text-on-surface-variant border-b border-outline-variant/20">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, j) => (
                  <tr key={j} className={j % 2 === 1 ? 'bg-surface-container/40' : ''}>
                    {parseRow(row).map((cell, k) => (
                      <td key={k} className="px-3 py-2 text-on-surface border-b border-outline-variant/10 last:border-b-0">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    elements.push(<p key={`p-${i}`} className="leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}
