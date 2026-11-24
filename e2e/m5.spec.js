import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { data, login } from './helpers.js';

// E2E GĐ5 (T505, FR13, FR14): dashboard lọc -> bảng -> CSV khớp bảng; chuông chưa đọc -> đánh dấu đã đọc.

// parse CSV tối giản (bỏ BOM, ô có thể đặt trong "...")
const parse = (text) => text.replace(new RegExp('^\uFEFF'), '').trim().split(/\r?\n/).map((l) => [...l.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map((m) => (m[1] ?? m[2]).replaceAll('""', '"')));

async function tableRows(page) {
  return page.locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.trim())));
}

test.describe('M4 dashboard và CSV', () => {
  test('TC-FR14-E03 STAFF lọc dashboard, bảng có số, CSV tải về có BOM và khớp từng dòng + tổng', async ({ page }) => {
    const S = data();
    await login(page, S.users.cb.code);
    await page.goto('/thong-ke');
    await expect(page.getByRole('heading', { name: 'Thống kê' })).toBeVisible();
    for (const groupBy of ['status', 'academicYear']) {
      await page.goto(`/thong-ke?groupBy=${groupBy}`);
      await expect(page.locator('table caption')).toContainText('tổng');
      const rows = await tableRows(page);
      expect(rows.length).toBeGreaterThan(0);
      const total = Number((await page.locator('table tfoot td').first().textContent()).trim());
      expect(rows.reduce((s, r) => s + Number(r[1]), 0)).toBe(total);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Xuất CSV' }).click()]);
      expect(dl.suggestedFilename()).toMatch(new RegExp('^thong-ke-' + groupBy + '-[0-9]{8}[.]csv$'));
      const raw = readFileSync(await dl.path(), 'utf8');
      expect(raw.charCodeAt(0)).toBe(0xfeff);
      const [, ...body] = parse(raw);
      expect(body.map(([l, n]) => [l, Number(n)])).toEqual(rows.map(([l, n]) => [l, Number(n)]));
    }
  });

  test('TC-FR14-E04 lọc theo trạng thái Đã đóng: bảng chỉ còn một nhóm, tổng đổi và CSV vẫn khớp', async ({ page }) => {
    const S = data();
    await login(page, S.users.cb.code);
    await page.goto('/thong-ke?groupBy=status');
    const all = Number((await page.locator('table tfoot td').first().textContent()).trim());
    await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption({ label: 'Đã đóng' });
    await expect(page).toHaveURL(/status=CLOSED/);
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table tbody tr').first()).toContainText('Đã đóng');
    const closed = Number((await page.locator('table tfoot td').first().textContent()).trim());
    expect(closed).toBeGreaterThan(0);
    expect(closed).toBeLessThan(all);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Xuất CSV' }).click()]);
    const [, ...body] = parse(readFileSync(await dl.path(), 'utf8'));
    expect(body).toEqual([['Đã đóng', String(closed)]]);
  });

  test('TC-FR25-E03 SV không có menu Thống kê và vào /thong-ke không thấy dữ liệu', async ({ page }) => {
    const S = data();
    await login(page, S.bell.sv.code);
    await expect(page.getByRole('link', { name: 'Thống kê' })).toHaveCount(0);
    await page.goto('/thong-ke');
    await expect(page.locator('table')).toHaveCount(0);
  });
});

test.describe('M2 chuông thông báo', () => {
  test('TC-FR13-E04 chuông hiện số chưa đọc; đánh dấu một thông báo giảm số; đánh dấu tất cả về 0', async ({ page }) => {
    const S = data();
    await login(page, S.bell.sv.code);
    const bell = (n) => page.getByRole('link', { name: n ? `Thông báo, ${n} chưa đọc` : 'Thông báo', exact: true });
    await expect(bell(S.bell.unread)).toBeVisible();
    await bell(S.bell.unread).click();
    await expect(page).toHaveURL(/thong-bao/);
    await expect(page.getByText('Chưa đọc', { exact: true })).toHaveCount(S.bell.unread);
    await page.getByRole('button', { name: 'Đánh dấu đã đọc' }).first().click();
    await expect(page.getByText('Chưa đọc', { exact: true })).toHaveCount(S.bell.unread - 1);
    await expect(bell(S.bell.unread - 1)).toBeVisible();
    await page.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }).click();
    await expect(page.getByText('Chưa đọc', { exact: true })).toHaveCount(0);
    await expect(bell(0)).toBeVisible();
    await page.reload(); // trạng thái đã lưu ở server
    await expect(page.getByText('Chưa đọc', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Thông báo chuông E2E số 1')).toBeVisible();
  });
});
