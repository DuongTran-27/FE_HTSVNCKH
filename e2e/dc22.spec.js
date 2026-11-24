import { expect, test } from '@playwright/test';
import { API_PORT } from './env.js';
import { data, db, login, overflowX, settled } from './helpers.js';

// TASK-DC-22 (FR34–FR37, FR27; M2 mục 9 DAC_TA): GVHD nhập điểm quá trình (< 5 bị chặn) → cán bộ lập hội đồng; gán đề tài có
// xung đột lợi ích bị chặn (UI + server), sửa thành viên rồi gán đúng → 3 GV chấm → thư ký chốt → cán bộ đóng → kho; SV xem kết quả.
// Tài khoản S.def.* và đề tài S.def.topic chỉ spec này dùng (prepare.js). Điểm 8,5 + 7,25 + 9 → trung bình 8,25 (Đạt – Tốt).

const SCORES = [['h1', '8.5', 'Chủ tịch'], ['h3', '7.25', 'Ủy viên'], ['h2', '9', 'Thư ký']];
const comment = (who) => `Nhận xét của ${who}: sản phẩm chạy ổn định, báo cáo trình bày rõ ràng.`;

test.describe('M2 luồng hội đồng (FR34–FR37)', () => {
  test.describe.configure({ mode: 'serial' });
  const ctxs = {};
  let councilId;
  let councilName;
  test.afterAll(async () => { for (const c of Object.values(ctxs)) await c.close(); });
  const pageFor = async (browser, code) => {
    if (!ctxs[code]) {
      ctxs[code] = await browser.newContext();
      await login(await ctxs[code].newPage(), code);
    }
    return ctxs[code].pages()[0];
  };
  const status = async () => (await db().topic.findUnique({ where: { id: data().def.topic.id } })).status;
  const noOverflow = async (page) => { await settled(page); expect(await overflowX(page), page.url()).toBeLessThanOrEqual(0); };
  // Chọn GV cho một vị trí: tìm theo mã (ô tìm chung, có debounce) rồi chọn theo nhãn "Họ tên (mã)"
  const pickLecturer = async (page, slot, u) => {
    await page.getByLabel('Tìm giảng viên').fill(u.code);
    await page.getByLabel(slot, { exact: true }).selectOption({ label: `${u.name} (${u.code})` });
  };

  test('TC-FR34-E01 GVHD đề nghị ra hội đồng: điểm 4,5 có gợi ý và bị chặn (không lưu điểm); 7,5 chuyển Chờ bảo vệ', async ({ browser }) => {
    const { topic, gv } = data().def;
    const page = await pageFor(browser, gv.code);
    await page.goto(`/de-tai/${topic.id}`);
    await page.getByRole('button', { name: 'Đề nghị ra hội đồng' }).click();
    const dlg = page.getByRole('dialog', { name: 'Đề nghị ra hội đồng' });
    await dlg.getByLabel('Điểm quá trình (thang 10)').fill('4.5');
    await expect(dlg.getByText(/Không đủ điều kiện ra hội đồng \(dưới 5,0\)/)).toBeVisible();
    await dlg.getByLabel('Nhận xét quá trình').fill('Nhóm chưa hoàn thành phần thực nghiệm, điểm quá trình thấp.');
    await dlg.getByRole('button', { name: 'Gửi đề nghị' }).click();
    await expect(dlg.getByText('Điểm quá trình dưới 5,0 – đề tài không đủ điều kiện ra hội đồng')).toBeVisible();
    await expect(dlg).toBeVisible();
    expect(await status()).toBe('IN_PROGRESS');
    expect(await db().processScore.count({ where: { topicId: topic.id } })).toBe(0); // GD7 §5.1: không lưu điểm khi bị chặn

    await dlg.getByLabel('Điểm quá trình (thang 10)').fill('7.5');
    await dlg.getByLabel('Nhận xét quá trình').fill('Nhóm làm việc đều, hoàn thành đủ mốc và báo cáo tổng kết đúng hạn.');
    await dlg.getByRole('button', { name: 'Gửi đề nghị' }).click();
    await expect(page.getByText(`Đã đề nghị ra hội đồng đề tài ${topic.code}`)).toBeVisible();
    await expect.poll(status).toBe('WAITING_DEFENSE');
    await expect(page.getByText('Chờ khoa phân công hội đồng.')).toBeVisible();
    await noOverflow(page);
  });

  test('TC-FR35-E02 cán bộ lập hội đồng có GVHD: gán bị chặn (UI + 409, không gán gì); đổi thành viên rồi gán đúng; thêm lại GVHD bị chặn', async ({ browser, request }) => {
    const S = data();
    const { topic, gv, h1, h2, h3 } = S.def;
    const page = await pageFor(browser, S.users.cb.code);
    councilName = `Hội đồng nghiệm thu E2E ${test.info().project.name} – Công nghệ phần mềm`;
    await page.goto('/hoi-dong');
    await page.getByRole('link', { name: 'Lập hội đồng' }).click();
    const roundName = S.roundLabel.split(' – ')[0];
    const roundValue = await page.getByLabel('Đợt', { exact: true }).locator('option').filter({ hasText: roundName }).first().getAttribute('value');
    await page.getByLabel('Đợt', { exact: true }).selectOption(roundValue);
    await page.getByLabel('Tên hội đồng').fill(councilName);
    await pickLecturer(page, 'Chủ tịch', h1);
    await pickLecturer(page, 'Thư ký', h2);
    await pickLecturer(page, 'Ủy viên 1', gv); // GVHD của đề tài: được ngồi hội đồng, nhưng không được chấm đề tài của mình
    await noOverflow(page);
    await page.getByRole('button', { name: 'Lập hội đồng' }).click();
    await expect(page.getByText(new RegExp(`Đã lập ${councilName} \\(HD-\\d{4}-\\d{3}\\)`))).toBeVisible();
    await expect(page).toHaveURL(/\/hoi-dong\/[^/]+$/);
    councilId = page.url().split('/').pop();

    // UI: đề tài xung đột đánh dấu đỏ, không chọn được
    await page.getByRole('button', { name: 'Gán đề tài' }).click();
    let dlg = page.getByRole('dialog', { name: `Gán đề tài cho ${councilName}` });
    await dlg.getByLabel('Tìm đề tài').fill(topic.code);
    let row = dlg.getByRole('listitem').filter({ hasText: topic.code });
    await expect(row.getByText('Xung đột: GVHD là thành viên hội đồng')).toBeVisible();
    await expect(row.getByRole('checkbox')).toBeDisabled();
    await dlg.getByRole('button', { name: 'Hủy' }).click();

    // Server vẫn kiểm (FR25: quyền/ràng buộc ở backend), tất cả hoặc không
    const api = `http://localhost:${API_PORT}/api`;
    const { accessToken } = await (await request.post(`${api}/auth/login`, { data: { identifier: S.users.cb.code, password: S.password } })).json();
    const res = await request.post(`${api}/councils/${councilId}/assignments`, { headers: { Authorization: `Bearer ${accessToken}` }, data: { topicIds: [topic.id] } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT_OF_INTEREST');
    expect(body.error.details.conflicts).toEqual([expect.objectContaining({ topicCode: topic.code, lecturerName: gv.name })]);
    expect(await db().councilAssignment.count({ where: { topicId: topic.id } })).toBe(0);

    // Đổi Ủy viên 1 từ GVHD sang GV khác rồi gán
    await page.getByRole('button', { name: 'Sửa tên và thành viên' }).click();
    await pickLecturer(page, 'Ủy viên 1', h3);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText('Đã lưu hội đồng')).toBeVisible();
    await page.getByRole('button', { name: 'Gán đề tài' }).click();
    dlg = page.getByRole('dialog', { name: `Gán đề tài cho ${councilName}` });
    await dlg.getByLabel('Tìm đề tài').fill(topic.code);
    row = dlg.getByRole('listitem').filter({ hasText: topic.code });
    await expect(row.getByText('Xung đột: GVHD là thành viên hội đồng')).toHaveCount(0);
    await row.getByRole('checkbox').check();
    await dlg.getByRole('button', { name: 'Gán 1 đề tài' }).click();
    await expect(page.getByText(`Đã gán 1 đề tài cho ${councilName}`)).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: topic.code }).getByText('Đã chấm 0/3')).toBeVisible();
    await noOverflow(page);

    // Kiểm khi đổi thành viên (FR35): đưa GVHD trở lại hội đồng đang có đề tài của họ -> hộp lỗi, thành viên giữ nguyên
    await page.getByRole('button', { name: 'Sửa tên và thành viên' }).click();
    await pickLecturer(page, 'Ủy viên 1', gv);
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText(`${gv.name} là GVHD của đề tài ${topic.code}`)).toBeVisible();
    const members = await db().councilMember.findMany({ where: { councilId }, include: { lecturer: true } });
    expect(members.map((m) => m.lecturer.code).sort()).toEqual([h1.code, h2.code, h3.code].sort());
  });

  test('TC-FR36-E03 ba thành viên chấm điểm + nhận xét; ủy viên không thấy điểm người khác trước khi chốt', async ({ browser }) => {
    const { topic, ...u } = data().def;
    for (const [k, score, role] of SCORES) {
      const page = await pageFor(browser, u[k].code);
      await page.goto('/cham-bao-ve');
      await page.getByRole('link', { name: topic.title }).click();
      await expect(page).toHaveURL(/\/cham-bao-ve\/[^/]+$/);
      const form = page.getByRole('form', { name: 'Điểm của tôi' });
      await form.getByLabel('Điểm (thang 10)').fill(score);
      await form.getByLabel('Nhận xét').fill(comment(role));
      await form.getByRole('button', { name: 'Lưu điểm' }).click();
      await expect(page.getByText('Đã lưu điểm')).toBeVisible();
      if (k === 'h3') { // Ủy viên chấm sau Chủ tịch: không thấy điểm/nhận xét của Chủ tịch (FR36)
        await page.reload();
        await expect(form.getByLabel('Điểm (thang 10)')).toHaveValue('7.25');
        await expect(page.getByText(comment('Chủ tịch'))).toHaveCount(0);
        await expect(page.getByText('Bảng điểm hội đồng')).toHaveCount(0);
      }
      await noOverflow(page);
    }
    expect(await db().defenseScore.count({ where: { assignment: { topicId: topic.id, cancelledAt: null } } })).toBe(3);
  });

  test('TC-FR37-E04 thư ký chốt 2 bước (Hủy giữ nguyên): điểm cuối 8,25 Đạt – Tốt, đề tài Chờ đóng, điểm bị khóa', async ({ browser }) => {
    const { topic, h1, h2 } = data().def;
    const page = await pageFor(browser, h2.code);
    await page.reload();
    await expect(page.getByText('Đã chấm 3/3')).toBeVisible();
    await page.getByRole('button', { name: 'Chốt nghiệm thu' }).click();
    let dlg = page.getByRole('dialog', { name: 'Chốt nghiệm thu' });
    await expect(dlg.getByText('8,25')).toBeVisible();
    await expect(dlg.getByText(/Đạt – Tốt/)).toBeVisible();
    const minutes = 'Hội đồng thống nhất đề tài đạt yêu cầu, sản phẩm hoàn chỉnh, đề nghị khoa xác nhận đóng.';
    await dlg.getByLabel('Biên bản/nhận xét chung').fill(minutes);
    await dlg.getByRole('button', { name: 'Tiếp tục' }).click();
    await expect(dlg.getByText('Hành động này sẽ khóa toàn bộ điểm và chuyển đề tài sang Chờ đóng. Bạn có chắc chắn?')).toBeVisible();
    await dlg.getByRole('button', { name: 'Hủy' }).click();
    await expect(dlg).toHaveCount(0);
    expect(await status()).toBe('WAITING_DEFENSE'); // Hủy ở bước 2: chưa chốt

    await page.getByRole('button', { name: 'Chốt nghiệm thu' }).click();
    dlg = page.getByRole('dialog', { name: 'Chốt nghiệm thu' });
    await dlg.getByLabel('Biên bản/nhận xét chung').fill(minutes);
    await dlg.getByRole('button', { name: 'Tiếp tục' }).click();
    await dlg.getByRole('button', { name: 'Chốt nghiệm thu' }).click();
    await expect(page.getByText(`Đã chốt nghiệm thu đề tài ${topic.code}`)).toBeVisible();
    await expect.poll(status).toBe('WAITING_CLOSE');
    const a = await db().councilAssignment.findFirst({ where: { topicId: topic.id, cancelledAt: null } });
    expect([String(a.finalScore), a.decision]).toEqual(['8.25', 'PASSED']);
    const result = await db().resultVersion.findFirst({ where: { topicId: topic.id, isCurrent: true } });
    expect(result.result).toBe('GOOD');

    // Sau chốt: màn chấm chỉ đọc với thành viên khác
    const chair = await pageFor(browser, h1.code);
    await chair.reload();
    await expect(chair.getByText('8,25').first()).toBeVisible();
    await expect(chair.getByRole('button', { name: /Lưu điểm|Cập nhật điểm/ })).toHaveCount(0);
  });

  test('TC-FR27-E05 cán bộ xác nhận đóng; đề tài vào Kho; SV xem điểm bảo vệ và kết quả', async ({ browser }) => {
    const S = data();
    const { topic, sv } = S.def;
    const page = await pageFor(browser, S.users.cb.code);
    await page.goto(`/de-tai/${topic.id}`);
    await page.getByRole('button', { name: 'Xác nhận đóng đề tài' }).click();
    await page.getByRole('dialog', { name: 'Xác nhận đóng đề tài' }).getByRole('button', { name: 'Xác nhận đóng đề tài' }).click();
    await expect(page.getByText('Đã đóng đề tài').first()).toBeVisible();
    await expect.poll(status).toBe('CLOSED');
    await page.goto(`/kho?q=${encodeURIComponent(topic.title)}`);
    await expect(page.getByRole('link', { name: `${topic.code} – ${topic.title}` })).toBeVisible();

    const st = await pageFor(browser, sv.code);
    await st.goto(`/de-tai/${topic.id}`);
    const box = st.locator('div').filter({ has: st.getByRole('heading', { name: 'Bảo vệ trước hội đồng' }) }).last();
    await expect(box.getByText('8,25')).toBeVisible();
    await expect(box.getByText('Đạt', { exact: true })).toBeVisible();
    await expect(box.getByText(new RegExp(`Hội đồng HD-\\d{4}-\\d{3} – ${councilName}`))).toBeVisible();
    await noOverflow(st);
  });
});
