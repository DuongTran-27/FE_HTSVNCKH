import { expect, test } from '@playwright/test';
import { JUSTIFICATION, data, loggedIn, login, settled } from './helpers.js';

// T702: E2E theo vai trò – ADMIN không có quyền nghiệp vụ, cán bộ khoa khác 403 (FR25), quyết định FR07 qua UI.
// Đề tài revise/reject/g5 do prepare.js tạo riêng cho mỗi project; không spec nào khác chạm tới.

test.describe('FR25 phân quyền theo vai trò', () => {
  test('TC-FR25-E04 ADMIN tạo tài khoản giảng viên qua UI; không vào được màn nghiệp vụ', async ({ page }) => {
    const S = data();
    await login(page, S.users.admin.code);
    await expect(page).toHaveURL(/quan-ly\/tai-khoan/);
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Yêu cầu thay đổi' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Xét duyệt' })).toHaveCount(0);

    const code = `GVADM${test.info().project.name === 'mobile' ? 'M' : 'D'}`;
    await page.goto('/quan-ly/tai-khoan/moi');
    await page.getByLabel('Mã').fill(code);
    await page.getByLabel('Email').fill(`${code.toLowerCase()}@nckh.example`);
    await page.getByLabel('Họ tên').fill('TS. Nguyễn Thị Quản Trị Tạo');
    await page.getByLabel('Vai trò').selectOption({ label: 'Giảng viên' });
    await page.getByLabel('Khoa').selectOption({ label: 'Khoa Công nghệ Thông tin' });
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByRole('heading', { name: 'Đã tạo tài khoản' })).toBeVisible();

    // route guard chỉ dẫn đường; ở đây kiểm ADMIN không thấy dữ liệu nghiệp vụ nào
    for (const path of ['/de-tai', `/de-tai/${S.gd6.revise.id}`, '/yeu-cau', '/xet-duyet', '/thong-ke', '/de-nghi-huong-dan']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Bạn không có quyền truy cập trang này' }), path).toBeVisible();
      await expect(page.getByText(S.gd6.revise.code)).toHaveCount(0);
    }
  });

  test('TC-FR25-E05 cán bộ khoa khác: API trả 403 cho đề tài khoa CNTT, hàng chờ/yêu cầu không lộ đề tài khoa khác', async ({ page }) => {
    const S = data();
    const { revise, adv } = S.gd6;
    await login(page, S.users.cbx.code);
    await expect(page).toHaveURL(/xet-duyet/);
    await settled(page);
    await expect(page.getByText(revise.code)).toHaveCount(0);

    for (const path of [`/de-tai/${revise.id}`, `/de-tai/${adv.id}/yeu-cau`]) {
      const [res] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'GET' && r.url().endsWith(`/api/topics/${path.split('/')[2]}`)),
        page.goto(path),
      ]);
      expect(res.status(), path).toBe(403);
      await expect(page.getByText('Bạn không có quyền xem đề tài này')).toBeVisible();
      await expect(page.getByRole('button', { name: /Duyệt|Thay giảng viên|Đề nghị hủy/ })).toHaveCount(0);
    }
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/topics/${revise.id}`)),
      page.goto(`/xet-duyet/${revise.id}`),
    ]);
    expect(res.status()).toBe(403);
    await expect(page.getByRole('group', { name: 'Quyết định' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Xét duyệt – lần gửi/ })).toHaveCount(0);

    await page.goto('/yeu-cau?status=ALL');
    await settled(page);
    await expect(page.getByTestId('change-request')).toHaveCount(0);
    await page.goto('/de-tai');
    await settled(page);
    await expect(page.getByText(revise.code)).toHaveCount(0);
  });
});

test.describe('FR07 quyết định xét duyệt qua UI', () => {
  test('TC-FR07-E05 cán bộ yêu cầu chỉnh sửa (bắt buộc nội dung); SV thấy lý do, gửi lại lần 2; hàng chờ có lần gửi 2', async ({ browser }) => {
    const S = data();
    const { revise } = S.gd6;
    const reason = 'Bổ sung phương pháp đánh giá và tài liệu tham khảo tiếng Việt.';
    const cb = await loggedIn(browser, S.users.cb.code);
    await cb.goto(`/xet-duyet/${revise.id}`);
    await expect(cb.getByRole('heading', { name: 'Xét duyệt – lần gửi 1' })).toBeVisible();
    await cb.getByRole('group', { name: 'Quyết định' }).getByRole('button', { name: 'Yêu cầu chỉnh sửa' }).click();
    const dlg = cb.getByRole('dialog', { name: 'Yêu cầu chỉnh sửa' });
    await dlg.getByRole('button', { name: 'Yêu cầu chỉnh sửa' }).click();
    await expect(dlg).toBeVisible(); // thiếu nội dung -> không gửi
    await dlg.getByLabel('Nội dung cần chỉnh sửa').fill(reason);
    await dlg.getByRole('button', { name: 'Yêu cầu chỉnh sửa' }).click();
    await expect(cb.getByText(`Đã yêu cầu chỉnh sửa hồ sơ ${revise.code}`)).toBeVisible();

    const sv = await loggedIn(browser, S.users.sv15.code);
    await sv.goto(`/de-tai/${revise.id}`);
    await expect(sv.getByText('Cần chỉnh sửa', { exact: true }).first()).toBeVisible();
    await expect(sv.getByRole('note').filter({ hasText: reason })).toBeVisible();
    await sv.goto(`/de-tai/${revise.id}/gui`);
    await expect(sv.getByRole('heading', { name: 'Gửi lại sau chỉnh sửa' })).toBeVisible();
    await expect(sv.getByTestId('similarity-panel')).toBeVisible();
    const just = sv.getByLabel(/Giải trình/);
    const resend = sv.getByRole('button', { name: 'Gửi lại sau chỉnh sửa' });
    await settled(sv);
    // chờ kiểm tra tự chạy xong: hoặc nút gửi mở (NONE/ERROR) hoặc ô giải trình xuất hiện (REVIEW/HIGH) – không đếm khi chưa có kết quả
    await expect.poll(async () => (await resend.isEnabled()) || (await just.count()) > 0).toBe(true);
    if (await just.count()) await just.fill(JUSTIFICATION); // dữ liệu hai project giống nhau có thể ra REVIEW/HIGH
    await resend.click();
    await expect(sv.getByText(/Đã gửi hồ sơ lần 2/)).toBeVisible();
    await expect(sv.getByText('Chờ xét duyệt').first()).toBeVisible();

    await cb.goto(`/xet-duyet/${revise.id}`);
    await expect(cb.getByRole('heading', { name: 'Xét duyệt – lần gửi 2' })).toBeVisible();
    await sv.context().close();
    await cb.context().close();
  });

  test('TC-FR07-E06 cán bộ từ chối hồ sơ kèm lý do; SV thấy Bị từ chối và lý do, không còn nút gửi', async ({ browser }) => {
    const S = data();
    const { reject } = S.gd6;
    const reason = 'Đề tài trùng hướng với đề tài đang thực hiện của khoa, phạm vi chưa rõ.';
    const cb = await loggedIn(browser, S.users.cb.code);
    await cb.goto(`/xet-duyet/${reject.id}`);
    await cb.getByRole('group', { name: 'Quyết định' }).getByRole('button', { name: 'Từ chối đề tài' }).click();
    const dlg = cb.getByRole('dialog', { name: 'Từ chối hồ sơ' });
    await dlg.getByLabel('Lý do từ chối').fill('ngắn'); // < 5 ký tự sau trim? "ngắn" = 4 ký tự
    await dlg.getByRole('button', { name: 'Từ chối' }).click();
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Lý do từ chối').fill(reason);
    await dlg.getByRole('button', { name: 'Từ chối' }).click();
    await expect(cb.getByText(`Đã từ chối hồ sơ ${reject.code}`)).toBeVisible();

    const sv = await loggedIn(browser, S.users.sv16.code);
    await sv.goto(`/de-tai/${reject.id}`);
    await expect(sv.getByText('Bị từ chối', { exact: true }).first()).toBeVisible();
    await expect(sv.getByRole('note').filter({ hasText: reason })).toBeVisible();
    await expect(sv.getByRole('link', { name: /Gửi/ })).toHaveCount(0);
    await sv.context().close();
    await cb.context().close();
  });
});
