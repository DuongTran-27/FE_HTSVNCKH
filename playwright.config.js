import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';
import { API_ENV, API_PORT, BACKEND_DIR, OUT_DIR, WEB_PORT } from './e2e/env.js';

// DB được dựng lại bằng `node e2e/prepare.js` (script test:e2e chạy trước Playwright).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  outputDir: `${OUT_DIR}test-results`,
  reporter: [['list']],
  workers: 1, // các ca dùng chung một DB; luồng M1 là chuỗi bước tuần tự
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://localhost:${WEB_PORT}`, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', trace: 'retain-on-failure' },
  // T702 (NFR07): mọi spec chạy ở cả hai project; mỗi project dùng bộ dữ liệu riêng (DATASETS trong e2e/env.js)
  // DC-21..23: mỗi project là một "máy khách" riêng (X-Forwarded-For, API trust proxy 1) để giới hạn refresh 300/15 phút/IP
  // của API áp cho từng project như người dùng thật, không cộng dồn cả bộ ~100 ca vào một IP.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], extraHTTPHeaders: { 'X-Forwarded-For': '10.209.0.1' } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'X-Forwarded-For': '10.209.0.2' } } },
  ],
  webServer: [
    {
      command: 'node src/server.js',
      cwd: BACKEND_DIR,
      url: `http://localhost:${API_PORT}/api/health`,
      env: { ...process.env, ...API_ENV },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --config e2e/vite.e2e.config.js --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
