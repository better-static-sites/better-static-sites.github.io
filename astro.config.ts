import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import tocSmol from 'astro-toc-smol';
import linkChecker from 'astro-link-checker';
import genMarkdownPages from 'astro-gen-markdown-pages';
import astroRefs from 'astro-refs';
import mermaidSSR from 'astro-mermaid-renderer-cli-smol';
import { rehypeCodeBlocks, remarkShellSession } from 'astro-better-code-blocks';
import { unified } from '@astrojs/markdown-remark';
import { remarkMermaidSSR, mermaidTitleFix } from 'astro-mermaid-renderer-cli-smol';

const markdownProcessor = unified({
  remarkPlugins: [mermaidTitleFix, remarkMermaidSSR, remarkShellSession],
  rehypePlugins: [[rehypeCodeBlocks, { excludeLangs: ['mermaid'] }]],
});

export default defineConfig({
  site: 'https://lambdalatitudinarians.org',
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
      collections: [{ src: 'src/content/docs', base: '/docs' }],
    }),
    genMarkdownPages({
      llmsTxtTitle: 'Better Static Sites docs',
      llmsTxtDescription: 'Documentation for the Better Static Sites (astro-better-*) family of Astro integrations and components.',
      trimTitleSuffix: ' | Better Static Sites',
    }),
    linkChecker({ failOnBrokenLinks: false }),
  ],
  vite: {
    plugins: [
      tailwindcss(),
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
