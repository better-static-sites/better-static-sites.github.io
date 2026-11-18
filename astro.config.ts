import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import toc from 'astro-better-toc';
import genMarkdownPages from 'astro-better-gen-markdown-pages';
import astroRefs, { remarkAstroRef } from 'astro-better-refs';
import { rehypeCodeBlocks, remarkShellSession } from 'astro-better-code-blocks';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { unified } from '@astrojs/markdown-remark';
import { remarkMermaidSSR, mermaidTitleFix } from 'astro-better-mermaid';
import glossary from 'astro-better-glossary';
import { remarkGlossaryTerms } from 'astro-better-glossary/remark';
import ogImages from 'astro-better-og-images';

const glossaryTerms = { file: 'src/data/glossary.json', path: '/glossary' };

const refsState = { refMap: null as any, brokenRefs: [] as string[], duplicates: [] as any[] };

const markdownProcessor = unified({
  remarkPlugins: [mermaidTitleFix, remarkMermaidSSR, remarkShellSession, [remarkAstroRef, { state: refsState }], [remarkGlossaryTerms, glossaryTerms]],
  rehypePlugins: [
    rehypeSlug,
    [rehypeAutolinkHeadings, { behavior: 'append', properties: { className: ['anchor-link'], ariaHidden: 'true', tabIndex: -1 }, content: [] }],
    [rehypeCodeBlocks, { excludeLangs: ['mermaid'] }],
  ],
});

export default defineConfig({
  site: 'https://better-static-sites.github.io',
  base: '/',
  markdown: {
    processor: markdownProcessor,
  },
  integrations: [
    mdx({
      syntaxHighlight: false,
      processor: markdownProcessor,
    }),
    toc({ articleSelector: ['article.prose', 'main'] }),
    astroRefs({
      collections: [{ src: 'src/content/', base: '/' }],
      state: refsState,
    }),
    glossary(glossaryTerms),
    ogImages({
      siteName: 'Better Static Sites',
      footer: 'better-static-sites.github.io',
      colors: { background: '#0f0f0f', label: '#fb923c', bar: '#7c3aed' },
    }),
    genMarkdownPages({
      llmsTxtTitle: 'Better Static Sites docs',
      llmsTxtDescription: 'Documentation for the Better Static Sites (astro-better-*) family of Astro integrations and components.',
      trimTitleSuffix: ' | Better Static Sites',
    }),
  ],
  vite: {
    plugins: [
      tailwindcss(),
      // Screenshot.astro hardcodes `/${servePath}/` without the Astro base URL.
      // This transform patches the compiled output to use import.meta.env.BASE_URL.
      {
        name: 'screenshot-base-url',
        transform(code: string, id: string) {
          if (!id.includes('astro-better-declarative-screenshots')) return;
          if (!code.includes('servePath')) return;
          return {
            code: code.replace(
              /`\/\${servePath}\/\${name}\.png`/g,
              '`${import.meta.env.BASE_URL.replace(/\\/$/, "")}/${servePath}/${name}.png`'
            ),
            map: null,
          };
        },
      },
    ],
    ssr: {
      external: ['svgdom', 'mermaid'],
    },
    resolve: {
      alias: {
        tailwindcss: new URL('./node_modules/tailwindcss', import.meta.url).pathname,
      },
    },
  },
});
