import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUrl, validateBrowserUrl, validateExternalUrl, validateProviderBaseUrl, joinApiPath,
} from '../src/security/urlPolicy.js';

test('parseUrl accepts an absolute HTTPS URL', () => {
  assert.equal(parseUrl('https://example.org/path').hostname, 'example.org');
});

for (const value of ['', 'relative/path', 'not a url']) {
  test(`parseUrl rejects ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseUrl(value), /required|valid absolute/);
  });
}

test('parseUrl rejects embedded credentials', () => {
  assert.throws(() => parseUrl('https://user:pass@example.org'), /credentials/);
});

for (const protocol of ['file:', 'javascript:', 'data:', 'ftp:']) {
  test(`browser rejects ${protocol}`, () => {
    assert.throws(() => validateBrowserUrl(`${protocol}//example.org`), /unsupported browser protocol|valid absolute/);
  });
}

test('browser accepts arXiv HTTPS', () => {
  assert.equal(validateBrowserUrl('https://arxiv.org/abs/2401.00001'), 'https://arxiv.org/abs/2401.00001');
});

test('external URL uses the same protocol policy', () => {
  assert.throws(() => validateExternalUrl('javascript:alert(1)'), /unsupported/);
});

test('provider requires HTTPS for remote hosts', () => {
  assert.throws(() => validateProviderBaseUrl('http://api.example.org/v1'), /HTTPS/);
});

for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  test(`provider permits local HTTP at ${host}`, () => {
    assert.match(validateProviderBaseUrl(`http://${host}:11434/v1`), /^http:/);
  });
}

test('provider strips query, fragment, and trailing slash', () => {
  assert.equal(validateProviderBaseUrl('https://api.example.org/v1/?x=1#frag'), 'https://api.example.org/v1');
});

test('joinApiPath produces a normalized endpoint', () => {
  assert.equal(joinApiPath('https://api.example.org/v1/', '/models'), 'https://api.example.org/v1/models');
});
