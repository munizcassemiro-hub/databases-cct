import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const port = process.env.PORT ? Number(process.env.PORT) : undefined;
if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

export default defineConfig({
  plugins: [react()],
  // Cloud previews assign hostnames dynamically. Only this public study app
  // is served; production on Netlify serves dist/ without a Vite server.
  server: { host: '0.0.0.0', port: port ?? 5173, strictPort: true, allowedHosts: true },
  preview: { host: '0.0.0.0', port: port ?? 4173, strictPort: true, allowedHosts: true },
});
