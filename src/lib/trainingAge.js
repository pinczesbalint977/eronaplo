const DAY_MS = 86_400_000;

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

// Count complete weeks and calendar months, independently, from the first log.
// Calendar anniversaries clamp to month-end (January 31 -> February 28).
export function trainingAge(firstDate, currentDate) {
  const first = calendarDate(firstDate);
  const current = calendarDate(currentDate);
  if (!first || !current || current < first) return null;
  const days = (current.getTime() - first.getTime()) / DAY_MS;
  let months = (current.getUTCFullYear() - first.getUTCFullYear()) * 12 + current.getUTCMonth() - first.getUTCMonth();
  const monthEnd = new Date(current);
  monthEnd.setUTCFullYear(current.getUTCFullYear(), current.getUTCMonth() + 1, 0);
  if (current.getUTCDate() < Math.min(first.getUTCDate(), monthEnd.getUTCDate())) months--;
  return { weeks: Math.floor(days / 7), months, days };
}
