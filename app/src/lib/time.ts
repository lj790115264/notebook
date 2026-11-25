export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateTime(d: Date): string {
  const date = formatDate(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${date}T${hh}:${mm}:${ss}`;
}

/** Local calendar date of an ISO-like `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`. */
export function completedLocalDate(completed: string): string | null {
  const trimmed = completed.trim();
  if (!trimmed) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return m ? m[1] : null;
}

/** Monday 00:00 – Sunday end (as date strings YYYY-MM-DD inclusive). */
export function weekRange(now: Date): { start: string; end: string } {
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const offsetFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - offsetFromMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
}
