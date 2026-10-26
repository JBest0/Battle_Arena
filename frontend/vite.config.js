import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = {
  target: 'http://localhost:3000',
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/static': backend,
      '/uploads': backend,
      '/socket.io': { ...backend, ws: true },
    },
  },
});
