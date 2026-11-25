/* =========================================================================
   NAME SEARCH
   Accent- and order-insensitive matching with gentle typo tolerance:
   "saber singh" finds "Saber Singh", "Singh, Saber" and "Sabeer Singh".
   Results are ranked: exact name → starts with → word starts with →
   contains → close spelling.
   ========================================================================= */

export function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Edit distance, capped (we only care about 0, 1 or 2). */
function closeEnough(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return false;
  }
  return prev[b.length] <= max;
}

/* Lower score = better match. null = no match. */
export function scoreName(name, query) {
  const n = normaliseName(name);
  const q = normaliseName(query);
  if (!q) return null;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;

  const parts = n.split(' ');
  const words = q.split(' ');
  let score = 2;
  for (const word of words) {
    if (parts.some(part => part.startsWith(word))) continue;
    if (n.includes(word)) {
      score += 1;
      continue;
    }
    // Typo tolerance for words of 4+ letters (1 slip; 2 for long words).
    const max = word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0;
    if (max && parts.some(part => closeEnough(part.slice(0, word.length + max), word, max) || closeEnough(part, word, max))) {
      score += 3;
      continue;
    }
    return null;
  }
  return score;
}

export function rankByName(items, query, getName, limit = 24) {
  return items
    .map(item => ({ item, score: scoreName(getName(item), query) }))
    .filter(entry => entry.score !== null)
    .sort((a, b) => a.score - b.score || String(getName(a.item)).localeCompare(String(getName(b.item))))
    .slice(0, limit)
    .map(entry => entry.item);
}
