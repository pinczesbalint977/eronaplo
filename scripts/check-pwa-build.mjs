import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveBasePath } from './base-path.mjs';

const directory = path.resolve(process.argv[2] || 'dist');
const base = process.argv[3] || resolveBasePath();
const origin = 'https://example.github.io';
const manifestUrl = new URL(`${base}manifest.webmanifest`, origin);
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.webmanifest'), 'utf8'));
const html = await readFile(path.join(directory, 'index.html'), 'utf8');
const sw = await readFile(path.join(directory, 'sw.js'), 'utf8');

assert.equal(manifest.short_name, 'Erőnapló');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.lang, 'hu');
assert.equal(manifest.orientation, 'any');
for (const key of ['start_url', 'scope', 'id']) {
  assert.equal(new URL(manifest[key], manifestUrl).pathname, base, `${key} must use the repository base`);
}
assert.match(html, /viewport-fit=cover/);
assert.match(html, /apple-mobile-web-app-capable/);
assert.ok(sw.includes(JSON.stringify(`${base}index.html`)), 'Offline navigation must resolve under the repository base');
assert.ok(sw.includes('SKIP_WAITING'), 'Updates must support the explicit user action');
assert.doesNotMatch(sw, /https?:\/\//, 'The service worker must not import or cache external resources');

async function localAsset(url) {
  const asset = new URL(url, manifestUrl);
  assert.equal(asset.origin, origin, `External asset dependency: ${url}`);
  assert.ok(asset.pathname.startsWith(base), `Asset outside repository base: ${url}`);
  const relative = decodeURIComponent(asset.pathname.slice(base.length));
  assert.ok(relative && !relative.split('/').includes('..'));
  const filename = path.resolve(directory, relative);
  assert.ok(filename.startsWith(`${directory}${path.sep}`));
  await access(filename);
  return filename;
}

for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) await localAsset(match[1]);
for (const icon of manifest.icons) {
  const filename = await localAsset(icon.src);
  const png = await readFile(filename);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
}
assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));

for (const asset of await readdir(path.join(directory, 'assets'))) {
  if (asset.endsWith('.js') || asset.endsWith('.css')) assert.ok(sw.includes(`assets/${asset}`), `Asset missing from offline precache: ${asset}`);
  if (asset.endsWith('.css')) {
    const css = await readFile(path.join(directory, 'assets', asset), 'utf8');
    assert.doesNotMatch(css, /(?:@import\s|url\(\s*['"]?)https?:/i, 'Styles must not depend on external fonts or assets');
  }
}

console.log(`Verified standalone manifest, PNG dimensions, local assets and complete offline precache at ${base}.`);
