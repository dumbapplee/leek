import { loadConfig } from './config.js';
import { createApp } from './server.js';

const config = loadConfig();

createApp().listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);
});
