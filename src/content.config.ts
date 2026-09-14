import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    order: z.number().optional(),
    hidden: z.boolean().optional(),
    route: z.boolean().optional(),
    sidebar: z.object({
      label: z.string().optional(),
      folderBehavior: z.enum(['page', 'unclickable', 'overview']).optional(),
    }).optional(),
  }),
});

const releases = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/releases' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    version: z.string(),
    categories: z.array(z.string()).optional(),
  }),
});

export const collections = { docs, releases };
