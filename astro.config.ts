import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import tocSmol from 'astro-toc-smol';
import genMarkdownPages from 'astro-gen-markdown-pages';
import astroRefs, { remarkAstroRef } from 'astro-refs';
import { rehypeCodeBlocks, remarkShellSession } from 'astro-better-code-blocks';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { unified } from '@astrojs/markdown-remark';
import { remarkMermaidSSR, mermaidTitleFix } from 'astro-mermaid-renderer-cli-smol';

const refsState = { refMap: null as any, brokenRefs: [] as string[], duplicates: [] as any[] };

const markdownProcessor = unified({
  remarkPlugins: [mermaidTitleFix, remarkMermaidSSR, remarkShellSession, [remarkAstroRef, { state: refsState }]],
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
    tocSmol({ articleSelector: ['article.prose', 'main'] }),
    astroRefs({
      collections: [{ src: 'src/content/', base: '/' }],
      state: refsState,
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
