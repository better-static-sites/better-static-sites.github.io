export interface GetOgImageOptions {
  /** the page title, without a site suffix */
  title: string;
  /** text above the title, such as the section name */
  label?: string;
  /** path in public/ to the page's own image; an absolute URL is used as is */
  source?: string;
  /** alt text; the default describes the card */
  alt?: string;
}

export interface OgImage {
  /** root-relative, or the absolute `source` URL */
  url: string;
  alt: string;
  /** absent when `source` is an absolute URL */
  type?: 'image/png' | 'image/jpeg';
  width?: number;
  height?: number;
}

export declare const STATE_KEY: unique symbol;

export declare function getOgImage(options: GetOgImageOptions): Promise<OgImage>;
