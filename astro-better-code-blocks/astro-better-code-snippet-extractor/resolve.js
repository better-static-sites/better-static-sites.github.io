import fs from 'node:fs';
import path from 'node:path';

/**
 * Picks the file an <ExtractedCode src> renders. Snippets and whole files both come from the
 * generated output, where Bluehawk has already removed its markup. A whole file the integration
 * skipped (an ignored pattern such as package.json) falls back to the raw source file.
 *
 * @param {string} src - the component's src prop
 * @param {string} snippetRoot - the integration's outputDir
 * @param {string} sourceRoot - the integration's sourceDir
 * @returns {string} absolute path of the file to render
 */
export function resolveExtractedCodePath(src, snippetRoot, sourceRoot) {
  const generated = path.join(snippetRoot, src);
  if (src.includes('.snippet.') || fs.existsSync(generated)) return generated;
  return path.join(sourceRoot, src);
}
