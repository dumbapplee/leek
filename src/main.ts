import { loadConfig } from './config.js';
import { recoverRunningJobs } from './imports/importJobs.js';
import { createServices } from './services.js';
import { createApp } from './server.js';

const config = loadConfig();
const services = createServices(config);

recoverRunningJobs(services.db, Date.now());
services.importWorker.kick();

setInterval(() => {
  services.publishOutbox().catch((error: unknown) => {
    console.error('outbox publish failed', error);
  });
}, 1000);

createApp(services).listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);
});

