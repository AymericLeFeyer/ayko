// Starts the production Display server in front of the e2e Core.
Object.assign(process.env, {
  AYKO_DISPLAY_PORT: '3111',
  AYKO_CORE_URL: 'http://localhost:3110',
});

await import('../apps/display/server/server.mjs');
