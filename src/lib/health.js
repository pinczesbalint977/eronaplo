const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'];

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Érvényes dátumot adj meg.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Érvényes, 2000 utáni dátumot adj meg.');
  }
  return date;
}
const dateText = (date) => date.toISOString().slice(0, 10);

export function weekSunday(value) {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay()) % 7);
  return dateText(date);
}

export function weekDates(sunday) {
  const end = calendarDate(sunday);
  if (end.getUTCDay() !== 0) throw new Error('A hét zárónapja vasárnap legyen.');
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    return dateText(date);
  });
}

function exactFields(values, fields) {
  if (!values || Array.isArray(values) || typeof values !== 'object'
    || Object.keys(values).length !== fields.length || !fields.every((field) => Object.hasOwn(values, field))) {
    throw new Error('Tölts ki minden mezőt a mentéshez.');
  }
  calendarDate(values.date);
}
function amount(value, min, max, label) {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const result = typeof normalized === 'number' || (typeof normalized === 'string' && normalized !== '') ? Number(normalized) : NaN;
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${label}: ${min} és ${max} közötti számot adj meg.`);
  return result;
}

export function validateNutrition(values) {
  exactFields(values, ['date', ...NUTRIENTS]);
  return { date: values.date,
    calories: amount(values.calories, 0, 20000, 'Kalória (kcal)'),
    protein: amount(values.protein, 0, 2000, 'Fehérje (g)'),
    carbs: amount(values.carbs, 0, 2000, 'Szénhidrát (g)'),
    fat: amount(values.fat, 0, 2000, 'Zsír (g)'),
  };
}

export function validateBody(values) {
  exactFields(values, ['date', 'weight', 'waist', 'neck']);
  if (calendarDate(values.date).getUTCDay() !== 0) throw new Error('A heti mérés dátuma vasárnap legyen.');
  return { date: values.date,
    weight: amount(values.weight, 20, 500, 'Testsúly (kg)'),
    waist: amount(values.waist, 20, 300, 'Derékbőség (cm)'),
    neck: amount(values.neck, 10, 100, 'Nyakkörfogat (cm)'),
  };
}

export function healthWeekSummary(days) {
  const unique = new Map();
  for (const day of days || []) {
    if (day && NUTRIENTS.every((key) => typeof day[key] === 'number' && Number.isFinite(day[key]))) unique.set(day.date, day);
  }
  const round = (number) => Math.round((number + Number.EPSILON) * 100) / 100;
  const total = Object.fromEntries(NUTRIENTS.map((key) => [key, round([...unique.values()].reduce((sum, day) => sum + day[key], 0))]));
  return { days: unique.size, total,
    average: unique.size ? Object.fromEntries(NUTRIENTS.map((key) => [key, round(total[key] / unique.size)])) : null };
}
