import { Component, Suspense, lazy } from 'react';
import { Navigate, redirect } from 'react-router';
import { bootstrapSession } from './lib/api.js';
import { auth, useAuth } from './lib/auth.js';
import { SCREENS, afterLoginPath, homePath } from './lib/nav.js';
import { Layout } from './components/Layout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.jsx';
import { Placeholder } from './pages/Placeholder.jsx';
import { Forbidden, NotFound } from './pages/ErrorPages.jsx';
const TopicDetailPage = lazy(() => import('./pages/topics/TopicDetailPage.jsx').then((m) => ({ default: m.TopicDetailPage })));
const AdvisorRequestsPage = lazy(() => import('./pages/topics/AdvisorRequestsPage.jsx').then((m) => ({ default: m.AdvisorRequestsPage })));
const TopicListPage = lazy(() => import('./pages/topics/TopicListPage.jsx').then((m) => ({ default: m.TopicListPage })));
const RepositoryPage = lazy(() => import('./pages/topics/RepositoryPage.jsx').then((m) => ({ default: m.RepositoryPage })));
const RepositoryDetailPage = lazy(() => import('./pages/topics/RepositoryPage.jsx').then((m) => ({ default: m.RepositoryDetailPage })));
const TopicCreatePage = lazy(() => import('./pages/topics/TopicCreatePage.jsx').then((m) => ({ default: m.TopicCreatePage })));
const TopicEditPage = lazy(() => import('./pages/topics/TopicEditPage.jsx').then((m) => ({ default: m.TopicEditPage })));
const GroupPage = lazy(() => import('./pages/topics/GroupPage.jsx').then((m) => ({ default: m.GroupPage })));
const AdvisorInvitePage = lazy(() => import('./pages/topics/AdvisorInvitePage.jsx').then((m) => ({ default: m.AdvisorInvitePage })));
const ApplicantsPage = lazy(() => import('./pages/topics/ApplicantsPage.jsx').then((m) => ({ default: m.ApplicantsPage })));
const RecruitBoardPage = lazy(() => import('./pages/topics/RecruitBoardPage.jsx').then((m) => ({ default: m.RecruitBoardPage })));
const RecruitDetailPage = lazy(() => import('./pages/topics/RecruitDetailPage.jsx').then((m) => ({ default: m.RecruitDetailPage })));
const MyApplicationsPage = lazy(() => import('./pages/topics/MyApplicationsPage.jsx').then((m) => ({ default: m.MyApplicationsPage })));
const SubmitPage = lazy(() => import('./pages/topics/SubmitPage.jsx').then((m) => ({ default: m.SubmitPage })));
const InvitationsPage = lazy(() => import('./pages/topics/InvitationsPage.jsx').then((m) => ({ default: m.InvitationsPage })));
const SubmissionHistoryPage = lazy(() => import('./pages/topics/SubmissionHistoryPage.jsx').then((m) => ({ default: m.SubmissionHistoryPage })));
const SubmissionPage = lazy(() => import('./pages/topics/SubmissionPage.jsx').then((m) => ({ default: m.SubmissionPage })));
const SubmissionDiffPage = lazy(() => import('./pages/topics/SubmissionDiffPage.jsx').then((m) => ({ default: m.SubmissionDiffPage })));
const MilestonesPage = lazy(() => import('./pages/topics/MilestonesPage.jsx').then((m) => ({ default: m.MilestonesPage })));
const KanbanPage = lazy(() => import('./pages/topics/KanbanPage.jsx').then((m) => ({ default: m.KanbanPage })));
const ProgressPage = lazy(() => import('./pages/topics/ProgressPage.jsx').then((m) => ({ default: m.ProgressPage })));
const DocumentsPage = lazy(() => import('./pages/topics/DocumentsPage.jsx').then((m) => ({ default: m.DocumentsPage })));
const ReviewQueuePage = lazy(() => import('./pages/review/ReviewQueuePage.jsx').then((m) => ({ default: m.ReviewQueuePage })));
const ReviewPage = lazy(() => import('./pages/review/ReviewPage.jsx').then((m) => ({ default: m.ReviewPage })));
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx').then((m) => ({ default: m.UsersPage })));
const UserCreatePage = lazy(() => import('./pages/admin/UserCreatePage.jsx').then((m) => ({ default: m.UserCreatePage })));
const UserDetailPage = lazy(() => import('./pages/admin/UserDetailPage.jsx').then((m) => ({ default: m.UserDetailPage })));
const UserImportPage = lazy(() => import('./pages/admin/UserImportPage.jsx').then((m) => ({ default: m.UserImportPage })));
const CatalogPage = lazy(() => import('./pages/admin/CatalogPage.jsx').then((m) => ({ default: m.CatalogPage })));
const RoundsPage = lazy(() => import('./pages/admin/RoundsPage.jsx').then((m) => ({ default: m.RoundsPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx').then((m) => ({ default: m.NotificationsPage })));
const StatsPage = lazy(() => import('./pages/stats/StatsPage.jsx').then((m) => ({ default: m.StatsPage })));
const TopicRequestsPage = lazy(() => import('./pages/topics/TopicRequestsPage.jsx').then((m) => ({ default: m.TopicRequestsPage })));
const PastTopicsPage = lazy(() => import('./pages/topics/PastTopicsPage.jsx').then((m) => ({ default: m.PastTopicsPage })));
const PastTopicDetailPage = lazy(() => import('./pages/topics/PastTopicsPage.jsx').then((m) => ({ default: m.PastTopicDetailPage })));
const ChangeRequestsPage = lazy(() => import('./pages/ChangeRequestsPage.jsx').then((m) => ({ default: m.ChangeRequestsPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then((m) => ({ default: m.DashboardPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx').then((m) => ({ default: m.ProfilePage })));
const CouncilListPage = lazy(() => import('./pages/councils/CouncilListPage.jsx').then((m) => ({ default: m.CouncilListPage })));
const CouncilCreatePage = lazy(() => import('./pages/councils/CouncilCreatePage.jsx').then((m) => ({ default: m.CouncilCreatePage })));
const CouncilDetailPage = lazy(() => import('./pages/councils/CouncilDetailPage.jsx').then((m) => ({ default: m.CouncilDetailPage })));
const DefenseAssignmentsPage = lazy(() => import('./pages/defense/DefenseAssignmentsPage.jsx').then((m) => ({ default: m.DefenseAssignmentsPage })));
const DefenseScorePage = lazy(() => import('./pages/defense/DefenseScorePage.jsx').then((m) => ({ default: m.DefenseScorePage })));
const RoundFormPage = lazy(() => import('./pages/admin/RoundFormPage.jsx').then((m) => ({ default: m.RoundFormPage })));

// Lỗi tải chunk lazy (mất mạng, bản mới đã thay file cũ) → thông báo + tải lại, thay vì trang trắng
export class ChunkErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p>Không tải được nội dung trang. Có thể do mất kết nối hoặc hệ thống vừa cập nhật.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-2 inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-card px-4 font-medium text-slate-900">Tải lại trang</button>
      </div>
    );
  }
}

// Loader chạy ngay khi tạo router, trước khi phiên khởi động xong → phải chờ bootstrapSession trước khi đọc auth
// (review T301-reviewer-v3 i1). Guard chỉ để dẫn đường; backend kiểm quyền thật (FR25).
const authLoader = async ({ request }) => {
  await bootstrapSession();
  const { user } = auth.get();
  const url = new URL(request.url);
  if (!user) return redirect(`/dang-nhap?next=${encodeURIComponent(url.pathname + url.search)}`);
  if (user.mustChangePassword && url.pathname !== '/doi-mat-khau') return redirect('/doi-mat-khau');
  return null;
};

const guestLoader = async () => {
  await bootstrapSession();
  const { user } = auth.get();
  return user ? redirect(user.mustChangePassword ? '/doi-mat-khau' : homePath(user.role)) : null;
};

// /dang-nhap/google (UI §12.3): callback Google đã đặt cookie nckh_rt; refresh lúc khởi động (bootstrapSession) lấy phiên,
// rồi điều hướng như đăng nhập mật khẩu. Không có phiên (cookie bị chặn, đã hết hạn) → về trang đăng nhập.
export const ssoLoader = async ({ request }) => {
  await bootstrapSession();
  const { user } = auth.get();
  return redirect(user ? afterLoginPath(user, new URL(request.url).searchParams.get('next')) : '/dang-nhap');
};

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? children : <Forbidden />;
}


// Màn đã làm (T304–T308); còn lại là trang tạm. key ép dựng lại khi đổi loại danh mục
const SCREEN_ELEMENT = {
  'tong-quan': <DashboardPage />,
  'ho-so': <ProfilePage />,
  'de-tai': <TopicListPage />,
  'thong-bao': <NotificationsPage />,
  'thong-ke': <StatsPage />,
  kho: <RepositoryPage />,
  'kho/:code': <RepositoryDetailPage />,
  'tuyen-sinh': <RecruitBoardPage />,
  'tuyen-sinh/:topicId': <RecruitDetailPage />,
  'don-ung-tuyen': <MyApplicationsPage />,
  'de-tai/moi': <TopicCreatePage />,
  'de-tai/:id': <TopicDetailPage />,
  'de-tai/:id/sua': <TopicEditPage />,
  'de-tai/:id/nhom': <GroupPage />,
  'de-tai/:id/moi-gvhd': <AdvisorInvitePage />,
  'de-tai/:id/gui': <SubmitPage />,
  'de-tai/:id/cong-bo': <SubmitPage />,
  'de-tai/:id/ung-vien': <ApplicantsPage />,
  'de-tai/:id/lich-su': <SubmissionHistoryPage />,
  'de-tai/:id/lan-gui/:seq': <SubmissionPage />,
  'de-tai/:id/so-sanh': <SubmissionDiffPage />,
  'de-tai/:id/moc': <MilestonesPage />,
  'de-tai/:id/kanban': <KanbanPage />,
  'de-tai/:id/tien-do': <ProgressPage />,
  'de-tai/:id/tai-lieu': <DocumentsPage />,
  'de-tai/:id/yeu-cau': <TopicRequestsPage />,
  'yeu-cau': <ChangeRequestsPage />,
  'lich-su-tham-gia': <PastTopicsPage />,
  'lich-su-tham-gia/:topicId': <PastTopicDetailPage />,
  'xet-duyet': <ReviewQueuePage />,
  'xet-duyet/:id': <ReviewPage />,
  'loi-moi': <InvitationsPage />,
  'hoi-dong': <CouncilListPage />,
  'hoi-dong/moi': <CouncilCreatePage />,
  'hoi-dong/:id': <CouncilDetailPage />,
  'cham-bao-ve': <DefenseAssignmentsPage />,
  'cham-bao-ve/:assignmentId': <DefenseScorePage />,
  'de-nghi-huong-dan': <AdvisorRequestsPage />,
  'quan-ly/tai-khoan': <UsersPage />,
  'quan-ly/tai-khoan/moi': <UserCreatePage />,
  'quan-ly/tai-khoan/nhap-csv': <UserImportPage />,
  'quan-ly/tai-khoan/:id': <UserDetailPage />,
  'quan-ly/danh-muc/khoa': <CatalogPage key="khoa" kind="khoa" />,
  'quan-ly/danh-muc/nganh': <CatalogPage key="nganh" kind="nganh" />,
  'quan-ly/danh-muc/lop': <CatalogPage key="lop" kind="lop" />,
  'quan-ly/danh-muc/linh-vuc': <CatalogPage key="linh-vuc" kind="linh-vuc" />,
  'quan-ly/danh-muc/dong-nghia': <CatalogPage key="dong-nghia" kind="dong-nghia" />,
  'quan-ly/dot': <RoundsPage />,
  'quan-ly/dot/moi': <RoundFormPage create />,
  'quan-ly/dot/:id': <RoundFormPage />,
};

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homePath(user?.role)} replace />;
}

// Data router bắt buộc (useBlocker ở R7, R21 – UI §1.1)
const hydrateFallbackElement = <p role="status" className="p-4">Đang tải…</p>;
export const routes = [
  { path: '/dang-nhap', loader: guestLoader, hydrateFallbackElement, element: <LoginPage /> },
  { path: '/dang-nhap/google', loader: ssoLoader, hydrateFallbackElement },
  {
    loader: authLoader,
    hydrateFallbackElement,
    element: <Layout />,
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/doi-mat-khau', element: <ChangePasswordPage /> },
      { path: '/403', element: <Forbidden /> },
      ...SCREENS.map(([path, roles, title]) => ({
        path: `/${path}`,
        element: <RequireRole roles={roles}><ChunkErrorBoundary><Suspense fallback={<p role="status" className="p-4">Đang tải…</p>}>{SCREEN_ELEMENT[path] ?? <Placeholder title={title} />}</Suspense></ChunkErrorBoundary></RequireRole>,
      })),
      { path: '*', element: <NotFound /> },
    ],
  },
];
