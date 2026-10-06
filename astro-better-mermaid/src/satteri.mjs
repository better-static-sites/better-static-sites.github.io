/**
 * Sätteri mdast plugins for mermaid SSR. Same output as the unified
 * `remarkMermaidSSR` and `mermaidTitleFix`; rendering lives in core.mjs.
 *
 *   import { satteri } from '@astrojs/markdown-satteri';
 *   import { mermaidTitle, mermaidSSR } from 'astro-better-mermaid/satteri';
 *
 *   satteri({ mdastPlugins: [mermaidTitle(), mermaidSSR()] });
 *
 * Put mermaidTitle first, as with the unified plugins.
 *
 * In MDX the SVG reaches the page through Astro's `set:html`, so these plugins
 * target Astro's JSX runtime.
 */

import { createRenderer, titleNode, wrap } from './core.mjs';

/**
 * Render ```mermaid blocks to inline SVG. Options match remarkMermaidSSR:
 * theme, securityLevel, cache, cacheDir.
 */
export function mermaidSSR(options = {}) {
  const render = createRenderer(options);

  // a factory runs once per document, which gives each document its own diagram index
  return () => {
    let index = 0;
    return {
      name: 'astro-better-mermaid:ssr',
      async code(node, ctx) {
        if (node.lang !== 'mermaid') return;
        const svg = await render(node.value, index++);
        if (!svg) return;
        if (ctx.sourceFormat !== 'mdx') return { type: 'html', value: wrap(node.value, svg) };
        // one set:html string; parsing the svg into jsx costs ~30ms a diagram
        return {
          type: 'mdxJsxFlowElement',
          name: 'div',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'class', value: 'mermaid' },
            { type: 'mdxJsxAttribute', name: 'data-processed', value: 'true' },
            { type: 'mdxJsxAttribute', name: 'data-mermaid-src', value: node.value },
            { type: 'mdxJsxAttribute', name: 'set:html', value: `\n${svg}\n` },
          ],
          children: [],
        };
      },
    };
  };
}

/** Emit a <p data-title-bottom> below mermaid blocks that have title="..." meta. */
export function mermaidTitle() {
  return {
    name: 'astro-better-mermaid:title',
    code(node, ctx) {
      if (node.lang !== 'mermaid') return;
      const title = titleNode(node.meta);
      if (title) ctx.insertAfter(node, title);
    },
  };
}
