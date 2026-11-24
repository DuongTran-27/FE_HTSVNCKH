// Vite cho E2E: dùng cấu hình sản phẩm nhưng proxy /api tới API E2E (vite.config.js cố định cổng 4000).
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from '../vite.config.js';
import { API_PORT } from './env.js';

export default mergeConfig(base, {
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { proxy: { '/api': `http://localhost:${API_PORT}` } },
});
