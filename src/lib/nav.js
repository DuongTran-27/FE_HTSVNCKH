import { matchPath } from 'react-router';
import { nextPathSchema } from '@nckh/shared';

// Trang chủ theo vai trò (UI §2) và kiểm `next` chống open redirect (UI §1.2)
const HOME = { STUDENT: '/de-tai', LECTURER: '/de-nghi-huong-dan', STAFF: '/xet-duyet', ADMIN: '/quan-ly/tai-khoan' };

export const homePath = (role) => HOME[role] ?? '/';

/** Chỉ nhận đường dẫn nội bộ (nextPathSchema dùng chung với API, m3 BM DC-03). Sai → null. */
export const safeNext = (next) => (nextPathSchema.safeParse(next).success ? next : null);

const S = 'STUDENT';
const L = 'LECTURER';
const F = 'STAFF';
const A = 'ADMIN';
// [đường dẫn, vai trò được vào, tiêu đề] – UI §3
export const SCREENS = [
  ['tong-quan', [S, L, F, A], 'Tổng quan'],
  ['ho-so', [S, L, F, A], 'Hồ sơ cá nhân'],
  ['de-tai', [S, L, F], 'Đề tài'],
  ['de-tai/moi', [S, L], 'Tạo đề tài'],
  ['de-tai/:id', [S, L, F], 'Chi tiết đề tài'],
  ['de-tai/:id/sua', [S, L], 'Soạn hồ sơ'],
  ['tuyen-sinh', [S, L, F], 'Đề tài tuyển sinh viên'],
  ['tuyen-sinh/:topicId', [S, L, F], 'Chi tiết đề tài tuyển'],
  ['don-ung-tuyen', [S], 'Đơn ứng tuyển'],
  ['de-tai/:id/cong-bo', [L], 'Công bố tuyển sinh viên'],
  ['de-tai/:id/ung-vien', [L, F], 'Ứng viên'],
  ['de-tai/:id/nhom', [S, L, F], 'Nhóm'],
  ['de-tai/:id/moi-gvhd', [S], 'Mời giảng viên hướng dẫn'],
  ['de-tai/:id/gui', [S], 'Gửi xét duyệt'],
  ['de-tai/:id/lich-su', [S, L, F], 'Lịch sử'],
  ['de-tai/:id/lan-gui/:seq', [S, L, F], 'Lần gửi'],
  ['de-tai/:id/so-sanh', [S, L, F], 'So sánh các lần gửi'],
  ['de-tai/:id/moc', [S, L, F], 'Mốc thực hiện'],
  ['de-tai/:id/kanban', [S, L, F], 'Kanban tiến độ'], // R36 (DC-17, UI §12.10)
  ['de-tai/:id/tien-do', [S, L, F], 'Tiến độ'],
  ['de-tai/:id/tai-lieu', [S, L, F], 'Tài liệu'],
  ['de-tai/:id/yeu-cau', [S, L, F], 'Yêu cầu thay đổi'],
  ['yeu-cau', [S, L, F], 'Yêu cầu thay đổi'],
  ['lich-su-tham-gia', [S], 'Lịch sử tham gia'],
  ['lich-su-tham-gia/:topicId', [S], 'Phiên bản đã tham gia'],
  ['loi-moi', [S], 'Lời mời'],
  ['de-nghi-huong-dan', [L, F], 'Đề nghị hướng dẫn'],
  ['xet-duyet', [F], 'Xét duyệt'],
  // DC-15: hội đồng (UI §12.8). Thành viên hội đồng (GV) mở R32 chỉ đọc; R33/R34 chấm bảo vệ (DC-16, UI §12.9)
  ['hoi-dong', [F], 'Hội đồng'],
  ['hoi-dong/moi', [F], 'Lập hội đồng'],
  ['hoi-dong/:id', [F, L], 'Hội đồng'],
  ['cham-bao-ve', [L], 'Chấm bảo vệ'],
  ['cham-bao-ve/:assignmentId', [L], 'Chấm bảo vệ'],
  ['xet-duyet/:id', [F], 'Màn xét duyệt'],
  ['quan-ly/tai-khoan', [A, F], 'Tài khoản'],
  ['quan-ly/tai-khoan/moi', [A, F], 'Tạo tài khoản'],
  ['quan-ly/tai-khoan/nhap-csv', [A, F], 'Nhập tài khoản từ CSV'],
  ['quan-ly/tai-khoan/:id', [A, F], 'Chi tiết tài khoản'],
  ['quan-ly/danh-muc/khoa', [A], 'Danh mục khoa'],
  ['quan-ly/danh-muc/nganh', [A, F], 'Danh mục ngành'],
  ['quan-ly/danh-muc/lop', [A, F], 'Danh mục lớp'],
  ['quan-ly/danh-muc/linh-vuc', [A, F], 'Danh mục lĩnh vực'],
  ['quan-ly/danh-muc/dong-nghia', [F], 'Từ đồng nghĩa'],
  ['quan-ly/dot', [F], 'Đợt'],
  ['quan-ly/dot/moi', [F], 'Tạo đợt'],
  ['quan-ly/dot/:id', [F], 'Chi tiết đợt'],
  ['thong-bao', [S, L, F, A], 'Thông báo'],
  ['thong-ke', [L, F], 'Thống kê'],
  ['kho', [S, L, F, A], 'Kho đề tài'],
  ['kho/:code', [S, L, F, A], 'Chi tiết kho đề tài'],
];

/** Vai trò có vào được đường dẫn này không (theo SCREENS; trang chung như /doi-mat-khau luôn được) */
export const canVisit = (role, path) => {
  const pathname = path.split(/[?#]/)[0];
  if (pathname === '/' || pathname === '/doi-mat-khau') return true;
  const screen = SCREENS.find(([p]) => matchPath(`/${p}`, pathname));
  return Boolean(screen?.[1].includes(role));
};

/** Đích sau khi có phiên (mật khẩu hoặc Google – UI §4.1, §12.3): mật khẩu tạm → đổi mật khẩu; `next` của vai trò khác → trang chủ */
export const afterLoginPath = (user, nextRaw) => {
  if (user.mustChangePassword) return '/doi-mat-khau';
  const next = safeNext(nextRaw);
  return next && canVisit(user.role, next) ? next : homePath(user.role);
};

// Menu theo vai trò (UI §2). Chỉ để dẫn đường, backend vẫn kiểm quyền (FR25)
const STATS = { to: '/thong-ke', label: 'Thống kê' };
const YEU_CAU = { to: '/yeu-cau', label: 'Yêu cầu thay đổi' };
const KHO = { to: '/kho', label: 'Kho đề tài' };
const HOME_TILES = { to: '/tong-quan', label: 'Tổng quan' };
export const MENU = {
  STUDENT: [HOME_TILES, { to: '/de-tai', label: 'Đề tài của tôi' }, { to: '/tuyen-sinh', label: 'Đề tài tuyển sinh viên' }, { to: '/don-ung-tuyen', label: 'Đơn ứng tuyển' }, { to: '/loi-moi', label: 'Lời mời' }, YEU_CAU, { to: '/lich-su-tham-gia', label: 'Lịch sử tham gia' }, KHO],
  LECTURER: [HOME_TILES, { to: '/de-nghi-huong-dan', label: 'Đề nghị hướng dẫn' }, { to: '/de-tai', label: 'Đề tài hướng dẫn' }, { to: '/tuyen-sinh', label: 'Đề tài tuyển sinh viên' }, { to: '/cham-bao-ve', label: 'Chấm bảo vệ' }, YEU_CAU, STATS, KHO],
  STAFF: [
    HOME_TILES, { to: '/xet-duyet', label: 'Xét duyệt' }, { to: '/de-tai', label: 'Đề tài' }, { to: '/de-nghi-huong-dan', label: 'Đề nghị hướng dẫn' },
    { to: '/hoi-dong', label: 'Hội đồng' }, { to: '/quan-ly/dot', label: 'Đợt' }, { to: '/quan-ly/tai-khoan', label: 'Tài khoản' },
    { to: '/quan-ly/danh-muc/nganh', label: 'Danh mục' }, YEU_CAU, STATS, KHO,
  ],
  ADMIN: [HOME_TILES, { to: '/quan-ly/tai-khoan', label: 'Tài khoản' }, { to: '/quan-ly/danh-muc/khoa', label: 'Danh mục' }, KHO],
};
