import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo local (npm run dev) las llamadas a /api van a la API en el puerto 3000.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
