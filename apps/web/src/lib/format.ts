/**
 * Format paise (integer) as an Indian Rupee string.
 *
 * **The precise form always carries both paise digits.** It used to omit the
 * decimals when they were zero, which is how one money column came to read
 * `\u20b91,00,000` on one row and `\u20b96,747.19` on the next \u2014 the same quantity in
 * two shapes, in a product whose whole claim is that the arithmetic is exact.
 * Nothing about the VALUE changes: the paise are integers on the way in and
 * every digit of them is on the way out. What changes is that a column of
 * amounts now lines up as one.
 *
 * `compact` is the deliberate exception and is passed at exactly one call site
 * \u2014 a headline tile whose job is magnitude, not tie-out. Every operational
 * figure (a table cell, a residual against its threshold, a ledger balance)
 * takes the precise form.
 *
 * The grouping and the paise are computed on the integer, not on `paise / 100`:
 * a float remainder is what made a negative amount render its decimals from the
 * wrong side of zero.
 */
export function formatPaise(paise: number, compact = false): string {
  const rupees = paise / 100;
  if (compact) {
    if (rupees >= 1_00_00_000) return `\u20b9${(rupees / 1_00_00_000).toFixed(1)}Cr`;
    if (rupees >= 1_00_000)    return `\u20b9${(rupees / 1_00_000).toFixed(1)}L`;
    if (rupees >= 1_000)       return `\u20b9${(rupees / 1_000).toFixed(1)}K`;
  }
  const abs = Math.round(Math.abs(paise));
  const intPart = Math.floor(abs / 100);
  // Indian number formatting: XX,XX,XXX
  const s = intPart.toString();
  let formatted: string;
  if (s.length <= 3) {
    formatted = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    const groups = [];
    for (let i = rest.length; i > 0; i -= 2) {
      groups.unshift(rest.slice(Math.max(0, i - 2), i));
    }
    formatted = groups.join(',') + ',' + last3;
  }
  const dec = (abs % 100).toString().padStart(2, '0');
  return `\u20b9${paise < 0 ? '-' : ''}${formatted}.${dec}`;
}

/** Format a coverage ratio as percentage with 1 decimal. */
export function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Format a count integer with Indian grouping. */
export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

/** Format Unix seconds as a readable date string. */
export function formatTimestamp(secs: number): string {
  return new Date(secs * 1000).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/** Truncate a long ID for display. */
export function shortId(id: string, len = 16): string {
  return id.length > len ? `${id.slice(0, len)}\u2026` : id;
}

/** Age in hours from unix timestamp. */
export function ageHours(createdAt: number): string {
  const h = (Date.now() / 1000 - createdAt) / 3600;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * DATA_MODEL.md §16's actor block, as one line.
 *
 * The block has no `id`. It answers "was a model involved, and which one?"
 * through `type` (deterministic | llm | human) and `component` (the code that
 * took the step), so those are the two fields shown -- on the demo abstention
 * that reads `deterministic / engine.s5_validate`. Nothing is substituted when
 * `component` is missing: an actor identifier this app invented would be worse
 * than a visibly absent one.
 */
export function formatActor(actor: { type: string; component: string }): string {
  return `${actor.type} / ${actor.component}`;
}
