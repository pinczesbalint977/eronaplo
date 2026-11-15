import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateHealthPdf } from '../src/lib/healthPdf.js';

const fontBytes = await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
const sunday = '2026-11-15';
const days = [
  { date: '2026-11-09', calories: 2000, protein: 140, carbs: 210, fat: 60 },
  { date: '2026-11-12', calories: 2200, protein: 160, carbs: 250, fat: 70 },
  { date: '2026-11-16', calories: 9999, protein: 999, carbs: 999, fat: 999 },
];
const body = { date: sunday, weight: 82.5, waist: 90.5, neck: 39.5 };
async function report(values = {}) {
  const blob = await generateHealthPdf({ sunday, days, body, ...values }, { fontBytes });
  return { blob, data: Buffer.from(await blob.arrayBuffer()) };
}
function objectStream(data, id) {
  const raw = data.toString('latin1');
  const match = new RegExp(`(?:^|\\n)${id} 0 obj\\n<< /Length (\\d+)[^>]*>>\\nstream\\n`).exec(raw);
  assert.ok(match, `PDF stream object ${id} exists`);
  return data.subarray(match.index + match[0].length, match.index + match[0].length + Number(match[1]));
}
function extractText(data) {
  const cmap = objectStream(data, 10).toString('ascii').split('beginbfchar\n')[1].split('\nendbfchar')[0];
  const unicode = new Map([...cmap.matchAll(/<([0-9A-F]{4})> <([0-9A-F]{4})>/g)]
    .map((match) => [match[1], String.fromCharCode(Number.parseInt(match[2], 16))]));
  return [...objectStream(data, 4).toString('ascii').matchAll(/<([0-9A-F]+)> Tj/g)]
    .map((match) => match[1].match(/.{4}/g).map((code) => {
      assert.ok(unicode.has(code), `Character ${code} is extractable`);
      return unicode.get(code);
    }).join('')).join('\n');
}

test('weekly export is one A4 PDF with a full embedded font and valid byte offsets', async () => {
  const { blob, data } = await report();
  assert.equal(blob.type, 'application/pdf');
  const raw = data.toString('latin1');
  assert.ok(raw.startsWith('%PDF-1.7\n'));
  assert.match(raw, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(raw, /\/Kids \[3 0 R\] \/Count 1/);
  assert.deepEqual(objectStream(data, 8), fontBytes);
  const xref = Number(raw.match(/startxref\n(\d+)/)[1]);
  assert.equal(raw.slice(xref, xref + 4), 'xref');
  const offsets = raw.slice(xref).match(/\d{10} 00000 n /g);
  assert.equal(offsets.length, 11);
  offsets.forEach((entry, index) => assert.ok(raw.slice(Number(entry.slice(0, 10))).startsWith(`${index + 1} 0 obj\n`)));
});

test('Hungarian accents remain searchable and all seven days have explicit units', async () => {
  const { data } = await report();
  const text = extractText(data);
  for (const label of ['ERŐNAPLÓ', 'táplálkozási', 'Fehérje (g)', 'Szénhidrát (g)', 'Zsír (g)', 'Kalória (kcal)',
    'Hétfő', 'Csütörtök', 'Vasárnap', 'Testsúly', 'Derékbőség', 'Nyakkörfogat', '82,5 kg', '90,5 cm', '39,5 cm']) {
    assert.ok(text.includes(label), label);
  }
  assert.equal((text.match(/ · 2026\.11\./g) || []).length, 7);
  assert.ok(text.includes('2026.11.09. – 2026.11.15.'));
});

test('PDF excludes another week and averages saved days instead of missing zeroes', async () => {
  const { data } = await report();
  const text = extractText(data).replaceAll('\u00A0', ' ');
  assert.ok(text.includes('Naplózott napok: 2 / 7.'));
  assert.match(text, /Heti összesen\n4 ?200\n300\n460\n130/);
  assert.match(text, /Napi átlag\n2 ?100\n150\n230\n65/);
  assert.ok(!text.includes('999'));
  assert.ok(!text.includes('2026.11.16.'));
});

test('empty and partial weeks use missing-data markers without invented measurements', async () => {
  const { data } = await report({ days: [], body: null });
  const text = extractText(data);
  assert.ok(text.includes('Még nincs rögzítve'));
  assert.ok(text.includes('Naplózott napok: 0 / 7.'));
  assert.ok(!text.includes('NaN'));
  assert.ok(!text.includes('Infinity'));
  assert.ok(!text.includes('82,5 kg'));
  assert.ok(text.includes('Heti összesen\n—\n—\n—\n—'));
});

test('PDF rejects invalid week, wrong-week measurements and nonfinite inputs', async () => {
  await assert.rejects(report({ sunday: '2026-11-14' }), /vasárnap/);
  await assert.rejects(report({ body: { ...body, date: '2026-11-08' } }), /heti mérés/);
  await assert.rejects(report({ days: [{ ...days[0], calories: Infinity }] }), /érvényes/);
});
