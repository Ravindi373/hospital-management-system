import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app runs on :5173 and forwards /api calls to the Express server,
// so the browser sees one origin and the session cookie stays SameSite=Strict.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
