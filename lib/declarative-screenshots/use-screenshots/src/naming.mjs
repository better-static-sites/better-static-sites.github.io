// derives a filename from a URL path + an optional list of highlight selectors.
// the goal: human-readable, filesystem-safe, collision-resistant.
//
// /admin/group/add + selector #id  => admin-group-add-id.png
// /admin/group     + no selector   => admin-group.png
// /admin/group     + two calls     => admin-group.png, admin-group-1.png

/**
 * @param {string} url - the URL path, e.g. '/admin/group/add' or 'http://...'
 * @param {Array<{selector?: string}>} highlights - highlight configs
 * @param {Set<string>} used - filenames already claimed this run (mutated by this function)
 * @returns {string} filename without extension
 */
export function deriveName(url, highlights = [], used = new Set()) {
  const pathname = extractPath(url);
  const parts = slugifyPath(pathname);

  const selectorParts = highlights
    .map(h => h.selector)
    .filter(Boolean)
    .flatMap(sel => slugifySelector(sel))
    .filter(Boolean);

  const base = [...parts, ...selectorParts].filter(Boolean).join('-') || 'screenshot';

  // resolve collisions by appending -1, -2, ...
  let candidate = base;
  let counter = 0;
  while (used.has(candidate)) {
    counter++;
    candidate = `${base}-${counter}`;
  }

  used.add(candidate);
  return candidate;
}

function extractPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    // not a full URL, treat as path
    return url.split('?')[0].split('#')[0];
  }
}

function slugifyPath(pathname) {
  return pathname
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
    .map(segment =>
      segment
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean);
}

function slugifySelector(selector) {
  // turn '.group-name' => ['group-name']
  // turn '#id'         => ['id']
  // turn 'input[type="text"]' => ['input-type-text']
  // turn '.foo .bar'  => ['foo', 'bar']
  return selector
    .split(/\s+/)
    .map(part =>
      part
        .replace(/^[.#]/, '')
        .replace(/[\[\]"'=]/g, '-')
        .replace(/[^a-z0-9-]+/gi, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
    )
    .filter(Boolean);
}

/**
 * Color schemes a screenshot captures, each with its output name. 'both' captures
 * light under the plain name and dark under name.dark, which no derived name can collide with.
 * @param {string} name - screenshot name without extension
 * @param {'light'|'dark'|'both'} colorScheme
 * @returns {Array<{colorScheme: 'light'|'dark', name: string}>}
 */
export function colorSchemeVariants(name, colorScheme = 'light') {
  if (colorScheme !== 'both') return [{ colorScheme, name }];
  return [{ colorScheme: 'light', name }, { colorScheme: 'dark', name: `${name}.dark` }];
}
