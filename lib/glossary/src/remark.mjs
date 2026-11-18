/**
 * remark plugin for astro-better-glossary, for the unified pipeline. Same
 * transform as the Sätteri plugin.
 *
 *   import { remarkGlossaryTerms } from 'astro-better-glossary/remark';
 *   remarkPlugins: [[remarkGlossaryTerms, glossaryOptions]]
 */

import path from 'node:path';
import process from 'node:process';
import { visitParents } from 'unist-util-visit-parents';
import { COMPONENT_NAME, COMPONENT_PATH, loadGlossary } from './core.mjs';
import { FORBIDDEN_PARENTS, forbiddenParentMessage, splitTerms } from './terms.mjs';

// MDX compiles ESM from estree, so an injected import needs one
const importNode = () => ({
  type: 'mdxjsEsm',
  value: `import ${COMPONENT_NAME} from '${COMPONENT_PATH}';`,
  data: {
    estree: {
      type: 'Program',
      sourceType: 'module',
      body: [{
        type: 'ImportDeclaration',
        specifiers: [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: COMPONENT_NAME } }],
        source: { type: 'Literal', value: COMPONENT_PATH, raw: `'${COMPONENT_PATH}'` },
      }],
    },
  },
});

export function remarkGlossaryTerms(options) {
  const glossary = loadGlossary(options);
  return (tree, file) => {
    // only MDX can hold the component; plain markdown keeps the brackets
    if (file.extname && file.extname !== '.mdx') return;
    let used = false;
    const replacements = [];
    visitParents(tree, 'text', (node, ancestors) => {
      if (!node.value.includes('[[')) return;
      const fail = (snippet, msg) => {
        const name = file.path ? path.relative(process.cwd(), file.path) : '<unknown file>';
        throw new Error(`[astro-better-glossary] ${name}:${node.position?.start.line ?? '?'}: ${snippet}\n\n${msg}\n`);
      };
      const forbidden = ancestors.find(a => FORBIDDEN_PARENTS.has(a.type));
      if (forbidden) fail(node.value, forbiddenParentMessage(forbidden.type));
      const out = splitTerms(node.value, glossary, fail, options.help);
      if (out) replacements.push({ parent: ancestors[ancestors.length - 1], node, out });
    });
    for (const { parent, node, out } of replacements) {
      parent.children.splice(parent.children.indexOf(node), 1, ...out);
      used = true;
    }
    if (used) tree.children.unshift(importNode());
  };
}
