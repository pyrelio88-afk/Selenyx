const PUBLIC_PROTOCOLS = new Set(['https:']);
const BROWSER_PROTOCOLS = new Set(['https:', 'http:']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseUrl(value, field = 'url') {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} is required`);
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError(`${field} is not a valid absolute URL`);
  }
  if (url.username || url.password) throw new TypeError(`${field} must not contain credentials`);
  return url;
}

function validateBrowserUrl(value) {
  const url = parseUrl(value);
  if (!BROWSER_PROTOCOLS.has(url.protocol)) throw new TypeError(`unsupported browser protocol: ${url.protocol}`);
  return url.toString();
}

function validateExternalUrl(value) {
  return validateBrowserUrl(value);
}

function validateProviderBaseUrl(value, { allowInsecureLocal = true } = {}) {
  const url = parseUrl(value, 'baseUrl');
  const localHttp = allowInsecureLocal && url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (!PUBLIC_PROTOCOLS.has(url.protocol) && !localHttp) {
    throw new TypeError('baseUrl must use HTTPS; HTTP is allowed only for localhost');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/, '');
}

function joinApiPath(baseUrl, apiPath) {
  const base = validateProviderBaseUrl(baseUrl);
  return `${base}/${String(apiPath ?? '').replace(/^\/+/, '')}`;
}

export {
  PUBLIC_PROTOCOLS, BROWSER_PROTOCOLS, LOCAL_HOSTS, parseUrl, validateBrowserUrl,
  validateExternalUrl, validateProviderBaseUrl, joinApiPath,
};
