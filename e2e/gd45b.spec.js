import { expect, test } from '@playwright/test';
import { data, db, loggedIn } from './helpers.js';

// UI với backend thật cho FR04 (đợt, thứ tự mốc), FR09 (mốc thực hiện, đổi hạn có lý do), FR10 (cập nhật tiến độ)
// – trước đây chỉ có integration + test component (TRUY_VET §4). Dùng đề tài S.gd6.change (IN_PROGRESS, GVHD gv2, trưởng nhóm sv11):
// không spec nào khác kiểm mốc/tiến độ của đề tài này.

/** datetime-local theo giờ máy chạy test, cách hiện tại `days` ngày */
const local = (days) => {
  const d = new Date(Date.now() + days * 86_400_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

test('TC-FR04-E01 cán bộ tạo đợt: mốc sai thứ tự bị chặn tại ô, sửa đúng thì tạo được', async ({ browser }) => {
  const S = data();
  const name = `Đợt E2E FR04 ${test.info().project.name}`;
  const cb = await loggedIn(browser, S.users.cb.code);
  await cb.goto('/quan-ly/dot/moi');
  await cb.getByLabel('Khoa').selectOption({ label: 'Khoa Công nghệ Thông tin' });
  await cb.getByLabel('Tên đợt').fill(name);
  await cb.getByLabel('Năm học').fill('2027-2028');
  await cb.getByLabel('Mở đăng ký').fill(local(10));
  await cb.getByLabel('Đóng đăng ký').fill(local(5)); // trước mở đăng ký
  await cb.getByLabel('Hạn xét duyệt').fill(local(40));
  await cb.getByLabel('Kết thúc').fill(local(200));
  await cb.getByRole('button', { name: 'Tạo đợt' }).click();
  await expect(cb.getByText('Các mốc phải theo thứ tự').first()).toBeVisible();
  expect(await db().round.count({ where: { name } })).toBe(0);

  await cb.getByLabel('Đóng đăng ký').fill(local(30));
  await cb.getByRole('button', { name: 'Tạo đợt' }).click();
  await expect(cb.getByText('Đã tạo đợt')).toBeVisible();
  const r = await db().round.findFirst({ where: { name } });
  expect(r.regOpenAt < r.regCloseAt && r.regCloseAt < r.reviewDeadline && r.reviewDeadline < r.endAt).toBe(true);
  await cb.context().close();
});

test('TC-FR09-E01 giảng viên hướng dẫn thêm mốc rồi đổi hạn kèm lý do: có lịch sử đổi hạn', async ({ browser }) => {
  const S = data();
  const { change } = S.gd6;
  const mname = `Mốc E2E FR09 ${test.info().project.name}`;
  const gv = await loggedIn(browser, S.users.gv2.code);
  await gv.goto(`/de-tai/${change.id}/moc`);
  await gv.getByRole('button', { name: 'Thêm mốc' }).click();
  await gv.getByLabel('Tên mốc').fill(mname);
  await gv.getByLabel('Đầu ra yêu cầu').fill('Báo cáo PDF và mã nguồn');
  await gv.getByLabel('Hạn (giờ Việt Nam)').fill(local(20));
  await gv.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(gv.getByText('Đã thêm mốc')).toBeVisible();
  await expect(gv.getByText(mname)).toBeVisible();

  const card = gv.getByRole('listitem').filter({ hasText: mname });
  await card.getByRole('button', { name: 'Đổi hạn' }).click();
  await gv.getByLabel('Hạn mới (giờ Việt Nam)').fill(local(35));
  await gv.getByLabel('Lý do đổi hạn').fill('Nhóm cần thêm thời gian thu thập dữ liệu thực nghiệm.');
  await gv.getByRole('form', { name: 'Đổi hạn mốc' }).getByRole('button', { name: 'Đổi hạn', exact: true }).click();
  await expect(gv.getByText('Đã đổi hạn mốc')).toBeVisible();
  const m = await db().milestone.findFirst({ where: { topicId: change.id, name: mname }, include: { dueChanges: true } });
  expect(m.dueChanges).toHaveLength(1);
  expect(m.dueChanges[0].reason).toContain('thu thập dữ liệu');
  await gv.context().close();
});

test('TC-FR10-E01 trưởng nhóm gửi cập nhật tiến độ: hiện trong danh sách, lưu đúng phần trăm', async ({ browser }) => {
  const S = data();
  const { change } = S.gd6;
  const done = `Hoàn thành khảo sát và thiết kế cơ sở dữ liệu (${test.info().project.name})`;
  const sv = await loggedIn(browser, S.users.sv11.code);
  await sv.goto(`/de-tai/${change.id}/tien-do`);
  await sv.getByRole('button', { name: 'Cập nhật tiến độ' }).click();
  await sv.getByLabel('Việc đã làm').fill(done);
  await sv.getByLabel('Khó khăn').fill('Thiếu dữ liệu thật để thử nghiệm.');
  await sv.getByLabel('Kế hoạch tới').fill('Xây dựng bản mẫu và kiểm thử.');
  await sv.getByLabel('Phần trăm hoàn thành (tự khai, 0–100)').fill('40');
  await sv.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(sv.getByText('Đã gửi cập nhật tiến độ')).toBeVisible();
  await expect(sv.getByText(done)).toBeVisible();
  const p = await db().progressUpdate.findFirst({ where: { topicId: change.id, done } });
  expect(p.percent).toBe(40);
  await sv.context().close();
});
