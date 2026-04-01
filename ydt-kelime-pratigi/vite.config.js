import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev’de /pricing, /terms, /privacy doğrudan açılınca index.html dönsün (Paddle doğrulama URL’leri). */
function spaLegalRoutesFallback() {
  return {
    name: 'spa-legal-routes',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          const url = req.url?.split('?')[0];
          if (['/pricing', '/terms', '/privacy'].includes(url)) {
            req.url = '/';
          }
          next();
        });
      };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), spaLegalRoutesFallback()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    }
  }
})
