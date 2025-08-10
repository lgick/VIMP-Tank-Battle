import { defineConfig } from 'vite';
import pugPlugin from 'vite-plugin-pug';
import fs from 'fs';
import path from 'path';
import serverConfig from './src/config/server.js';

const keyPath = serverConfig.httpsOptions.key;
const certPath = serverConfig.httpsOptions.cert;

// проверка существования файлов, чтобы избежать ошибки при запуске
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error(`
    [Vite HMR Error] Certificate files not found!
    Please ensure these files exist:
    - Key: ${path.resolve(keyPath)}
    - Cert: ${path.resolve(certPath)}
    You might need to generate them first.
  `);

  process.exit(1);
}

export default defineConfig({
  plugins: [pugPlugin()],
  server: {
    https: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
    hmr: {
      protocol: 'wss',
      port: 3001,
    },
  },
});
