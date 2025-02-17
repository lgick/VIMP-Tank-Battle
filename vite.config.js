import { defineConfig } from 'vite';
import pugPlugin from 'vite-plugin-pug';

export default defineConfig({
  plugins: [pugPlugin()],
  server: {
    hmr: {
      middlewareMode: true,
      port: 3001,
    },
  },
});
