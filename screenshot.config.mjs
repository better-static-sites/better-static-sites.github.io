export default {
  baseUrl: 'http://localhost:4000',
  outputDir: 'public/img/screenshots',

  window: { width: 1200, height: 800 },

  chrome: {
    style:    'golden-gate',
    renderIn: 'css',
    showUrl:  true,
    theme:    'light',
    baseUrl:  'https://better-static-sites.github.io',
  },

  docker: {
    compose: 'screenshots/docker-compose.yml',
    service: 'bss-docs',
    healthcheck: {
      url:      'http://localhost:4000/',
      timeout:  60000,
      interval: 3000,
    },
  },
};
