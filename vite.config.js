import { defineConfig } from 'vite';
import pugPlugin from 'vite-plugin-pug';
import fs from 'fs';
import path from 'path';
import serverConfig from './src/config/server.js';

const isDev = process.env.NODE_ENV === 'development';
let httpsConfig = false;

if (isDev) {
  const keyPath = serverConfig.httpsOptions.key;
  const certPath = serverConfig.httpsOptions.cert;

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error(`
      [Vite HMR Error] Certificate files not found!
      Please ensure these files exist:
      - Key: ${path.resolve(keyPath)}
      - Cert: ${path.resolve(certPath)}
    `);
    process.exit(1);
  }

  httpsConfig = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

export default defineConfig({
  plugins: [pugPlugin()],
  server: {
    https: httpsConfig,
    hmr: isDev ? { protocol: 'wss', port: 3001 } : false,
  },
});
