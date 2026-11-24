// Dùng chung cho các spec E2E (T702).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { BACKEND_DIR, DB_URL, STATE_FILE } from './env.js';

// @prisma/client chỉ cài ở repo backend
const { PrismaClient } = createRequire(path.join(BACKEND_DIR, 'package.json'))('@prisma/client');

const ALL = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
// Bộ dữ liệu của project đang chạy (desktop | mobile) – chỉ gọi được bên trong test/hook
export const data = () => ALL[test.info().project.name];

export async function login(page, code) {
  const S = data();
  await page.goto('/dang-nhap');
  await page.getByLabel('Mã hoặc email').fill(code);
  await page.getByLabel('Mật khẩu').fill(S.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
}

/** Trang mới trong context riêng đã đăng nhập; context mới thừa hưởng `use` của project (viewport 360 ở mobile) */
export async function loggedIn(browser, code) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, code);
  return page;
}

/** Số px tràn ngang của trang (<= 0 là không tràn) – NFR07 */
export const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Chờ hết mọi chỉ báo "Đang tải…" */
export const settled = (page) => expect(page.getByRole('status').filter({ hasText: /Đang tải|Đang kiểm tra/ })).toHaveCount(0);

let prisma;
/** Prisma tới DB E2E – chỉ dùng làm "oracle" đọc kết quả hoặc giả lập sự cố hạ tầng, không thay thao tác UI */
export const db = () => (prisma ??= new PrismaClient({ datasourceUrl: DB_URL }));

export const JUSTIFICATION = Array.from({ length: 60 }, (_, i) => `từ${i + 1}`).join(' ') + ' nhóm giải trình khác biệt về đối tượng và dữ liệu';
