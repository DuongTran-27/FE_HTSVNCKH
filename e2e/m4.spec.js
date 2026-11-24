import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { API_PORT } from './env.js';
import { data, db, login } from './helpers.js';

// E2E GĐ4 (M2, M3): nộp mốc -> nộp muộn -> nhận xét + đánh giá -> kết quả cuối -> đề nghị đóng -> xác nhận đóng.
// Kho file là bản giả trong bộ nhớ của API (server.js khi không có CLOUDINARY_URL), không gọi Cloudinary thật.
// Dùng chung tài khoản gv, cb với m1.spec.js (cùng bộ dữ liệu của project); không spec nào đổi mật khẩu/khóa hai tài khoản này
// (MINOR 1 reviews/T407-reviewer-v1.md). Đề tài flow/neg và SV4/SV5 chỉ spec này dùng.
const M_ONTIME = 'Báo cáo giữa kỳ E2E';
const M_LATE = 'Báo cáo cuối kỳ E2E';
const FILE_ONTIME = 'báo-cáo-giữa-kỳ.pdf';
const FILE_LATE = 'báo-cáo-cuối-kỳ.pdf';
const pdf = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n') });

// selectOption chỉ nhận nhãn chuỗi đầy đủ; nhãn mốc có thêm "– hạn …" nên tìm theo tên
const pickMilestone = async (form, name) => {
  const value = await form.getByLabel('Mốc').locator('option').filter({ hasText: name }).first().getAttribute('value');
  await form.getByLabel('Mốc').selectOption(value);
};

async function submitFile(page, topicId, milestoneName, file) {
  await page.goto(`/de-tai/${topicId}/tai-lieu`);
  const form = page.getByRole('form', { name: 'Nộp tài liệu' });
  await form.getByLabel('Loại tài liệu').selectOption({ label: 'Giữa kỳ' });
  await pickMilestone(form, milestoneName);
  await form.locator('input[type=file]').setInputFiles(pdf(file));
  await form.getByRole('button', { name: 'Nộp', exact: true }).click();
  await expect(page.getByText('Đã nộp tài liệu')).toBeVisible();
}

// danh sách bản nộp ngay dưới tiêu đề "Mốc: <tên>" (không dùng <section> cha vì bao cả form nộp)
const group = (page, name) => page.getByRole('heading', { name: `Mốc: ${name}` }).locator('xpath=following-sibling::ul[1]');

test.describe('M2/M3 luồng đóng đề tài', () => {
  test.describe.configure({ mode: 'serial' });
  const ctxs = {};
  test.afterAll(async () => { for (const c of Object.values(ctxs)) await c.close(); });
  const pageFor = async (browser, who, code) => {
    if (!ctxs[who]) {
      ctxs[who] = await browser.newContext();
      await login(await ctxs[who].newPage(), code);
    }
    return ctxs[who].pages()[0];
  };

  test('TC-FR11-E01 SV nộp file cho mốc bắt buộc, đúng hạn không có nhãn nộp muộn', async ({ browser }) => {
    const S = data();
    const { flow } = S.exec;
    const page = await pageFor(browser, 'sv', flow.sv.code);
    await submitFile(page, flow.id, M_ONTIME, FILE_ONTIME);
    const g = group(page, M_ONTIME);
    await expect(g.getByText('Phiên bản 1')).toBeVisible();
    await expect(g.getByText(FILE_ONTIME)).toBeVisible();
    await expect(g.getByText('Mới nhất')).toBeVisible();
    await expect(g.getByText('Nộp muộn')).toHaveCount(0);
  });

  test('TC-FR11-E02 nộp sau hạn mốc: bản có nhãn "Nộp muộn"', async ({ browser }) => {
    const S = data();
    const { flow } = S.exec;
    const page = await pageFor(browser, 'sv', flow.sv.code);
    await submitFile(page, flow.id, M_LATE, FILE_LATE);
    const g = group(page, M_LATE);
    await expect(g.getByText(FILE_LATE)).toBeVisible();
    await expect(g.getByText('Nộp muộn')).toBeVisible();
  });

  // Kho file giả trong bộ nhớ API: URL ký giả (api.cloudinary.test) nên chặn điều hướng, kiểm URL và lịch sử, không tải thật
  test('TC-FR24-E01 SV trong nhóm bấm Tải về: URL ký attachment hết hạn ~5 phút, ghi lịch sử; người ngoài nhóm nhận 403 và không ghi lịch sử', async ({ browser, request }) => {
    const S = data();
    const { flow, neg } = S.exec;
    const page = await pageFor(browser, 'sv', flow.sv.code);
    await page.route('https://api.cloudinary.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    await page.goto(`/de-tai/${flow.id}/tai-lieu`);
    const row = group(page, M_ONTIME).getByRole('listitem').first();
    const doc = await db().document.findFirstOrThrow({ where: { topicId: flow.id, fileName: { startsWith: FILE_ONTIME.replace('.pdf', '') } } });
    const before = await db().auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: doc.id } });
    const reqP = page.waitForRequest((r) => r.url().startsWith('https://api.cloudinary.test/'));
    await row.getByRole('button', { name: 'Tải về' }).click();
    const url = new URL((await reqP).url());
    expect(url.searchParams.get('attachment')).toBe('true');
    const ttl = Number(url.searchParams.get('expires_at')) - Date.now() / 1000;
    expect(ttl).toBeGreaterThan(280);
    expect(ttl).toBeLessThanOrEqual(300);
    await expect.poll(() => db().auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: doc.id } })).toBe(before + 1);

    const api = `http://localhost:${API_PORT}/api`;
    const lg = await request.post(`${api}/auth/login`, { data: { identifier: neg.sv.code, password: S.password } });
    expect(lg.status()).toBe(200);
    const { accessToken } = await lg.json();
    const denied = await request.post(`${api}/documents/${doc.id}/download-url`, { headers: { Authorization: `Bearer ${accessToken}` }, data: {} });
    expect(denied.status()).toBe(403);
    expect(await db().auditLog.count({ where: { action: 'DOCUMENT_DOWNLOAD', entityId: doc.id } })).toBe(before + 1);
  });

  test('TC-FR12-E03 GVHD nhận xét và đánh giá Đạt cho cả hai mốc; SV thấy nhận xét', async ({ browser }) => {
    const S = data();
    const { flow } = S.exec;
    const gv = await pageFor(browser, 'gv', S.users.gv.code);
    await gv.goto(`/de-tai/${flow.id}/tai-lieu`);
    for (const [name, text] of [[M_ONTIME, 'Bài làm đạt yêu cầu giữa kỳ.'], [M_LATE, 'Nộp muộn nhưng nội dung đầy đủ.']]) {
      const row = group(gv, name).getByRole('listitem').first();
      await row.getByRole('button', { name: /Nhận xét \(0\)/ }).click();
      await row.getByLabel('Nhận xét của giảng viên hướng dẫn').fill(text);
      await row.getByLabel('Đánh giá mốc').selectOption('PASSED');
      await row.getByRole('button', { name: 'Gửi nhận xét' }).click();
      await expect(row.getByText(text)).toBeVisible();
    }
    const sv = await pageFor(browser, 'sv', flow.sv.code);
    await sv.goto(`/de-tai/${flow.id}/moc`);
    await expect(sv.getByText('Đạt', { exact: true })).toHaveCount(2);
  });

  test('TC-FR12-E04 GVHD nhập kết quả cuối; điều kiện đóng đủ; SV thấy kết quả ngay nhưng không có nút đóng', async ({ browser }) => {
    const S = data();
    const { flow } = S.exec;
    const gv = await pageFor(browser, 'gv', S.users.gv.code);
    await gv.goto(`/de-tai/${flow.id}`);
    await expect(gv.getByText('Mốc bắt buộc: 2/2 Đạt – Đạt')).toBeVisible();
    await expect(gv.getByText('Kết quả cuối và nhận xét tổng kết của giảng viên hướng dẫn – chưa có')).toBeVisible();
    const form = gv.getByRole('form', { name: 'Nhập kết quả cuối' });
    await form.getByLabel('Kết quả').selectOption('GOOD');
    await form.getByLabel('Nhận xét tổng kết').fill('Nhóm hoàn thành đầy đủ các mốc, nội dung có chiều sâu, trình bày rõ ràng.');
    await form.getByRole('button', { name: 'Lưu kết quả' }).click();
    await expect(gv.getByText('Đã lưu kết quả cuối')).toBeVisible();
    await expect(gv.getByText('Kết quả cuối và nhận xét tổng kết của giảng viên hướng dẫn – đã có')).toBeVisible();

    const sv = await pageFor(browser, 'sv', flow.sv.code);
    await sv.goto(`/de-tai/${flow.id}`);
    await expect(sv.getByText('Nhóm hoàn thành đầy đủ các mốc')).toBeVisible();
    await expect(sv.getByRole('button', { name: 'Đề nghị đóng đề tài' })).toHaveCount(0); // chỉ GVHD (FR27)
  });

  test('TC-FR27-E05 GVHD đề nghị đóng -> Chờ đóng; GV hết quyền ghi; cán bộ xác nhận đóng -> Đã đóng', async ({ browser }) => {
    const S = data();
    const { flow } = S.exec;
    const gv = await pageFor(browser, 'gv', S.users.gv.code);
    await gv.goto(`/de-tai/${flow.id}`);
    await gv.getByRole('button', { name: 'Đề nghị đóng đề tài' }).click();
    await gv.getByRole('dialog').getByRole('button', { name: 'Đề nghị đóng đề tài' }).click();
    await expect(gv.getByText('Đã gửi đề nghị đóng đề tài')).toBeVisible();
    await expect(gv.getByText('Chờ đóng', { exact: true }).first()).toBeVisible();
    await expect(gv.getByRole('form', { name: 'Nhập kết quả cuối' })).toHaveCount(0);

    const cb = await pageFor(browser, 'cb', S.users.cb.code);
    await cb.goto(`/de-tai/${flow.id}`);
    await expect(cb.getByRole('button', { name: 'Đề nghị đóng đề tài' })).toHaveCount(0);
    await cb.getByRole('button', { name: 'Xác nhận đóng đề tài' }).click();
    await cb.getByRole('dialog').getByRole('button', { name: 'Xác nhận đóng đề tài' }).click();
    await expect(cb.getByText(`Đã đóng đề tài ${flow.code}`)).toBeVisible();
    await expect(cb.getByText('Đã đóng', { exact: true }).first()).toBeVisible();
    await expect(cb.getByRole('button', { name: 'Xác nhận đóng đề tài' })).toHaveCount(0);

    const sv = await pageFor(browser, 'sv', flow.sv.code);
    await sv.goto(`/de-tai/${flow.id}`);
    await expect(sv.getByText('Đã đóng', { exact: true }).first()).toBeVisible();
    await sv.goto(`/de-tai/${flow.id}/tai-lieu`);
    await expect(sv.getByRole('form', { name: 'Nộp tài liệu' })).toHaveCount(0); // hồ sơ chỉ đọc
  });
});

test.describe('M2/M3 ca âm: chưa đủ điều kiện', () => {
  test('TC-FR27-E06 chưa có mốc Đạt và kết quả cuối: đề nghị đóng bị từ chối, đề tài vẫn Đang thực hiện', async ({ browser }) => {
    const S = data();
    const { neg } = S.exec;
    const ctx = await browser.newContext();
    try {
      const gv = await ctx.newPage();
      await login(gv, S.users.gv.code);
      await gv.goto(`/de-tai/${neg.id}`);
      await expect(gv.getByText('Mốc bắt buộc: 0/1 Đạt – Chưa đạt')).toBeVisible();
      await gv.getByRole('button', { name: 'Đề nghị đóng đề tài' }).click();
      const dlg = gv.getByRole('dialog');
      const [res] = await Promise.all([
        gv.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/api/topics/${neg.id}/`)),
        dlg.getByRole('button', { name: 'Đề nghị đóng đề tài' }).click(),
      ]);
      expect(res.status()).toBe(409); // mã lỗi, không chỉ thông điệp (MINOR 3 reviews/T407-reviewer-v1.md)
      expect((await res.json()).error.code).toBe('MILESTONES_NOT_PASSED');
      await expect(dlg).toBeVisible(); // hộp không đóng
      await expect(dlg.getByText(/Mốc chưa đạt E2E/)).toBeVisible(); // lỗi MILESTONES_NOT_PASSED kèm tên mốc
      await gv.reload();
      await expect(gv.getByText('Đang thực hiện', { exact: true }).first()).toBeVisible();
      await expect(gv.getByText('Chờ đóng', { exact: true })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('TC-FR27-E07 cán bộ khoa không có nút xác nhận đóng khi đề tài chưa ở Chờ đóng', async ({ browser }) => {
    const S = data();
    const { neg } = S.exec;
    const ctx = await browser.newContext();
    try {
      const cb = await ctx.newPage();
      await login(cb, S.users.cb.code);
      await cb.goto(`/de-tai/${neg.id}`);
      await expect(cb.getByText('Đang thực hiện', { exact: true }).first()).toBeVisible();
      await expect(cb.getByRole('button', { name: 'Xác nhận đóng đề tài' })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('M2 viewport 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('TC-FR11-E08 SV nộp file ở 360 px: không tràn ngang, nút Nộp cao >= 44 px, nộp được', async ({ page }) => {
    const S = data();
    const { neg } = S.exec;
    await login(page, neg.sv.code);
    await page.goto(`/de-tai/${neg.id}/tai-lieu`);
    const form = page.getByRole('form', { name: 'Nộp tài liệu' });
    await form.getByLabel('Loại tài liệu').selectOption({ label: 'Giữa kỳ' });
    await pickMilestone(form, 'Mốc chưa đạt E2E');
    await form.locator('input[type=file]').setInputFiles(pdf('báo-cáo-di-động.pdf'));
    const btn = form.getByRole('button', { name: 'Nộp', exact: true });
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await btn.click();
    await expect(page.getByText('Đã nộp tài liệu')).toBeVisible();
    await expect(page.getByText('báo-cáo-di-động.pdf')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
