/**
 * astro-mermaid-ssr
 *
 * Astro integration + remark plugins for server-side mermaid diagram rendering.
 * No client-side JavaScript required — diagrams are pre-rendered to SVG at build time.
 *
 * Usage (astro.config.ts):
 *
 *   import mermaidSSR from 'astro-mermaid-ssr';
 *   export default defineConfig({
 *     integrations: [mermaidSSR()],
 *   });
 *
 * Options:
 *   titleFix     {boolean}  — Include the title="..." remark plugin (default: true)
 *   injectCSS    {boolean}  — Auto-inject default styles (default: true)
 *   theme        {string}   — Mermaid theme, e.g. 'default', 'dark', 'neutral' (default: 'default')
 *   securityLevel {string}  — Mermaid securityLevel (default: 'loose')
 *   cache        {boolean}  — Cache rendered diagrams on disk (default: true)
 *   cacheDir     {string}   — Cache location (default: node_modules/.cache/astro-better-mermaid)
 *   lightbox     {boolean}  -- Open each diagram in an enlarged dialog on click (default: false)
 *
 * If injectCSS is false, import the styles yourself:
 *   import 'astro-mermaid-ssr/styles.css';
 *   import 'astro-better-lightbox/styles.css'; // with lightbox
 *
 * To use the remark plugins directly without the integration:
 *   import { remarkMermaidSSR, mermaidTitleFix } from 'astro-mermaid-ssr';
 *
 * Sätteri equivalents live at 'astro-better-mermaid/satteri'.
 */

import { fileURLToPath } from 'node:url';
import { remarkMermaidSSR, mermaidTitleFix } from './src/remark.mjs';
import { mermaidSSR, mermaidTitle } from './src/satteri.mjs';

export { remarkMermaidSSR, mermaidTitleFix };

const STYLES_PATH = fileURLToPath(new URL('./src/styles.css', import.meta.url));

export default function astroMermaidSSR(opts = {}) {
  const {
    titleFix = true,
    injectCSS = true,
    theme = 'default',
    securityLevel = 'loose',
    cache,
    cacheDir,
    lightbox = false,
  } = opts;

  return {
    name: 'astro-mermaid-ssr',
    hooks: {
      'astro:config:setup': ({ config, updateConfig, injectScript }) => {
        const renderOpts = { theme, securityLevel, cache, cacheDir, lightbox };
        const processor = config.markdown?.processor;
        // Sätteri processors keep their options mutable for integrations to extend
        const satteri = processor?.name === 'satteri';
        if (satteri) {
          processor.options.mdastPlugins.push(...(titleFix ? [mermaidTitle()] : []), mermaidSSR(renderOpts));
        }
        updateConfig({
          ...(satteri ? {} : {
            markdown: {
              remarkPlugins: [
                ...(titleFix ? [mermaidTitleFix] : []),
                [remarkMermaidSSR, renderOpts],
              ],
            },
          }),
          vite: {
            ssr: {
              // svgdom and mermaid are Node-only packages; they must not be bundled
              // into the client-side Vite output.
              external: ['svgdom', 'mermaid'],
            },
          },
        });

        if (injectCSS) {
          injectScript('page-ssr', `import ${JSON.stringify(STYLES_PATH)}`);
          if (lightbox) injectScript('page-ssr', `import 'astro-better-lightbox/styles.css'`);
        }
      },
    },
  };
}
