import { expect, test } from '@playwright/test';
import { JUSTIFICATION, data, db, login, overflowX, settled } from './helpers.js';

// TASK-DC-21 (FR31–FR33, M1 mục 9 DAC_TA): GV tạo đề tài tuyển → công bố (FR06 HIGH bắt buộc giải trình) → 2 SV ứng tuyển
// → GV nhận 1, từ chối 1 (bắt buộc lý do) → chốt nhóm → trưởng nhóm gửi xét duyệt → cán bộ duyệt.
// Chạy ở cả project desktop (1280) và mobile (360, NFR07); tài khoản S.rec.* chỉ spec này dùng (prepare.js).

test.describe('M1 luồng tuyển sinh viên (FR31–FR33)', () => {
  test.describe.configure({ mode: 'serial' });
  const ctxs = {};
  let topicId;
  let code;
  test.afterAll(async () => { for (const c of Object.values(ctxs)) await c.close(); });
  const pageFor = async (browser, code) => {
    if (!ctxs[code]) {
      ctxs[code] = await browser.newContext();
      await login(await ctxs[code].newPage(), code);
    }
    return ctxs[code].pages()[0];
  };
  const noOverflow = async (page) => { await settled(page); expect(await overflowX(page), page.url()).toBeLessThanOrEqual(0); };

  test('TC-FR31-E01 GV tạo đề tài tuyển, nhập yêu cầu + số SV; công bố: FR06 nghi trùng cao bắt buộc giải trình', async ({ browser }) => {
    const S = data();
    const { gv, content: c } = S.rec;
    const page = await pageFor(browser, gv.code);
    await page.goto('/tuyen-sinh');
    await page.getByRole('link', { name: 'Công bố đề tài tuyển sinh viên' }).click();
    await page.getByLabel('Đợt đăng ký').selectOption({ label: S.roundLabel });
    await page.getByLabel(/Tên đề tài/).fill(c.title);
    await page.getByRole('button', { name: 'Tạo nháp' }).click();
    await expect(page.getByRole('heading', { name: 'Soạn hồ sơ' })).toBeVisible();
    topicId = page.url().match(/de-tai\/([^/]+)\/sua/)[1];
    code = (await page.getByTestId('topic-code').innerText()).trim();

    await page.getByLabel('Tóm tắt').fill(c.summary);
    await page.getByLabel('Mục tiêu').fill(c.objectives);
    const kw = page.getByLabel('Từ khóa', { exact: true });
    for (const k of c.keywords) { await kw.fill(k); await kw.press('Enter'); }
    await page.getByLabel('Lĩnh vực').selectOption({ label: c.fieldName });
    await page.getByLabel('Yêu cầu ứng viên').fill('Sinh viên đã học Cấu trúc dữ liệu, biết Python; ưu tiên bạn thích xử lý tiếng Việt.');
    await page.getByLabel('Số sinh viên cần tuyển').fill('2');
    await page.getByRole('button', { name: 'Lưu nháp' }).click();
    await expect(page.getByText('Đã lưu nháp')).toBeVisible();
    await noOverflow(page);

    await page.goto(`/de-tai/${topicId}`);
    await page.getByRole('link', { name: 'Công bố tuyển sinh viên' }).click();
    await expect(page.getByTestId('similarity-panel')).toHaveAttribute('data-level', 'HIGH');
    const publish = page.getByRole('button', { name: 'Công bố tuyển sinh viên', exact: true });
    await expect(publish).toBeDisabled(); // HIGH: chưa giải trình thì không công bố được
    await page.getByLabel(/Giải trình/).fill('quá ngắn');
    await expect(publish).toBeDisabled();
    await page.getByLabel(/Giải trình/).fill(JUSTIFICATION);
    await expect(publish).toBeEnabled();
    await noOverflow(page);
    await publish.click();
    await expect(page.getByText('Đã công bố đề tài, sinh viên có thể ứng tuyển')).toBeVisible();
    await expect.poll(async () => (await db().topic.findUnique({ where: { id: topicId } })).status).toBe('RECRUITING');
  });

  test('TC-FR32-E02 hai SV ứng tuyển từ bảng tin; đơn chờ ẩn form; SV không thấy ứng viên khác', async ({ browser }) => {
    const S = data();
    const { svA, svB, content: c } = S.rec;
    for (const sv of [svA, svB]) {
      const page = await pageFor(browser, sv.code);
      await page.goto('/tuyen-sinh');
      await noOverflow(page);
      await page.getByRole('link', { name: c.title }).click();
      await expect(page).toHaveURL(new RegExp(`/tuyen-sinh/${topicId}$`));
      await page.getByLabel('Lời giới thiệu').fill(`Em là ${sv.name}, đã học Python và muốn tham gia đề tài xử lý tiếng Việt có dấu.`);
      await page.getByRole('button', { name: 'Gửi ứng tuyển' }).click();
      await expect(page.getByText('Đã gửi đơn ứng tuyển')).toBeVisible();
      await expect(page.getByText('Đang chờ duyệt').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Gửi ứng tuyển' })).toHaveCount(0); // một đơn còn hiệu lực mỗi đề tài
      await noOverflow(page);
    }
    const pb = await pageFor(browser, svB.code);
    await expect(pb.getByText(svA.name)).toHaveCount(0); // bảng tin/chi tiết không lộ ứng viên (FR32)
    await expect.poll(() => db().topicApplication.count({ where: { topicId, status: 'PENDING' } })).toBe(2);
  });

  test('TC-FR33-E03 GV nhận 1 đơn, từ chối 1 đơn (bắt buộc lý do), chốt nhóm; người nhận đầu tiên là trưởng nhóm', async ({ browser }) => {
    const S = data();
    const { gv, svA, svB } = S.rec;
    const page = await pageFor(browser, gv.code);
    await page.goto(`/de-tai/${topicId}/ung-vien`);
    await noOverflow(page);
    await page.getByRole('listitem').filter({ hasText: svA.code }).getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await page.getByRole('dialog', { name: 'Nhận sinh viên' }).getByRole('button', { name: 'Đồng ý' }).click();
    await expect(page.getByText('Đã nhận sinh viên vào đề tài')).toBeVisible();
    await expect(page.getByText('1/2 đã nhận')).toBeVisible();

    await page.getByRole('listitem').filter({ hasText: svB.code }).getByRole('button', { name: 'Từ chối', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Từ chối đơn ứng tuyển' });
    await dlg.getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(dlg).toBeVisible(); // thiếu lý do -> không gửi
    const reason = 'Nhóm cần bạn có kinh nghiệm xử lý ngôn ngữ tự nhiên tiếng Việt.';
    await dlg.getByLabel('Lý do từ chối').fill(reason);
    await dlg.getByRole('button', { name: 'Từ chối', exact: true }).click();
    await expect(page.getByText('Đã từ chối đơn ứng tuyển')).toBeVisible();

    await page.getByRole('button', { name: 'Chốt nhóm' }).click();
    await page.getByRole('dialog', { name: 'Chốt nhóm' }).getByRole('button', { name: 'Chốt nhóm' }).click();
    await expect(page.getByText('Đã chốt nhóm')).toBeVisible();
    await expect.poll(async () => (await db().topic.findUnique({ where: { id: topicId } })).status).toBe('HAS_ADVISOR');
    const members = await db().topicMember.findMany({ where: { topicId, leftAt: null }, include: { user: true } });
    expect(members.map((m) => [m.user.code, m.role])).toEqual([[svA.code, 'LEADER']]);

    const pb = await pageFor(browser, svB.code);
    await pb.goto('/don-ung-tuyen');
    await expect(pb.getByText('Bị từ chối', { exact: true })).toBeVisible();
    await expect(pb.getByText(`Lý do từ chối: ${reason}`)).toBeVisible();
    await noOverflow(pb);
  });

  test('TC-FR33-E04 trưởng nhóm gửi xét duyệt (giải trình HIGH), cán bộ duyệt -> Đang thực hiện', async ({ browser }) => {
    const S = data();
    const { svA } = S.rec;
    const page = await pageFor(browser, svA.code);
    await page.goto('/don-ung-tuyen');
    await page.getByRole('link', { name: 'Vào đề tài' }).click();
    await expect(page).toHaveURL(new RegExp(`/de-tai/${topicId}$`));
    await page.goto(`/de-tai/${topicId}/gui`);
    await expect(page.getByTestId('similarity-panel')).toHaveAttribute('data-level', 'HIGH');
    const send = page.getByRole('button', { name: 'Gửi xét duyệt', exact: true });
    await expect(send).toBeDisabled();
    await page.getByLabel(/Giải trình/).fill(JUSTIFICATION);
    await noOverflow(page);
    await send.click();
    await expect(page.getByText(/Đã gửi hồ sơ lần 1/)).toBeVisible();

    const cb = await pageFor(browser, S.users.cb.code);
    await cb.goto('/xet-duyet');
    await cb.getByRole('link', { name: new RegExp(code) }).click();
    await expect(cb.getByRole('heading', { name: 'Xét duyệt – lần gửi 1' })).toBeVisible();
    await cb.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await cb.getByRole('dialog').getByRole('button', { name: 'Duyệt', exact: true }).click();
    await expect(cb.getByText(`Đã duyệt hồ sơ ${code}`)).toBeVisible();
    await expect.poll(async () => (await db().topic.findUnique({ where: { id: topicId } })).status).toBe('IN_PROGRESS');
    await page.goto(`/de-tai/${topicId}`);
    await expect(page.getByText('Đang thực hiện').first()).toBeVisible();
    await noOverflow(page);
  });
});
