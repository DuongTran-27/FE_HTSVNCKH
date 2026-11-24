import { expect, test } from '@playwright/test';
import { JUSTIFICATION, data, db, loggedIn } from './helpers.js';

// UI GĐ6 với backend thật cho FR18, FR19, FR20, FR22, FR23 (trước đây chỉ có integration + test component, TRUY_VET §4).
// Dữ liệu dựng sẵn ở prepare.js (S.gd6.change/adv/cancel/reopen/result); kết quả cuối kiểm bằng db() chỉ đọc.

const REASON = 'Lý do kiểm thử E2E đủ dài để hợp lệ.';

/** Cán bộ mở trang yêu cầu của đề tài, bấm Duyệt trên thẻ duy nhất và xác nhận trong hộp thoại */
async function staffApprove(browser, S, topicId, dialogName, confirm, reason) {
  const cb = await loggedIn(browser, S.users.cb.code);
  await cb.goto(`/de-tai/${topicId}/yeu-cau`);
  await cb.getByTestId('change-request').getByRole('button', { name: 'Duyệt', exact: true }).click();
  const dlg = cb.getByRole('dialog', { name: dialogName });
  if (reason) await dlg.getByLabel('Lý do').fill(reason);
  await dlg.getByRole('button', { name: confirm, exact: true }).click();
  await expect(cb.getByText('Đã cập nhật yêu cầu')).toBeVisible();
  await cb.context().close();
}

test.describe('FR18–FR20 yêu cầu thay đổi sau duyệt', () => {
  test('TC-FR18-E01 SV đổi tên đề tài đang thực hiện, cán bộ duyệt: hồ sơ cập nhật, không tạo lần gửi mới', async ({ browser }) => {
    const S = data();
    const { change } = S.gd6;
    const newTitle = `${change.title} – bản đổi tên`;
    const sv = await loggedIn(browser, S.users.sv11.code);
    await sv.goto(`/de-tai/${change.id}/yeu-cau`);
    await sv.getByRole('button', { name: 'Thay đổi hồ sơ' }).click();
    const form = sv.getByRole('dialog', { name: 'Thay đổi sau duyệt' });
    await form.getByLabel('Tên đề tài').fill(newTitle);
    await form.getByLabel('Lý do').fill(REASON);
    await form.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    // Tên mới được kiểm trùng lại (FR06): trùng cao với đề tài cùng mẫu của bộ dữ liệu kia → bắt buộc giải trình, thông điệp nói rõ
    await expect(form.getByRole('alert')).toContainText('cần giải trình');
    await form.getByLabel('Giải trình (bắt buộc)').fill(JUSTIFICATION);
    await form.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect(sv.getByText('Đã gửi yêu cầu')).toBeVisible();
    await sv.context().close();

    const before = await db().submission.count({ where: { topicId: change.id } });
    await staffApprove(browser, S, change.id, 'Duyệt yêu cầu', 'Duyệt');
    const t = await db().topic.findUnique({ where: { id: change.id } });
    expect(t).toMatchObject({ title: newTitle, status: 'IN_PROGRESS' });
    expect(await db().submission.count({ where: { topicId: change.id } })).toBe(before);
  });

  test('TC-FR19-E01 SV đề nghị thay giảng viên, giảng viên mới đồng ý, cán bộ duyệt: giảng viên hướng dẫn hiện hành đổi', async ({ browser }) => {
    const S = data();
    const { adv } = S.gd6;
    const sv = await loggedIn(browser, S.users.sv7.code);
    await sv.goto(`/de-tai/${adv.id}/yeu-cau`);
    await sv.getByRole('button', { name: 'Thay giảng viên' }).click();
    const form = sv.getByRole('dialog', { name: 'Thay giảng viên' });
    await form.getByLabel('Tìm giảng viên').fill(S.users.gv3.code);
    await expect(form.getByLabel('Giảng viên mới').locator(`option[value="${S.users.gv3.id}"]`)).toHaveCount(1);
    await form.getByLabel('Giảng viên mới').selectOption(S.users.gv3.id);
    await form.getByLabel('Lý do').fill(REASON);
    await form.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect(sv.getByText('Đã gửi yêu cầu')).toBeVisible();
    await sv.context().close();

    const gv = await loggedIn(browser, S.users.gv3.code);
    await gv.goto(`/de-tai/${adv.id}/yeu-cau`);
    await gv.getByTestId('change-request').getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await gv.getByRole('dialog', { name: 'Đồng ý yêu cầu' }).getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(gv.getByText('Đã cập nhật yêu cầu')).toBeVisible();
    await gv.context().close();

    await staffApprove(browser, S, adv.id, 'Duyệt yêu cầu', 'Duyệt');
    const current = await db().advising.findFirst({ where: { topicId: adv.id, endAt: null } });
    expect(current.lecturerId).toBe(S.users.gv3.id);
  });

  test('TC-FR20-E01 trưởng nhóm đề nghị hủy, cán bộ duyệt kèm lý do: đề tài Đã hủy, không bị xóa, có lịch sử', async ({ browser }) => {
    const S = data();
    const { cancel } = S.gd6;
    const sv = await loggedIn(browser, S.users.sv8.code);
    await sv.goto(`/de-tai/${cancel.id}/yeu-cau`);
    await sv.getByRole('button', { name: 'Đề nghị hủy đề tài' }).click();
    const form = sv.getByRole('dialog', { name: 'Hủy đề tài' });
    await form.getByLabel('Lý do').fill(REASON);
    await form.getByRole('button', { name: 'Gửi yêu cầu' }).click();
    await expect(sv.getByText('Đã gửi yêu cầu')).toBeVisible();

    await staffApprove(browser, S, cancel.id, 'Duyệt hủy đề tài', 'Duyệt hủy', 'Nhóm không đủ điều kiện tiếp tục thực hiện.');
    expect((await db().topic.findUnique({ where: { id: cancel.id } })).status).toBe('CANCELLED');
    expect(await db().statusHistory.count({ where: { topicId: cancel.id, to: 'CANCELLED' } })).toBe(1);
    await sv.goto(`/de-tai/${cancel.id}`);
    await expect(sv.getByText('Đã hủy').first()).toBeVisible();
    await sv.context().close();
  });
});

test.describe('FR22, FR23 mở lại mốc và sửa kết quả', () => {
  test('TC-FR22-E01 giảng viên hướng dẫn mở lại mốc đã Đạt kèm lý do: mốc không còn Đạt, hiện ghi chú mở lại', async ({ browser }) => {
    const S = data();
    const { reopen } = S.gd6;
    const gv = await loggedIn(browser, S.users.gv2.code);
    await gv.goto(`/de-tai/${reopen.id}/moc`);
    await gv.getByRole('button', { name: 'Mở lại mốc' }).click();
    const dlg = gv.getByRole('dialog', { name: 'Mở lại mốc' });
    await dlg.getByLabel('Lý do').fill('Báo cáo thiếu phần số liệu thực nghiệm.');
    await dlg.getByRole('button', { name: 'Mở lại', exact: true }).click();
    await expect(gv.getByText('Đã mở lại mốc')).toBeVisible();
    await expect(gv.getByTestId('reopen-note')).toContainText('Đã mở lại 1 lần');
    const m = await db().milestone.findFirst({ where: { topicId: reopen.id } });
    expect(m.evaluation).not.toBe('PASSED');
    await gv.context().close();
  });

  test('TC-FR23-E01 cán bộ sửa kết quả đề tài đã đóng: tạo phiên bản 2 hiện hành, phiên bản 1 vẫn lưu', async ({ browser }) => {
    const S = data();
    const { result } = S.gd6;
    const cb = await loggedIn(browser, S.users.cb.code);
    await cb.goto(`/de-tai/${result.id}`);
    await cb.getByRole('button', { name: 'Sửa kết quả' }).click();
    const form = cb.getByRole('form', { name: 'Sửa kết quả' });
    await form.getByLabel('Kết quả').selectOption('EXCELLENT');
    await form.getByLabel('Lý do sửa').fill('Hội đồng chấm lại sau phúc khảo, nâng kết quả.');
    await form.getByRole('button', { name: 'Lưu phiên bản mới' }).click();
    await expect(cb.getByText('Đã sửa kết quả, tạo phiên bản mới')).toBeVisible();
    const versions = await db().resultVersion.findMany({ where: { topicId: result.id }, orderBy: { version: 'asc' } });
    expect(versions.map((v) => [v.version, v.result, v.isCurrent])).toEqual([[1, 'GOOD', false], [2, 'EXCELLENT', true]]);
    await cb.context().close();
  });
});
