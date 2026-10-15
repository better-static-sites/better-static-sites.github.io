// composes a macOS Safari-style window chrome around a screenshot buffer.
// everything is generated programmatically via sharp + SVG -- no PNG templates.

import sharp from 'sharp';

const WINDOW_RADIUS = 10;
const CHROME_HEIGHT = 52;
const TL_CY = 26;
const TL_X0 = 18;
const TL_R = 7;
const TL_GAP = 9;
const URL_BAR_H = 28;
const URL_BAR_Y = (CHROME_HEIGHT - URL_BAR_H) / 2;  // vertically centered
const URL_BAR_X = 100;
const URL_BAR_X_MARGIN_R = 20;
const URL_BAR_RADIUS = 5;

/**
 * Applies the window chrome the config asks for, or returns the buffer untouched.
 *
 * Both CLIs must decide this identically. With renderIn: 'css' the Screenshot
 * component already draws the frame inside the page, so compositing here would add a
 * second frame and change the image's dimensions. check-screenshots used to miss that
 * condition and reported every image as 100% changed against a correct reference.
 * `show` is the screenshot's own chrome setting, false for a cropped screenshot by default.
 */
export async function applyChrome(screenshotBuffer, config, url, show = true) {
  const { chrome } = config;
  if (!show || chrome.style === 'none' || chrome.renderIn === 'css') return screenshotBuffer;
  return addChrome(screenshotBuffer, {
    url,
    dark: chrome.theme === 'dark',
    showUrl: chrome.showUrl,
    shadowBlur: chrome.shadowBlur,
    shadowPadding: chrome.shadowPadding,
  });
}

export async function addChrome(screenshotBuffer, opts = {}) {
  const {
    url = '',
    dark = false,
    showUrl = true,
    shadowBlur = 40,
    shadowPadding = 48,
  } = opts;

  const pageImg = sharp(screenshotBuffer);
  const { width: pageWidth, height: pageHeight } = await pageImg.metadata();

  const chromeHeight = showUrl ? CHROME_HEIGHT : Math.floor(CHROME_HEIGHT * 0.6);
  const totalWidth = pageWidth + (shadowBlur > 0 ? shadowPadding * 2 : 0);
  const totalHeight = pageHeight + chromeHeight + (shadowBlur > 0 ? shadowPadding * 2 : 0);

  const windowX = shadowBlur > 0 ? shadowPadding : 0;
  const windowY = shadowBlur > 0 ? shadowPadding : 0;
  const windowWidth = pageWidth;
  const windowHeight = pageHeight + chromeHeight;

  const chromeSvg = buildChromeSvg({ windowWidth, chromeHeight, dark, showUrl, url });

  const chromeBuf = await sharp(Buffer.from(chromeSvg))
    .resize(windowWidth, chromeHeight)
    .png()
    .toBuffer();

  // round the bottom corners of the page to match the window border radius
  const cornerMask = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}">
    <path d="M 0,0 H ${pageWidth} V ${pageHeight - WINDOW_RADIUS}
      Q ${pageWidth},${pageHeight} ${pageWidth - WINDOW_RADIUS},${pageHeight}
      H ${WINDOW_RADIUS} Q 0,${pageHeight} 0,${pageHeight - WINDOW_RADIUS} Z"
      fill="white"/>
  </svg>`;
  const maskedPage = await sharp(screenshotBuffer)
    .composite([{ input: Buffer.from(cornerMask), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const layers = [];

  if (shadowBlur > 0) {
    const shadowSvg = buildShadowSvg({
      totalWidth, totalHeight, windowX, windowY,
      windowWidth, windowHeight, shadowBlur,
    });
    const shadowBuf = await sharp(Buffer.from(shadowSvg))
      .resize(totalWidth, totalHeight)
      .png()
      .toBuffer();
    layers.push({ input: shadowBuf, top: 0, left: 0 });
  }

  layers.push({ input: maskedPage, top: windowY + chromeHeight, left: windowX });
  layers.push({ input: chromeBuf, top: windowY, left: windowX });

  const base = {
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  };

  return sharp(base).composite(layers).png().toBuffer();
}

function buildChromeSvg({ windowWidth, chromeHeight, dark, showUrl, url }) {
  const bg        = dark ? '#323232' : '#e8e8e8';
  const bgBottom  = dark ? '#2c2c2c' : '#dcdcdc';
  const urlBarBg  = dark ? '#454547' : '#ffffff';
  const urlBorder = dark ? '#5a5a5c' : '#cacaca';
  const urlText   = dark ? '#f0f0f0' : '#111111';
  const separator = dark ? '#1a1a1a' : '#b8b8b8';

  const tlColors = ['#ff5f57', '#febc2e', '#28c840'];
  const lights = tlColors.map((color, i) => {
    const cx = TL_X0 + i * (TL_R * 2 + TL_GAP);
    return `<circle cx="${cx}" cy="${TL_CY}" r="${TL_R}" fill="${color}"/>`;
  }).join('\n    ');

  let urlBar = '';
  if (showUrl) {
    const barX = URL_BAR_X;
    const barY = URL_BAR_Y;
    const barW = windowWidth - URL_BAR_X - URL_BAR_X_MARGIN_R;
    const displayUrl = url.length > 90 ? url.slice(0, 87) + '...' : url;
    urlBar = `
    <rect x="${barX}" y="${barY}" width="${barW}" height="${URL_BAR_H}"
      rx="${URL_BAR_RADIUS}" fill="${urlBarBg}" stroke="${urlBorder}" stroke-width="1"/>
    <text
      x="${barX + barW / 2}"
      y="${barY + URL_BAR_H / 2 + 5}"
      text-anchor="middle"
      font-family="Arial, sans-serif"
      font-size="13"
      fill="${urlText}"
    >${escapeXml(displayUrl)}</text>`;
  }

  // gradient: slightly lighter top, slightly darker bottom
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${windowWidth}" height="${chromeHeight}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bgBottom}"/>
    </linearGradient>
  </defs>
  <rect width="${windowWidth}" height="${chromeHeight}" fill="url(#bg)" rx="${WINDOW_RADIUS}" ry="${WINDOW_RADIUS}"/>
  <rect x="0" y="${chromeHeight - WINDOW_RADIUS}" width="${windowWidth}" height="${WINDOW_RADIUS}" fill="${bgBottom}"/>
  <line x1="0" y1="${chromeHeight - 0.5}" x2="${windowWidth}" y2="${chromeHeight - 0.5}"
    stroke="${separator}" stroke-width="1"/>
  ${lights}
  ${urlBar}
</svg>`;
}

function buildShadowSvg({ totalWidth, totalHeight, windowX, windowY, windowWidth, windowHeight, shadowBlur }) {
  const halfBlur = shadowBlur / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}">
  <defs>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow
        dx="0" dy="${halfBlur / 2}"
        stdDeviation="${halfBlur}"
        flood-color="rgba(0,0,0,0.35)"
      />
    </filter>
  </defs>
  <rect
    x="${windowX}" y="${windowY}"
    width="${windowWidth}" height="${windowHeight}"
    rx="${WINDOW_RADIUS}" ry="${WINDOW_RADIUS}"
    fill="white"
    filter="url(#shadow)"
  />
</svg>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
