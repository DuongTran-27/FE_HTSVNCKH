// Cấu hình dùng chung cho prepare.js, playwright.config.js, vite.e2e.config.js (T309).
// DB riêng nckh_t309_test (hậu tố _test để qua chốt NFR08); không dùng DB dev hay nckh_test, không đọc .env.
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Repo backend (tách 2026-11-24): E2E dựng DB và chạy API bằng code backend. Mặc định là thư mục bên cạnh repo này.
export const BACKEND_DIR = path.resolve(
  process.env.NCKH_BACKEND_DIR ?? fileURLToPath(new URL('../../BE_HTSVNCKH', import.meta.url)),
);
export const API_PORT = 4309;
export const WEB_PORT = 5309;
export const DB_NAME = 'nckh_t309_test';
export const DB_URL = `postgresql://postgres:postgres@localhost:54329/${DB_NAME}`;
export const TEMPLATE_URL = 'postgresql://postgres:postgres@localhost:54329/template1';
export const OUT_DIR = fileURLToPath(new URL('./.out/', import.meta.url));
export const STATE_FILE = `${OUT_DIR}state.json`;
// project Playwright -> tiền tố mã tài khoản của bộ dữ liệu riêng (prepare.js)
export const DATASETS = { desktop: 'E2E', mobile: 'M36' };
// chỉ dùng cho E2E gọi /api/cron/similarity-rechecks (G5), không phải bí mật thật
export const CRON_SECRET = 'e2e-t702-cron-khong-dung-that-0123456789';

export const API_ENV = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  DATABASE_URL: DB_URL,
  DIRECT_URL: DB_URL,
  JWT_ACCESS_SECRET: 'e2e-t309-secret-khong-dung-that-0123456789',
  CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
  CRON_SECRET,
};
