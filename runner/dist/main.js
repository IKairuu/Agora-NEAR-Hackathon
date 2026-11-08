import { config } from './config.js';
import { createServer } from './server.js';
createServer().listen(config.port, () => {
    console.log(`runner listening on :${config.port} with image ${config.image}`);
});
