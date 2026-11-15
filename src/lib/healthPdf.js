import { weekDates } from './health.js';

// Noto Sans Regular, SIL OFL 1.1; distributed unchanged with public/fonts/OFL.txt.
// Source: https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf
// The PDF is generated entirely on the device. No personal data is transmitted.
let fontPromise;
const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(value);
const hex = (value) => value.toString(16).padStart(4, '0').toUpperCase();
const fields = ['calories', 'protein', 'carbs', 'fat'];
const weekdays = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
const number = (value) => new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(value);
const dateLabel = (date) => date.replaceAll('-', '.') + '.';

function loadFont() {
  if (!fontPromise) {
    const base = import.meta.env?.BASE_URL || '/';
    fontPromise = fetch(`${base}fonts/NotoSans-Regular.ttf`).then(async (response) => {
      if (!response.ok) throw new Error('A PDF betűtípusa nem tölthető be. Próbáld újra internetkapcsolattal.');
      return new Uint8Array(await response.arrayBuffer());
    }).catch((error) => { fontPromise = null; throw error; });
  }
  return fontPromise;
}

// Read only the TrueType metrics and BMP character map needed by this report.
// The complete original font is embedded, so all viewers use the same glyphs.
function readFont(font) {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = {};
  if (font.length < 100 || view.getUint32(0) !== 0x00010000) throw new Error('Érvénytelen PDF-betűtípus.');
  for (let index = 0; index < view.getUint16(4); index++) {
    const offset = 12 + index * 16;
    const tag = String.fromCharCode(...font.subarray(offset, offset + 4));
    tables[tag] = view.getUint32(offset + 8);
  }
  const units = view.getUint16(tables.head + 18);
  const scale = (value) => Math.round(value / units * 1000);
  const metricCount = view.getUint16(tables.hhea + 34);
  let cmap;
  for (let index = 0; index < view.getUint16(tables.cmap + 2); index++) {
    const offset = tables.cmap + 4 + index * 8;
    const candidate = tables.cmap + view.getUint32(offset + 4);
    if (view.getUint16(candidate) === 4) cmap = candidate;
  }
  if (!cmap) throw new Error('A PDF-betűtípus karaktertáblája hiányzik.');
  const segments = view.getUint16(cmap + 6) / 2;
  const ends = cmap + 14, starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2, ranges = deltas + segments * 2;
  function glyph(code) {
    for (let index = 0; index < segments; index++) {
      if (code > view.getUint16(ends + index * 2)) continue;
      if (code < view.getUint16(starts + index * 2)) return 0;
      const delta = view.getInt16(deltas + index * 2);
      const range = view.getUint16(ranges + index * 2);
      if (!range) return (code + delta) & 0xFFFF;
      const found = view.getUint16(ranges + index * 2 + range + (code - view.getUint16(starts + index * 2)) * 2);
      return found ? (found + delta) & 0xFFFF : 0;
    }
    return 0;
  }
  return {
    glyph,
    width: (id) => scale(view.getUint16(tables.hmtx + Math.min(id, metricCount - 1) * 4)),
    ascent: scale(view.getInt16(tables.hhea + 4)), descent: scale(view.getInt16(tables.hhea + 6)),
    box: [36, 38, 40, 42].map((offset) => scale(view.getInt16(tables.head + offset))),
  };
}

function makePdf(objects) {
  const parts = [bytes('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = bytes(`${index + 1} 0 obj\n`), suffix = bytes('\nendobj\n');
    const content = typeof object === 'string' ? bytes(object) : object;
    parts.push(prefix, content, suffix); length += prefix.length + content.length + suffix.length;
  });
  parts.push(bytes(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 11 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return new Blob(parts, { type: 'application/pdf' });
}
function stream(content, attributes = '') {
  const data = typeof content === 'string' ? bytes(content) : content;
  return new Uint8Array([...bytes(`<< /Length ${data.length}${attributes} >>\nstream\n`), ...data, ...bytes('\nendstream')]);
}

/** A single searchable A4 PDF. `fontBytes` is an optional offline/test injection. */
export async function generateHealthPdf({ sunday, days = [], body = null }, { fontBytes } = {}) {
  const dates = weekDates(sunday);
  const entries = new Map(days.filter((day) => dates.includes(day.date)).map((day) => [day.date, day]));
  for (const day of entries.values()) {
    if (fields.some((field) => typeof day[field] !== 'number' || !Number.isFinite(day[field]) || day[field] < 0)) {
      throw new Error('A PDF-hez csak érvényes, mentett napi adatok használhatók.');
    }
  }
  if (body && (body.date !== sunday || ['weight', 'waist', 'neck'].some((field) => typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] <= 0))) {
    throw new Error('A heti mérés adatai nem megfelelőek.');
  }
  const font = fontBytes ? new Uint8Array(fontBytes) : await loadFont();
  const metrics = readFont(font);
  const chars = new Map();
  const commands = [];
  const text = (value, x, y, size = 10, color = '0.12 0.15 0.12', align = 'left') => {
    const content = String(value);
    let width = 0, encoded = '';
    for (const character of content) {
      if (!chars.has(character)) {
        const glyph = metrics.glyph(character.codePointAt(0));
        if (!glyph) throw new Error('A PDF nem támogatott karaktert tartalmaz.');
        chars.set(character, { id: chars.size + 1, glyph, width: metrics.width(glyph) });
      }
      const item = chars.get(character); width += item.width / 1000 * size; encoded += hex(item.id);
    }
    const left = x - (align === 'right' ? width : align === 'center' ? width / 2 : 0);
    commands.push(`BT /F1 ${size} Tf ${color} rg 1 0 0 1 ${left.toFixed(2)} ${y} Tm <${encoded}> Tj ET`);
  };
  const rect = (x, y, width, height, color) => commands.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
  rect(42, 772, 511, 3, '0.77 0.96 0.42');
  text('ERŐNAPLÓ', 42, 791, 23);
  text('Heti táplálkozási és testméretnapló', 42, 747, 16);
  text(`${dateLabel(dates[0])} – ${dateLabel(sunday)}`, 42, 723, 11);
  text('A YAZIO-ból feljegyzett napi értékek; nincs étel- vagy kalóriaszámítás.', 42, 701, 9, '0.36 0.4 0.36');

  const right = [274, 363, 452, 541];
  rect(42, 624, 511, 36, '0.91 0.96 0.85');
  text('Nap', 54, 640, 10);
  ['Kalória (kcal)', 'Fehérje (g)', 'Szénhidrát (g)', 'Zsír (g)'].forEach((label, index) => text(label, right[index], 640, 9, undefined, 'right'));
  let y = 624;
  dates.forEach((date, index) => {
    y -= 34;
    rect(42, y, 511, 34, index % 2 ? '0.96 0.97 0.96' : '0.99 0.99 0.99');
    text(`${weekdays[index]} · ${dateLabel(date)}`, 54, y + 13, 9);
    fields.forEach((field, column) => text(entries.has(date) ? number(entries.get(date)[field]) : '—', right[column], y + 13, 10, undefined, 'right'));
  });
  const count = entries.size;
  const totals = Object.fromEntries(fields.map((field) => [field, [...entries.values()].reduce((sum, day) => sum + day[field], 0)]));
  ['Heti összesen', 'Napi átlag'].forEach((label, index) => {
    y -= 30;
    rect(42, y, 511, 30, index ? '0.96 0.97 0.96' : '0.91 0.96 0.85');
    text(label, 54, y + 11, 10);
    fields.forEach((field, column) => text(count ? number(totals[field] / (index ? count : 1)) : '—', right[column], y + 11, 10, undefined, 'right'));
  });
  text(`Naplózott napok: ${count} / 7. Az átlag csak a rögzített napokból készül.`, 42, 307, 9, '0.36 0.4 0.36');
  text('A — jel hiányzó adatot jelent, nem nulla bevitelt.', 42, 291, 9, '0.36 0.4 0.36');

  text('Vasárnapi testméretek', 42, 255, 14);
  text(`Mérés napja: ${dateLabel(sunday)}${body ? '' : ' · Még nincs rögzítve'}`, 42, 236, 9, '0.36 0.4 0.36');
  [['Testsúly', 'weight', 'kg'], ['Derékbőség', 'waist', 'cm'], ['Nyakkörfogat', 'neck', 'cm']].forEach(([label, field, unit], index) => {
    const x = 42 + index * 175;
    rect(x, 155, 161, 66, '0.96 0.97 0.96');
    text(label, x + 12, 201, 10);
    text(body ? `${number(body[field])} ${unit}` : '—', x + 12, 175, 17);
  });
  text('A derék és a nyak mérőszalaggal mért körfogata cm-ben.', 42, 132, 9, '0.36 0.4 0.36');
  text('Saját heti napló; a rögzített adatok bármikor visszanézhetők és javíthatók.', 42, 104, 9, '0.36 0.4 0.36');
  text('Erőnapló · Heti összesítő', 42, 42, 8, '0.36 0.4 0.36');
  text('1 / 1', 553, 42, 8, '0.36 0.4 0.36', 'right');

  const mapping = [...chars.entries()];
  const cidMap = new Uint8Array((mapping.length + 1) * 2);
  mapping.forEach(([, item]) => { cidMap[item.id * 2] = item.glyph >> 8; cidMap[item.id * 2 + 1] = item.glyph & 255; });
  const unicode = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /EronaploUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${mapping.length} beginbfchar\n${mapping.map(([character, item]) => `<${hex(item.id)}> <${hex(character.codePointAt(0))}>`).join('\n')}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  return makePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    stream(commands.join('\n')),
    '<< /Type /Font /Subtype /Type0 /BaseFont /NotoSans-Regular /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 10 0 R >>',
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSans-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /CIDToGIDMap 9 0 R /W [1 [${mapping.map(([, item]) => item.width).join(' ')}]] >>`,
    `<< /Type /FontDescriptor /FontName /NotoSans-Regular /Flags 32 /FontBBox [${metrics.box.join(' ')}] /ItalicAngle 0 /Ascent ${metrics.ascent} /Descent ${metrics.descent} /CapHeight ${metrics.ascent} /StemV 80 /FontFile2 8 0 R >>`,
    stream(font, ` /Length1 ${font.length}`),
    stream(cidMap), stream(unicode),
    `<< /Title <FEFF${[...'Erőnapló – Heti napló'].map((character) => hex(character.codePointAt(0))).join('')}> /Creator (Eronaplo) >>`,
  ]);
}
