import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('public/favicon.svg', root));
const directory = new URL('public/icons/', root);
await mkdir(directory, { recursive: true });
await Promise.all([
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
].map(([name, size]) => sharp(source).resize(size, size).flatten({ background: '#111412' }).png().toFile(fileURLToPath(new URL(name, directory)))));

// Maskable icons need an opaque background and all important detail inside
// the central 80% safe zone; the existing mark is reduced a little further.
const mark = await sharp(source).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#111412' } })
  .composite([{ input: mark, left: 51, top: 51 }])
  .png()
  .toFile(fileURLToPath(new URL('maskable-512.png', directory)));
console.log('Generated 192px, 512px, maskable and Apple touch icons.');
