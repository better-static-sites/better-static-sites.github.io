import type { AstroIntegration } from 'astro';

export interface OgImageColors {
  background?: string;
  wordmark?: string;
  label?: string;
  title?: string;
  footer?: string;
  /** `false` hides the accent bar */
  bar?: string | false;
}

export interface WordmarkSegment {
  text: string;
  /** defaults to `colors.wordmark` */
  color?: string;
}

export interface OgImagesOptions {
  /** URL prefix for generated images. Default: `'/og'` */
  route?: string;
  /** prefix for the generated alt text, and the default wordmark */
  siteName?: string;
  /** text next to the logo, or segments for a multi-color wordmark. Default: `siteName` */
  wordmark?: string | WordmarkSegment[];
  /** SVG markup for the logo, drawn at 64x64 */
  logo?: string;
  /** small text at the bottom, such as the site's domain */
  footer?: string;
  /** TTF, OTF, or WOFF file, relative to the project root. Default: Inter Bold */
  font?: string | URL;
  colors?: OgImageColors;
  /** Default: `node_modules/.cache/astro-better-og-images` */
  cacheDir?: string;
}

export default function ogImages(options?: OgImagesOptions): AstroIntegration;
