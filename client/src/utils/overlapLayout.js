// Assigns each timed item a column + column-count within its overlap cluster,
// so callers can render same-day collisions side-by-side instead of stacked
// on top of one another. `items` may be any shape — pass accessors for the
// start/end minutes-since-midnight.
export function layoutOverlaps(items, getStart, getEnd) {
  const entries = items.map((it, idx) => {
    const start = getStart(it);
    const end   = Math.max(getEnd(it), start + 15); // minimum visual duration
    return { idx, start, end };
  });
  entries.sort((a, b) => a.start - b.start || a.end - b.end);

  const result = new Array(items.length);
  let colEnds = [];       // end time currently occupying each column, for the active cluster
  let clusterEntries = []; // {idx, col} accumulated for the active cluster
  let clusterMaxEnd = -Infinity;

  function flushCluster() {
    if (clusterEntries.length === 0) return;
    const cols = Math.max(...clusterEntries.map(e => e.col)) + 1;
    for (const e of clusterEntries) result[e.idx] = { col: e.col, cols };
    clusterEntries = [];
  }

  for (const entry of entries) {
    if (entry.start >= clusterMaxEnd) {
      flushCluster();
      colEnds = [];
      clusterMaxEnd = -Infinity;
    }
    let col = colEnds.findIndex(end => end <= entry.start);
    if (col === -1) { col = colEnds.length; colEnds.push(entry.end); }
    else colEnds[col] = entry.end;
    clusterEntries.push({ idx: entry.idx, col });
    clusterMaxEnd = Math.max(clusterMaxEnd, entry.end);
  }
  flushCluster();

  return result;
}
