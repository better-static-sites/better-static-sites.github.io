import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ base: './src/content/', pattern: [ '**/*.{md,mdx}', '!releases/**'] }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().optional(),
    hidden: z.boolean().optional(),
    route: z.boolean().optional(),
    version: z.string().optional(),
    versions: z.record(z.string()).optional(),
    badges: z.array(z.string()).optional(),
    sidebar: z.object({
      label: z.string().optional(),
      folderBehavior: z.enum(['page', 'unclickable', 'overview']).optional(),
    }).optional(),
  }),
});

const releases = defineCollection({
  loader: glob({ base: './src/content/releases', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    version: z.string(),
    categories: z.array(z.string()).optional(),
  }),
});

export const collections = { docs, releases };
