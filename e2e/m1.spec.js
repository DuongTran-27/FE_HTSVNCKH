import { expect, test } from '@playwright/test';
import { JUSTIFICATION, data, db, login } from './helpers.js';

// Mỗi project (desktop/mobile) dùng bộ dữ liệu riêng (helpers.data()). Tài khoản gv, cb dùng chung với m4.spec.js:
// không spec nào đổi mật khẩu/khóa hai tài khoản này (MINOR 1 reviews/T407-reviewer-v1.md).

test.describe('M1/M5 luồng đầy đủ', () => {
  test.describe.configure({ mode: 'serial' });
  const ctxs = {};
  let topicId;
  let code;
  test.afterAll(async () => { for (const c of Object.values(ctxs)) await c.close(); });
  const pageFor = async (browser, who) => {
    if (!ctxs[who]) ctxs[who] = await browser.newContext();
    return ctxs[who].pages()[0] ?? ctxs[who].newPage();
  };

  test('TC-FR05-E01 SV tạo đề tài, soạn hồ sơ, mời thành viên; thành viên chấp nhận (FR03)', async ({ browser }) => {
    const S = data();
    const page = await pageFor(browser, 'sv1');
    await login(page, S.users.sv1.code);
    await page.getByRole('link', { name: 'Tạo đề tài' }).first().click();
    await page.getByLabel('Đợt đăng ký').selectOption({ label: S.roundLabel }); // theo nhãn, không theo thứ tự đợt
    await page.getByLabel(/Tên đề tài/).fill(S.main.title);
    await page.getByRole('button', { name: 'Tạo nháp' }).click();
    await expect(page.getByRole('heading', { name: 'Soạn hồ sơ' })).toBeVisible();
    topicId = page.url().match(/de-tai\/([^/]+)\/sua/)[1];
    code = (await page.getByTestId('topic-code').innerText()).trim();

    await page.getByLabel('Tóm tắt').fill(S.main.summary);
    await page.getByLabel('Mục tiêu').fill(S.main.objectives);
    const kw = page.getByLabel('Từ khóa', { exact: true });
    for (const k of S.main.keywords) { await kw.fill(k); await kw.press('Enter'); }
    await page.getByLabel('Lĩnh vực').selectOption({ label: S.main.fieldName });
    await page.getByRole('button', { name: 'Lưu nháp' }).click();
    await expect(page.getByText('Đã lưu nháp')).toBeVisible();

    await page.goto(`/de-tai/${topicId}/nhom`);
    await page.getByLabel('Mã sinh viên').fill(S.users.sv2.code);
    await page.getByRole('button', { name: 'Mời thành viên' }).click();
    await expect(page.getByText(`${S.users.sv2.code} – ${S.users.sv2.name}`)).toBeVisible();

    const p2 = await pageFor(browser, 'sv2');
    await login(p2, S.users.sv2.code);
    await p2.goto('/loi-moi');
    await p2.getByRole('button', { name: 'Chấp nhận' }).click();
    await p2.getByRole('dialog').getByRole('button', { name: 'Chấp nhận' }).click();
    await expect(p2.getByText('Đã chấp nhận lời mời')).toBeVisible();

    await page.goto(`/de-tai/${topicId}/nhom`);
    await expect(page.getByRole('heading', { name: /Nhóm \(2/ })).toBeVisible();
  });

  test('TC-FR16-E02 SV mời GVHD, GV đăng nhập và nhận', async ({ browser }) => {
    const S = data();
    const page = await pageFor(browser, 'sv1');
    await page.goto(`/de-tai/${topicId}/moi-gvhd`);
    await page.getByLabel('Tìm giảng viên').fill(S.users.gv.code);
    await page.getByRole('listitem').filter({ hasText: S.users.gv.name }).getByRole('button', { name: 'Chọn' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Gửi đề nghị' }).click();
    await expect(page.getByText('Chờ giảng viên hướng dẫn').first()).toBeVisible();

    const gv = await pageFor(browser, 'gv');
    await login(gv, S.users.gv.code);
    await expect(gv).toHaveURL(/de-nghi-huong-dan/);
    const card = gv.getByRole('listitem').filter({ hasText: code });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Nhận hướng dẫn' }).click();
    await gv.getByRole('dialog').getByRole('button', { name: 'Nhận hướng dẫn' }).click();
    await expect(gv.getByText('Đã nhận hướng dẫn')).toBeVisible();
  });

  test('TC-FR06-E03 Kiểm tra trước ra HIGH, bắt buộc giải trình, gửi (M5)', async ({ browser }) => {
    const page = await pageFor(browser, 'sv1');
    await page.goto(`/de-tai/${topicId}/gui`);
    await expect(page.getByTestId('similarity-panel')).toHaveAttribute('data-level', 'HIGH');
    const send = page.getByRole('button', { name: 'Gửi xét duyệt', exact: true });
    await expect(send).toBeDisabled();
    await page.getByLabel(/Giải trình/).fill('quá ngắn');
    await expect(send).toBeDisabled();
    await page.getByLabel(/Giải trình/).fill(JUSTIFICATION);
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByText(/Đã gửi hồ sơ lần 1/)).toBeVisible();
    await expect(page.getByText('Chờ xét duyệt').first()).toBeVisible();
  });

  test('TC-FR07-E04 Cán bộ mở hàng chờ, xem snapshot + cảnh báo + giải trình, duyệt', async ({ browser }) => {
    const S = data();
    const page = await pageFor(browser, 'cb');
    await login(page, S.users.cb.code);
    await expect(page).toHaveURL(/xet-duyet/);
    await page.getByRole('link', { name: new RegExp(code) }).click();
    await expect(page.getByRole('heading', { name: 'Xét duyệt – lần gửi 1' })).toBeVisible();
    await expect(page.getByText(S.main.title).first()).toBeVisible();
    await expect(page.getByTestId('similarity-panel')).toHaveAttribute('data-level', 'HIGH');
    await expect(page.getByText('Giải trình của nhóm')).toBeVisible();
    await expect(page.getByText('nhóm giải trình khác biệt')).toBeVisible();
    await page.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(page.getByText(`Đã duyệt hồ sơ ${code}`)).toBeVisible();
    await page.goto(`/de-tai/${topicId}`);
    await expect(page.getByText('Đang thực hiện').first()).toBeVisible();
  });
});

test.describe('FR08 kho đề tài (API thật)', () => {
  test('TC-FR08-E05 /kho chỉ hiện đề tài đóng đạt, không có FAIL, không lộ thành viên', async ({ page }) => {
    const S = data();
    await login(page, S.users.sv2.code);
    // oracle theo đặc tả FR08 (CLOSED + kết quả hiện hành đạt), đọc lúc chạy: spec khác/project khác có thể đóng thêm đề tài
    const closedOk = await db().topic.findMany({ where: { status: 'CLOSED', results: { some: { isCurrent: true, result: { in: ['EXCELLENT', 'GOOD', 'PASS'] } } } }, select: { code: true, title: true } });
    expect(closedOk.length).toBeLessThanOrEqual(20); // vừa một trang
    await page.goto('/kho');
    for (const t of closedOk) await expect(page.getByRole('link', { name: `${t.code} – ${t.title}` })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'NCKH-' })).toHaveCount(closedOk.length);
    await expect(page.getByText(S.fail.code)).toHaveCount(0);
    await expect(page.getByText(S.fail.title)).toHaveCount(0);
    for (const n of S.leaderNames) await expect(page.getByText(n)).toHaveCount(0);
  });

  test('TC-FR08-E06 /kho/:code đề tài FAIL không có trong kho; đề tài đạt xem được tóm tắt', async ({ page }) => {
    const S = data();
    await login(page, S.users.gv.code);
    await page.goto(`/kho/${S.fail.code}`);
    await expect(page.getByText('Đề tài không có trong kho')).toBeVisible();
    const ok = S.closedOk[0];
    await page.goto(`/kho/${ok.code}`);
    await expect(page.getByRole('heading', { name: `${ok.code} – ${ok.title}` })).toBeVisible();
    await expect(page.getByText(ok.summary.slice(0, 60))).toBeVisible();
  });

  test('TC-FR08-E07 ?result=FAIL không đưa đề tài FAIL vào kho; ADMIN xem được; tìm không dấu', async ({ page }) => {
    const S = data();
    await login(page, S.users.admin.code);
    await page.goto('/kho?result=FAIL');
    await expect(page.getByText(S.fail.title)).toHaveCount(0);
    const t = S.closedOk[0];
    const plain = t.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    await page.goto(`/kho?q=${encodeURIComponent(plain)}`);
    await expect(page.getByRole('link', { name: `${t.code} – ${t.title}` })).toBeVisible();
  });
});

test.describe('R10 trên 360 px', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('TC-FR05-E08 màn Gửi xét duyệt không tràn ngang, nút đủ lớn, gửi được', async ({ page }) => {
    const S = data();
    await login(page, S.users.sv3.code);
    await page.goto(`/de-tai/${S.mobile.id}/gui`);
    await expect(page.getByTestId('similarity-panel')).toHaveAttribute('data-level', 'HIGH');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByLabel(/Giải trình/).fill(JUSTIFICATION);
    const send = page.getByRole('button', { name: 'Gửi xét duyệt', exact: true });
    await send.scrollIntoViewIfNeeded();
    const box = await send.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await send.click();
    await expect(page.getByText(/Đã gửi hồ sơ lần 1/)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
