/**
 * astro-better-glossary
 *
 * A JSON glossary for Astro sites. Write [[term]] or [[term::label]] in MDX to
 * link a term to its page, with the definition in an accessible tooltip.
 * Render every entry with the <Glossary> component.
 *
 * Usage (astro.config.ts):
 *
 *   import glossary from 'astro-better-glossary';
 *   import { remarkGlossaryTerms } from 'astro-better-glossary/remark';
 *   // or: import { glossaryTerms } from 'astro-better-glossary/satteri';
 *
 *   const terms = { file: 'src/data/glossary.json', path: '/glossary' };
 *   const processor = unified({ remarkPlugins: [[remarkGlossaryTerms, terms]] });
 *
 *   export default defineConfig({
 *     markdown: { processor },
 *     integrations: [mdx({ processor }), glossary(terms)],
 *   });
 *
 * Options (shared by the integration and both plugins):
 *   file           path to the glossary JSON, relative to the project root (required)
 *   path           URL of the glossary page (required)
 *   fields         extra entry fields to allow, such as ['status']
 *   linkPattern    RegExp every entry link must match (default: root-relative or https)
 *   validateEntry  (id, entry) => error message or undefined
 *   help           a line appended to every build error, such as where your docs explain glossary terms
 */

import { fileURLToPath } from 'node:url';
import { loadGlossary } from './src/core.mjs';

export { loadGlossary } from './src/core.mjs';

const VIRTUAL_ID = 'virtual:astro-better-glossary';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export default function glossary(options) {
  return {
    name: 'astro-better-glossary',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        const root = fileURLToPath(config.root);
        // fail at startup on a broken glossary, not on the first page that uses it
        const { abs } = loadGlossary({ ...options, root });
        updateConfig({
          vite: {
            plugins: [{
              name: 'astro-better-glossary',
              resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
              load(id) {
                if (id !== RESOLVED_ID) return;
                this.addWatchFile(abs);
                const { entries, path } = loadGlossary({ ...options, root }, { fresh: true });
                return `export const entries = ${JSON.stringify(entries)};\nexport const path = ${JSON.stringify(path)};\n`;
              },
            }],
          },
        });
      },
    },
  };
}
