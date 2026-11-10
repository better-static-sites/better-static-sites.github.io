const ORIGIN_RE = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i;
const UUID_RE = /\b([\da-f]{8})-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi;

/**
 * Text for a screenshot's address bar.
 *
 * @param {string} url - the screenshot's url prop, a path or a full URL
 * @param {object} chrome - the config's chrome settings
 * @param {string} [configBaseUrl] - the config's baseUrl
 * @param {{ showHost?: boolean, showQuery?: boolean, showHash?: boolean, shortenIds?: boolean, maxLength?: number }} [overrides] - the screenshot's own settings
 */
export function displayUrl(url, chrome = {}, configBaseUrl = '', overrides = {}) {
  if (chrome.url) return chrome.url;
  const showHost = overrides.showHost ?? chrome.showHost ?? true;
  const showQuery = overrides.showQuery ?? chrome.showQuery ?? true;
  const showHash = overrides.showHash ?? chrome.showHash ?? true;
  const shortenIds = overrides.shortenIds ?? chrome.shortenIds ?? false;
  const { maxLength = 72 } = overrides;

  let shown = url;
  if (!showHost) {
    shown = shown.replace(ORIGIN_RE, '') || '/';
  } else if (chrome.baseUrl && shown.startsWith('/')) {
    shown = chrome.baseUrl.replace(/\/$/, '') + shown;
  } else if (chrome.baseUrl && configBaseUrl && shown.startsWith(configBaseUrl)) {
    shown = chrome.baseUrl.replace(/\/$/, '') + shown.slice(configBaseUrl.length);
  }
  if (!showHash) shown = shown.replace(/#.*/s, '');
  if (!showQuery) shown = shown.replace(/\?[^#]*/, '');
  if (shortenIds) shown = shown.replace(UUID_RE, '$1...');
  return shown.length > maxLength ? shown.slice(0, maxLength - 3) + '...' : shown;
}
