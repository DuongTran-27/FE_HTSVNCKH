// Dựng DB E2E: tạo nckh_t309_test nếu chưa có, reset, nạp seed T203 + dữ liệu riêng của E2E, ghi state.json.
// T702: mỗi project Playwright (desktop, mobile) có bộ tài khoản/đề tài riêng (tiền tố mã khác nhau) để hai project
// chạy cùng một DB mà không giẫm dữ liệu của nhau. state.json = { desktop: {...}, mobile: {...} }.
import process from 'node:process';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { API_ENV, BACKEND_DIR, DATASETS, DB_NAME, OUT_DIR, STATE_FILE, TEMPLATE_URL } from './env.js';

Object.assign(process.env, API_ENV);
const apiDir = BACKEND_DIR;
// @prisma/client chỉ cài ở repo backend (đã chạy npm ci + prisma generate ở đó)
const { PrismaClient } = createRequire(path.join(apiDir, 'package.json'))('@prisma/client');
const fromApi = (file) => import(pathToFileURL(path.join(apiDir, file)).href);

const admin = new PrismaClient({ datasourceUrl: TEMPLATE_URL });
try {
  // DB_NAME là hằng trong env.js, không nhận input ngoài -> nối chuỗi an toàn (MINOR 3 reviews/T309-reviewer-v1.md)
  const found = await admin.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`);
  if (!found.length) await admin.$executeRawUnsafe(`CREATE DATABASE ${DB_NAME}`);
} finally {
  await admin.$disconnect();
}
execSync('npm run db:test:reset', { cwd: apiDir, stdio: 'inherit', env: process.env });

const { seed, SEED_PASSWORD } = await fromApi('prisma/seed.js');
const { nextTopicCode } = await fromApi('src/modules/topics/code.js');
const prisma = new PrismaClient();
const DAY = 86_400_000;
const words = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i + 1}`).join(' ');

async function buildDataset(P) {
  const [round, base] = [await prisma.round.findFirst(), await prisma.user.findUnique({ where: { code: 'QT001' } })];
  const faculty = await prisma.faculty.findFirst({ where: { code: 'CNTT' } });
  const mkIn = (fac) => (role, code, fullName) => prisma.user.create({ data: { code, email: `${code.toLowerCase()}@nckh.example`, fullName, passwordHash: base.passwordHash, role, mustChangePassword: false, facultyId: fac.id } });
  const mk = mkIn(faculty);
  const [sv1, sv2, sv3, gv, cb] = [
    await mk('STUDENT', `SV${P}1`, `Nguyễn Thị Đào ${P}`), await mk('STUDENT', `SV${P}2`, `Trần Văn Ê ${P}`), await mk('STUDENT', `SV${P}3`, `Lê Văn Mobile ${P}`),
    await mk('LECTURER', `GV${P}`, `TS. Phạm Đức ${P}`), await mk('STAFF', `CB${P}`, `Võ Thị Cán Bộ ${P}`),
  ];
  await prisma.staffScope.create({ data: { userId: cb.id, facultyId: faculty.id } });

  const inProg = await prisma.topic.findMany({ where: { status: 'IN_PROGRESS', code: { startsWith: 'NCKH' } }, include: { field: true }, orderBy: { code: 'asc' }, take: 2 });
  const content = (t) => ({ title: t.title, summary: t.summary, objectives: t.objectives, keywords: t.keywords, fieldName: t.field.name });
  const m = inProg[1];
  const topic = (tx, data) => tx.topic.create({ data: { roundId: round.id, facultyId: faculty.id, fieldId: m.fieldId, ...data } });
  const code = (tx) => nextTopicCode(tx, round.academicYear);
  const advise = async (tx, topicId, lecturerId) => {
    await tx.advisorRequest.create({ data: { topicId, lecturerId, status: 'ACCEPTED', respondedAt: new Date() } });
    await tx.advising.create({ data: { topicId, lecturerId, startAt: new Date(Date.now() - 20 * DAY) } });
  };
  // Đề tài SV3 (ca 360 px) ở HAS_ADVISOR, nội dung trùng đề tài đang thực hiện thứ hai -> HIGH
  const mobile = await prisma.$transaction(async (tx) => {
    const t = await topic(tx, { code: await code(tx), title: m.title, summary: m.summary, objectives: m.objectives, keywords: m.keywords, status: 'HAS_ADVISOR', version: 2 });
    await tx.topicMember.create({ data: { topicId: t.id, userId: sv3.id, role: 'LEADER' } });
    await advise(tx, t.id, gv.id);
    return t;
  });
  // Đề tài đã đóng kết quả FAIL: không được xuất hiện trong kho
  const failTopic = await prisma.$transaction(async (tx) => {
    const t = await topic(tx, { code: await code(tx), title: `Đề tài đóng không đạt ${P}`, summary: 'Tóm tắt đề tài không đạt dùng cho kiểm thử kho.', objectives: 'Mục tiêu', keywords: ['không đạt'], status: 'CLOSED', version: 9 });
    await tx.topicMember.create({ data: { topicId: t.id, userId: sv2.id, role: 'LEADER' } });
    await tx.resultVersion.create({ data: { topicId: t.id, version: 1, result: 'FAIL', summary: 'Không đạt', createdById: cb.id } });
    return t;
  });
  // GĐ4 (T407): hai đề tài IN_PROGRESS có GVHD gv; "flow" chạy đủ luồng đóng, "neg" không đủ điều kiện (ca âm + 360 px)
  const [sv4, sv5] = [await mk('STUDENT', `SV${P}4`, `Đặng Thị Hạnh ${P}`), await mk('STUDENT', `SV${P}5`, `Bùi Văn Di Động ${P}`)];
  const mkExec = (sv, title, milestones, lecturer = gv) => prisma.$transaction(async (tx) => {
    const t = await topic(tx, { code: await code(tx), title, summary: 'Tóm tắt đề tài thực hiện dùng cho kiểm thử E2E giai đoạn 4.', objectives: 'Mục tiêu', keywords: ['thực hiện'], status: 'IN_PROGRESS', version: 5 });
    await tx.topicMember.create({ data: { topicId: t.id, userId: sv.id, role: 'LEADER', joinedAt: new Date(Date.now() - 30 * DAY) } });
    await advise(tx, t.id, lecturer.id);
    for (const [i, [name, dueMs, evaluation = 'PENDING']] of milestones.entries()) {
      await tx.milestone.create({ data: { topicId: t.id, order: i + 1, name, output: 'Báo cáo PDF', dueAt: new Date(Date.now() + dueMs), required: true, evaluation, createdById: lecturer.id } });
    }
    return t;
  });
  const flow = await mkExec(sv4, `Đề tài thực hiện ${P} luồng đóng`, [['Báo cáo giữa kỳ E2E', 30 * DAY], ['Báo cáo cuối kỳ E2E', -2 * DAY]]);
  const neg = await mkExec(sv5, `Đề tài thực hiện ${P} chưa đủ điều kiện`, [['Mốc chưa đạt E2E', 30 * DAY]]);
  // GĐ5 (T505): SV riêng có 3 thông báo (2 chưa đọc); không sự kiện nghiệp vụ nào của spec khác báo cho SV này
  const sv6 = await mk('STUDENT', `SV${P}6`, `Hồ Thị Chuông ${P}`);
  for (const [i, readAt] of [[1, null], [2, null], [3, new Date()]]) {
    await prisma.notification.create({ data: { userId: sv6.id, type: 'MILESTONE_CREATED', title: `Thông báo chuông E2E số ${i}`, link: '/', dedupeKey: `T505:${P}:${i}`, readAt } });
  }

  // ---------- T702 (GĐ6 + vai trò) ----------
  const gv2 = await mk('LECTURER', `GV${P}B`, `TS. Lý Thị Hướng Dẫn ${P}`); // GVHD các đề tài GĐ6
  const gv3 = await mk('LECTURER', `GV${P}C`, `TS. Mai Văn Thay Thế ${P}`); // GV mới (FR19) + GVHD đề tài xét duyệt
  const sv = {};
  const names = { 7: 'Phan Văn Đổi Thầy', 8: 'Vũ Thị Hủy', 9: 'Đỗ Văn Trưởng', 10: 'Ngô Thị Rời Nhóm', 11: 'Lâm Văn Đổi Hồ Sơ', 12: 'Tạ Thị Được Thêm', 13: 'Quách Văn Mở Lại', 14: 'Kiều Thị Kết Quả', 15: 'Hà Văn Chỉnh Sửa', 16: 'Tôn Thị Từ Chối', 17: 'Mạc Văn Chưa Kiểm', 18: 'La Thị Nháp', 19: 'Cù Văn Rời Sớm' };
  for (const [i, n] of Object.entries(names)) sv[i] = await mk('STUDENT', `SV${P}${i}`, `${n} ${P}`);
  // Cán bộ khoa khác (phạm vi chỉ khoa KT…): mọi đề tài CNTT phải 403 (FR25)
  const otherFaculty = await prisma.faculty.create({ data: { code: `KT${P}`, name: `Khoa Kinh tế ${P}` } });
  const cbx = await mkIn(otherFaculty)('STAFF', `CBX${P}`, `Khúc Thị Khoa Khác ${P}`);
  await prisma.staffScope.create({ data: { userId: cbx.id, facultyId: otherFaculty.id } });

  const summary = (tag) => `Đề tài kiểm thử ${tag} xây dựng hệ thống hỗ trợ nghiên cứu khoa học sinh viên. ${words(110, tag)}`;
  const body = (tag) => ({ title: `Đề tài ${tag} ${P} – ứng dụng tiếng Việt có dấu`, summary: summary(tag), objectives: `Mục tiêu đề tài ${tag}`, keywords: [`${tag}a`, `${tag}b`, `${tag}c`] });
  const check = (tx, topicId, status = 'OK') => tx.similarityCheck.create({ data: {
    topicId, algorithmVersion: 'e2e', thresholds: {}, contentHash: 'e2e', corpusSize: 0, matches: [], status,
    level: status === 'OK' ? 'NONE' : null, errorMessage: status === 'OK' ? null : 'Lỗi giả lập E2E',
  } });
  const sub = async (tx, t, seq, payload, by, at) => tx.submission.create({ data: {
    topicId: t.id, seq, payload: { ...payload, documentIds: [] }, createdById: by.id, createdAt: at, similarityCheckId: (await check(tx, t.id)).id,
  } });
  const mkTopic = (status, leader, { members = [], lecturer = gv2, content: c, milestone, version = 6 } = {}) => prisma.$transaction(async (tx) => {
    const t = await topic(tx, { code: await code(tx), ...c, status, version });
    await tx.topicMember.create({ data: { topicId: t.id, userId: leader.id, role: 'LEADER', joinedAt: new Date(Date.now() - 30 * DAY) } });
    for (const u of members) await tx.topicMember.create({ data: { topicId: t.id, userId: u.id, role: 'MEMBER', joinedAt: new Date(Date.now() - 30 * DAY) } });
    if (lecturer) await advise(tx, t.id, lecturer.id);
    if (milestone) await tx.milestone.create({ data: { topicId: t.id, order: 1, name: milestone, output: 'Báo cáo PDF', dueAt: new Date(Date.now() + 20 * DAY), required: true, evaluation: 'PASSED', createdById: gv2.id } });
    return t;
  });
  const adv = await mkTopic('IN_PROGRESS', sv[7], { content: body('thaygv') });
  const cancel = await mkTopic('IN_PROGRESS', sv[8], { content: body('huy') });
  const leaveC = body('roinhom');
  const leave = await mkTopic('IN_PROGRESS', sv[9], { members: [sv[10]], content: leaveC });
  // hai lần gửi trong thời gian SV10 còn là thành viên -> sau khi rời vẫn đọc được (FR21, API_GD6 §5.4)
  await prisma.$transaction(async (tx) => {
    await sub(tx, leave, 1, { ...leaveC, summary: `${leaveC.summary} bản đầu` }, sv[9], new Date(Date.now() - 10 * DAY));
    await sub(tx, leave, 2, { ...leaveC, summary: `${leaveC.summary} bản sửa có thêm phần đánh giá` }, sv[9], new Date(Date.now() - 5 * DAY));
  });
  const change = await mkTopic('IN_PROGRESS', sv[11], { content: body('doihoso') });
  const reopen = await mkTopic('IN_PROGRESS', sv[13], { content: body('molai'), milestone: 'Mốc đã đạt cần mở lại' });
  const result = await mkTopic('CLOSED', sv[14], { content: body('ketqua'), version: 12 });
  await prisma.resultVersion.create({ data: { topicId: result.id, version: 1, result: 'GOOD', summary: 'Nhóm hoàn thành tốt, báo cáo đầy đủ và trình bày rõ ràng.', createdById: gv2.id } });
  const mkReview = async (leader, tag) => {
    const c = body(tag);
    const t = await mkTopic('UNDER_REVIEW', leader, { lecturer: gv3, content: c, version: 4 });
    await prisma.$transaction((tx) => sub(tx, t, 1, c, leader, new Date(Date.now() - DAY)));
    return t;
  };
  const revise = await mkReview(sv[15], 'chinhsua');
  const reject = await mkReview(sv[16], 'tuchoi');
  // G5: HAS_ADVISOR, lần kiểm gần nhất ERROR -> cán bộ được "Cho phép gửi khi chưa kiểm tra"
  const g5 = await mkTopic('HAS_ADVISOR', sv[17], { lecturer: gv3, content: body('chuakiem'), version: 3 });
  await prisma.$transaction((tx) => check(tx, g5.id, 'ERROR'));
  // FR21 trước duyệt: DRAFT, thành viên rời ngay
  const draft = await mkTopic('DRAFT', sv[18], { members: [sv[19]], lecturer: null, content: { title: `Đề tài nháp ${P}` }, version: 1 });

  // ---------- DC-21..23 (FR31–FR39): tài khoản riêng, không spec nào khác dùng ----------
  // DC-21: GV mới (chưa có đề tài, không chạm hạn mức FR16) + 2 SV chưa có đề tài (FR03: 1 đề tài hoạt động)
  const [gvR, svRA, svRB] = [await mk('LECTURER', `GV${P}R`, `TS. Trịnh Văn Tuyển ${P}`), await mk('STUDENT', `SV${P}RA`, `Lương Thị Ứng Tuyển ${P}`), await mk('STUDENT', `SV${P}RB`, `Âu Văn Bị Từ Chối ${P}`)];
  // DC-22: GVHD + 3 GV hội đồng mới, đề tài IN_PROGRESS đủ điều kiện ra hội đồng (mốc bắt buộc Đạt + báo cáo FINAL READY)
  const [gvD, h1, h2, h3, svD] = [
    await mk('LECTURER', `GV${P}D`, `TS. Đinh Văn Hướng Dẫn ${P}`), await mk('LECTURER', `GV${P}H1`, `PGS. Chu Thị Chủ Tịch ${P}`),
    await mk('LECTURER', `GV${P}H2`, `TS. Ông Văn Thư Ký ${P}`), await mk('LECTURER', `GV${P}H3`, `TS. Yên Thị Ủy Viên ${P}`),
    await mk('STUDENT', `SV${P}D`, `Giáp Văn Bảo Vệ ${P}`),
  ];
  const defense = await mkExec(svD, `Đề tài hội đồng ${P} – chấm bảo vệ tiếng Việt`, [['Báo cáo tổng kết hội đồng E2E', -DAY, 'PASSED']], gvD);
  const defMs = await prisma.milestone.findFirst({ where: { topicId: defense.id } });
  await prisma.document.create({ data: { topicId: defense.id, milestoneId: defMs.id, stage: 'FINAL', kind: 'LINK', version: 1, fileName: 'Báo cáo tổng kết', externalUrl: 'https://github.com/nckh/e2e', status: 'READY', uploadedById: svD.id } });
  // DC-23: SV sửa SĐT; đề tài Kanban: mốc 1 có bản nộp chưa đánh giá (Chờ đánh giá), mốc 2 Đạt
  const [svP, gvK, svK] = [await mk('STUDENT', `SV${P}P`, `Phùng Thị Hồ Sơ ${P}`), await mk('LECTURER', `GV${P}K`, `TS. Khổng Văn Kanban ${P}`), await mk('STUDENT', `SV${P}K`, `Lục Thị Thẻ ${P}`)];
  const kanban = await mkExec(svK, `Đề tài Kanban ${P}`, [['Mốc chờ đánh giá Kanban', 10 * DAY], ['Mốc đã đạt Kanban', 5 * DAY, 'PASSED']], gvK);
  const kMs = await prisma.milestone.findFirst({ where: { topicId: kanban.id, order: 1 } });
  await prisma.document.create({ data: { topicId: kanban.id, milestoneId: kMs.id, stage: 'MIDTERM', kind: 'LINK', version: 1, fileName: 'Bản nộp Kanban', externalUrl: 'https://github.com/nckh/kanban', status: 'READY', uploadedById: svK.id } });

  const closedOk = await prisma.topic.findMany({ where: { status: 'CLOSED', results: { some: { isCurrent: true, result: { in: ['EXCELLENT', 'GOOD', 'PASS'] } } } }, select: { code: true, title: true, summary: true }, orderBy: { code: 'asc' } });
  const leaders = await prisma.user.findMany({ where: { code: { in: ['2374802010027', '2374801030028'] } }, select: { fullName: true } });
  const u = (x) => ({ id: x.id, code: x.code, name: x.fullName });
  const t = (x) => ({ id: x.id, code: x.code, title: x.title });
  return {
    exec: { flow: { id: flow.id, code: flow.code, sv: { code: sv4.code } }, neg: { id: neg.id, code: neg.code, sv: { code: sv5.code } } },
    bell: { sv: { code: sv6.code }, unread: 2, total: 3 },
    password: SEED_PASSWORD, roundLabel: `${round.name} – ${round.academicYear} (Đang mở đăng ký)`,
    main: { ...content(inProg[0]), title: `${inProg[0].title} ${P}` }, mobile: { id: mobile.id, code: mobile.code, ...content(m) },
    fail: { code: failTopic.code, title: failTopic.title }, closedOk, leaderNames: leaders.map((l) => l.fullName),
    users: { sv1: u(sv1), sv2: u(sv2), sv3: u(sv3), gv: u(gv), cb: u(cb), admin: { code: 'QT001' }, gv2: u(gv2), gv3: u(gv3), cbx: u(cbx),
      ...Object.fromEntries(Object.entries(sv).map(([i, x]) => [`sv${i}`, u(x)])) },
    // nội dung trùng đề tài đang thực hiện đầu tiên -> FR06 HIGH khi công bố
    rec: { gv: u(gvR), svA: u(svRA), svB: u(svRB), content: { ...content(inProg[0]), title: `${inProg[0].title} tuyển ${P}` } },
    def: { topic: t(defense), gv: u(gvD), sv: u(svD), h1: u(h1), h2: u(h2), h3: u(h3) },
    dc23: { sv: u(svP), kanban: t(kanban), gv: u(gvK), sv2: u(svK) },
    gd6: { adv: t(adv), cancel: t(cancel), leave: t(leave), change: t(change), reopen: t(reopen), result: t(result), revise: t(revise), reject: t(reject), g5: t(g5), draft: t(draft) },
  };
}

try {
  await seed(prisma);
  await prisma.user.updateMany({ data: { mustChangePassword: false } });
  const state = {};
  for (const [project, prefix] of Object.entries(DATASETS)) state[project] = await buildDataset(prefix);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`E2E DB sẵn sàng: bộ dữ liệu ${Object.keys(state).join(', ')}.`);
} finally {
  await prisma.$disconnect();
}
