import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { API_PORT } from './env.js';
import { data, db, loggedIn, overflowX, settled } from './helpers.js';

// TASK-DC-23: hồ sơ sửa SĐT (FR30), SSO tắt + sso_error (FR28), Kanban bằng bàn phím (FR38), tải Excel (FR39).
// Tài khoản S.dc23.* chỉ spec này dùng (prepare.js); mỗi test độc lập, không phụ thuộc thứ tự.

test('TC-FR30-E01 hồ sơ: SĐT sai bị báo tại ô, không lưu; SĐT đúng lưu chuẩn hóa + ghi lịch sử; không ô sửa họ tên', async ({ browser }) => {
  const { sv } = data().dc23;
  const page = await loggedIn(browser, sv.code);
  await page.goto('/ho-so');
  await expect(page.getByRole('main').getByText(sv.name)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Họ tên|Email/ })).toHaveCount(0); // chỉ SĐT tự sửa được
  const phone = page.getByLabel('Số điện thoại');
  await phone.fill('0123 45');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Số điện thoại không hợp lệ')).toBeVisible();
  expect((await db().user.findUnique({ where: { code: sv.code } })).phone).toBeNull();

  await phone.fill('0912 345 678');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Cập nhật thành công')).toBeVisible();
  const u = await db().user.findUnique({ where: { code: sv.code } });
  expect(u.phone).toBe('0912345678');
  expect(await db().auditLog.count({ where: { action: 'PROFILE_UPDATE', entityId: u.id } })).toBe(1);
  await page.reload();
  await expect(page.getByLabel('Số điện thoại')).toHaveValue(/0912\s?345\s?678/);
  await settled(page);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);
  await page.context().close();
});

test('TC-FR28-E02 SSO tắt: không có nút Google, /api/auth/google/start 404; sso_error hiện thông điệp và bị xóa khỏi URL', async ({ page, request }) => {
  const providers = page.waitForResponse((r) => r.url().includes('/api/auth/providers'));
  await page.goto('/dang-nhap?sso_error=NO_ACCOUNT');
  expect(await (await providers).json()).toMatchObject({ google: false });
  await expect(page.getByText('Tài khoản chưa được cấp trên hệ thống. Vui lòng liên hệ cán bộ khoa.')).toBeVisible();
  await expect(page).not.toHaveURL(/sso_error/);
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
  await expect(page.getByLabel('Mật khẩu')).toBeVisible(); // form mật khẩu giữ nguyên

  await page.goto('/dang-nhap?sso_error=KHONG_CO_MA_NAY');
  await expect(page.getByText('Đăng nhập bằng Google không thành công')).toBeVisible();
  await page.goto('/dang-nhap?sso_error=DOMAIN_NOT_ALLOWED');
  await expect(page.getByText('Truy cập bị từ chối. Vui lòng dùng email do trường cấp.')).toBeVisible();

  const res = await request.get(`http://localhost:${API_PORT}/api/auth/google/start`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test('TC-FR38-E03 Kanban bằng bàn phím: menu "Chuyển sang…" chỉ có cột hợp lệ; Chờ đánh giá → Đạt, Đạt → Cần bổ sung; SV chỉ xem', async ({ browser }) => {
  const { kanban, gv, sv2 } = data().dc23;
  const page = await loggedIn(browser, gv.code);
  await page.goto(`/de-tai/${kanban.id}/kanban`);
  const col = (name) => page.getByRole('region', { name, exact: true });
  // Mở menu bằng Enter trên nút, đi tới mục bằng mũi tên, chọn bằng Enter
  const moveByKeyboard = async (milestone, target, expected) => {
    await page.getByRole('button', { name: `Chuyển ${milestone} sang…` }).focus();
    await page.keyboard.press('Enter');
    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(expected.length);
    expect((await items.allInnerTexts()).map((x) => x.trim()).sort()).toEqual([...expected].sort());
    const item = page.getByRole('menuitem', { name: target, exact: true });
    for (let i = 0; i < expected.length && !(await item.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('ArrowDown');
    await expect(item).toBeFocused();
    await page.keyboard.press('Enter');
  };

  const A = 'Mốc chờ đánh giá Kanban';
  const P = 'Mốc đã đạt Kanban';
  await expect(col('Chờ đánh giá').getByText(A)).toBeVisible();
  await expect(col('Đạt').getByText(P)).toBeVisible();

  await moveByKeyboard(A, 'Đạt', ['Đạt', 'Cần bổ sung']);
  let dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await page.keyboard.type('Bản nộp đạt yêu cầu, trình bày rõ ràng.');
  await dlg.getByRole('button', { name: 'Gửi đánh giá' }).press('Enter');
  await expect(page.getByText(`Đã chuyển ${A} sang Đạt`)).toBeAttached();
  await expect(col('Đạt').getByText(A)).toBeVisible();
  await expect(col('Chờ đánh giá').getByText(A)).toHaveCount(0);
  const msA = await db().milestone.findFirst({ where: { topicId: kanban.id, name: A }, include: { feedbacks: true } });
  expect(msA.evaluation).toBe('PASSED');
  expect(msA.feedbacks.map((f) => f.evaluation)).toEqual(['PASSED']);

  await moveByKeyboard(P, 'Cần bổ sung', ['Cần bổ sung']);
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Lý do').fill('Cần bổ sung số liệu thực nghiệm cho mốc này.');
  await dlg.getByRole('button', { name: 'Mở lại' }).press('Enter');
  await expect(page.getByText(`Đã chuyển ${P} sang Cần bổ sung`)).toBeAttached();
  await expect(col('Cần bổ sung').getByText(P)).toBeVisible();
  expect((await db().milestone.findFirst({ where: { topicId: kanban.id, name: P } })).evaluation).toBe('NEEDS_WORK');
  await settled(page);
  expect(await overflowX(page)).toBeLessThanOrEqual(0);

  const sv = await loggedIn(browser, sv2.code);
  await sv.goto(`/de-tai/${kanban.id}/kanban`);
  await expect(sv.getByRole('region', { name: 'Đạt', exact: true }).getByText(A)).toBeVisible();
  await expect(sv.getByRole('button', { name: /Chuyển .* sang…/ })).toHaveCount(0);
  await expect(sv.locator('[draggable="true"]')).toHaveCount(0);
  await page.context().close();
  await sv.context().close();
});

test('TC-FR39-E04 /thong-ke: "Xuất Excel" tải file .xlsx có sheet Thống kê + Danh sách đề tài, số dòng = total của /api/stats', async ({ browser }) => {
  const S = data();
  const page = await loggedIn(browser, S.users.cb.code);
  const statsRes = page.waitForResponse((r) => /\/api\/stats\?/.test(r.url()) && r.ok());
  await page.goto('/thong-ke');
  const { total } = await (await statsRes).json();
  await settled(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Xuất Excel' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const buf = await readFile(await download.path());
  expect(buf.length).toBeGreaterThan(0);
  expect(buf.subarray(0, 2).toString()).toBe('PK'); // zip (OOXML)
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(['Thống kê', 'Danh sách đề tài']));
  expect(wb.getWorksheet('Danh sách đề tài').actualRowCount - 1).toBe(total); // trừ dòng tiêu đề
  await expect(page.getByRole('button', { name: 'Xuất Excel' })).toBeEnabled();
  await page.context().close();
});
