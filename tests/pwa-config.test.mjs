import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBasePath } from '../scripts/base-path.mjs';

test('local builds use the root path', () => assert.equal(resolveBasePath({}), '/'));
test('repository Pages builds use the repository path', () => assert.equal(resolveBasePath({ GITHUB_REPOSITORY: 'someone/eronaplo' }), '/eronaplo/'));
test('account Pages builds use the root path', () => assert.equal(resolveBasePath({ GITHUB_REPOSITORY: 'someone/someone.github.io' }), '/'));
test('a different account name is still a project repository', () => assert.equal(resolveBasePath({ GITHUB_REPOSITORY: 'someone/another.github.io' }), '/another.github.io/'));
test('a custom domain overrides a repository base', () => assert.equal(resolveBasePath({ GITHUB_REPOSITORY: 'someone/eronaplo', VITE_BASE_PATH: '/' }), '/'));
test('malformed base paths fail before building broken URLs', () => {
  for (const value of ['eronaplo', '/eronaplo', 'https://example.com/', '//evil/', '/#/', '/../', '/app/./']) {
    assert.throws(() => resolveBasePath({ VITE_BASE_PATH: value }));
  }
});
