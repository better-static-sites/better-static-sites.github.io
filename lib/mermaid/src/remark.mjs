/**
 * Remark plugins for mermaid SSR.
 *
 * remarkMermaidSSR  — renders ```mermaid blocks to inline SVG at build time using
 *                     svgdom as a headless browser shim. Diagrams that fail are
 *                     left as fenced code blocks.
 *
 * mermaidTitleFix   — reads `title="..."` from mermaid code block meta and emits
 *                     a <p data-title-bottom> node below the diagram. Non-mermaid
 *                     blocks are left alone; rehypeCodeBlocks handles their titles.
 *
 * The rendering itself lives in core.mjs, shared with the Sätteri plugins.
 */

import { visit } from 'unist-util-visit';
import { createRenderer, metaTitle, titleNode, wrap } from './core.mjs';

/**
 * Remark plugin factory. Options:
 *   theme         — mermaid theme (default: 'default')
 *   securityLevel — mermaid securityLevel (default: 'loose')
 *   cache         — cache rendered diagrams on disk (default: true)
 *   cacheDir      — cache location (default: node_modules/.cache/astro-better-mermaid)
 *   lightbox      -- open each diagram in an enlarged dialog on click (default: false)
 */
export function remarkMermaidSSR(options = {}) {
  const render = createRenderer(options);
  const { lightbox = false } = options;

  return async (tree, file) => {
    const nodes = [];
    visit(tree, 'code', (node) => {
      if (node.lang === 'mermaid') nodes.push(node);
    });

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const svg = await render(node.value, i, file?.path);
      if (!svg) continue;
      node.type  = 'html';
      node.value = wrap(node.value, svg, { lightbox, title: metaTitle(node.meta) });
      delete node.lang;
      delete node.meta;
    }
  };
}

/**
 * Remark plugin: reads `title="..."` from mermaid code block meta and emits a
 * <p data-title-bottom> element AFTER (below) the diagram.
 * Non-mermaid blocks are left alone -- rehypeCodeBlocks handles their titles.
 */
export function mermaidTitleFix() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid') return;
      const title = titleNode(node.meta);
      if (!title) return;
      parent.children.splice(index + 1, 0, title);
      return index + 2;
    });
  };
}
