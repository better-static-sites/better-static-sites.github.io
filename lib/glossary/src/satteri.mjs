/**
 * Sätteri mdast plugin for astro-better-glossary. Replaces [[term]] and
 * [[term::label]] in MDX text with the glossary term component, and imports the
 * component into each document that uses a term. Unknown terms, malformed
 * brackets, and terms inside headings or links fail the build.
 *
 *   import { glossaryTerms } from 'astro-better-glossary/satteri';
 *   satteri({ mdastPlugins: [glossaryTerms(glossaryOptions)] });
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { COMPONENT_NAME, COMPONENT_PATH, loadGlossary } from './core.mjs';
import { FORBIDDEN_PARENTS, forbiddenParentMessage, splitTerms } from './terms.mjs';

/** Same options as the integration, plus `help`: a line appended to every error. */
export function glossaryTerms(options) {
  const glossary = loadGlossary(options);
  // a factory runs once per document; skip documents that can't contain a term
  return ({ sourceFormat, source }) => {
    if (sourceFormat !== 'mdx' || !source.includes('[[')) return null;
    let used = false;
    return {
      name: 'astro-better-glossary',
      options: { position: true },
      text(node, ctx) {
        if (!node.value.includes('[[')) return;
        const fail = (snippet, msg) => {
          const file = ctx.fileURL ? path.relative(process.cwd(), fileURLToPath(ctx.fileURL)) : '<unknown file>';
          throw new Error(`[astro-better-glossary] ${file}:${node.position?.start.line ?? '?'}: ${snippet}\n\n${msg}\n`);
        };
        for (let p = ctx.parent(node); p; p = ctx.parent(p)) {
          if (FORBIDDEN_PARENTS.has(p.type)) fail(node.value, forbiddenParentMessage(p.type));
        }
        const out = splitTerms(node.value, glossary, fail, options.help);
        if (!out) return;
        used = true;
        ctx.replaceNode(node, out);
      },
      after(root, ctx) {
        if (used) ctx.prependChild(root, { raw: `import ${COMPONENT_NAME} from '${COMPONENT_PATH}';` });
      },
    };
  };
}
