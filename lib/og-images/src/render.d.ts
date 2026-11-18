import type { OgImageColors, WordmarkSegment } from '../index.js';

export declare const WIDTH: 1200;
export declare const HEIGHT: 630;
export declare const DEFAULT_FONT: URL;
export declare const DEFAULT_COLORS: Required<OgImageColors>;

export interface CardJob {
  title: string;
  label?: string;
}

export interface RendererOptions {
  font?: string | URL;
  colors?: OgImageColors;
  logo?: string;
  wordmark?: string | WordmarkSegment[];
  footer?: string;
}

export interface Renderer {
  cardSvg(job: CardJob): string;
  renderCard(job: CardJob): Promise<Buffer>;
  renderCopy(sourcePath: string): Promise<Buffer>;
}

export declare function createRenderer(options?: RendererOptions): Renderer;
