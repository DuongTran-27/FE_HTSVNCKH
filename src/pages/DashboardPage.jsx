import { useQueries, useQuery } from '@tanstack/react-query';
import { TOPIC_STATUS_LABEL } from '@nckh/shared';
import { Link } from 'react-router';
import { Archive, ClipboardCheck, FileStack, GitPullRequestArrow, Mail, PencilLine, PlayCircle, UserCheck, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { fmtDateTime } from '../lib/format.js';
import { Badge, PageHeader, QueryBox, STATUS_TONE, card } from '../components/ui.jsx';
import { cn } from '@/lib/utils';

// Ô số liệu theo vai trò: [nhãn, API danh sách (lấy total, pageSize=1), trang đích, biểu tượng].
// Chỉ dùng API danh sách sẵn có nên phạm vi dữ liệu do backend lọc theo người gọi (FR25).
const PENDING_CR = ['Yêu cầu thay đổi đang chờ', '/change-requests?status=PENDING&pageSize=1', '/yeu-cau', GitPullRequestArrow];
const TILES = {
  STUDENT: [
    ['Đề tài của tôi', '/topics?pageSize=1', '/de-tai', FileStack],
    ['Cần chỉnh sửa', '/topics?status=NEEDS_REVISION&pageSize=1', '/de-tai?status=NEEDS_REVISION', PencilLine],
    ['Lời mời đang chờ', '/invitations?status=PENDING&pageSize=1', '/loi-moi', Mail],
    PENDING_CR,
  ],
  LECTURER: [
    ['Đề nghị chờ phản hồi', '/advisor-requests?status=PENDING&pageSize=1', '/de-nghi-huong-dan', UserCheck],
    ['Đề tài hướng dẫn', '/topics?pageSize=1', '/de-tai', FileStack],
    ['Đang thực hiện', '/topics?status=IN_PROGRESS&pageSize=1', '/de-tai?status=IN_PROGRESS', PlayCircle],
    PENDING_CR,
  ],
  STAFF: [
    ['Hồ sơ chờ xét duyệt', '/topics?status=UNDER_REVIEW&pageSize=1', '/xet-duyet', ClipboardCheck],
    ['Đề tài', '/topics?pageSize=1', '/de-tai', FileStack],
    ['Đang thực hiện', '/topics?status=IN_PROGRESS&pageSize=1', '/de-tai?status=IN_PROGRESS', PlayCircle],
    PENDING_CR,
  ],
  ADMIN: [
    ['Tài khoản', '/users?pageSize=1', '/quan-ly/tai-khoan', Users],
    ['Kho đề tài', '/repository?pageSize=1', '/kho', Archive],
  ],
};

// Danh sách đề tài cần để ý (5 dòng) dưới các ô số liệu; ADMIN không có quyền nghiệp vụ nên không có
const RECENT = {
  STUDENT: ['Đề tài cập nhật gần đây', '/topics?sort=updatedAt_desc&pageSize=5', (t) => `/de-tai/${t.id}`, '/de-tai'],
  LECTURER: ['Đề tài hướng dẫn cập nhật gần đây', '/topics?sort=updatedAt_desc&pageSize=5', (t) => `/de-tai/${t.id}`, '/de-tai'],
  STAFF: ['Hồ sơ chờ xét duyệt lâu nhất', '/topics?status=UNDER_REVIEW&sort=updatedAt_asc&pageSize=5', (t) => `/xet-duyet/${t.id}`, '/xet-duyet'],
};

function RecentTopics({ spec: [title, url, linkOf, all] }) {
  const query = useQuery({ queryKey: ['dashboard', url], queryFn: () => api(url) });
  return (
    <section className={`${card} mt-6`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <Link to={all} className="text-sm font-medium text-blue-700 hover:underline">Xem tất cả</Link>
      </div>
      <QueryBox query={query} empty="Chưa có đề tài nào." isEmpty={(d) => d.items.length === 0}>
        {(d) => (
          <div className="divide-y">
            {d.items.map((t) => (
              <Link key={t.id} to={linkOf(t)} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 hover:bg-muted">
                <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground tabular-nums">{t.code}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <Badge tone={STATUS_TONE[t.status]}>{TOPIC_STATUS_LABEL[t.status]}</Badge>
                <span className="w-32 shrink-0 text-right text-sm text-muted-foreground">{fmtDateTime(t.updatedAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </QueryBox>
    </section>
  );
}

// /tong-quan – trang tổng quan sau đăng nhập
export function DashboardPage() {
  const { user } = useAuth();
  const tiles = TILES[user?.role] ?? [];
  const results = useQueries({
    queries: tiles.map(([, url]) => ({ queryKey: ['dashboard', url], queryFn: async () => (await api(url)).total })),
  });
  return (
    <section>
      <PageHeader title={`Xin chào, ${user?.fullName ?? ''}`} description="Tóm tắt những việc đang chờ bạn." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, url, to, Icon], i) => {
          const q = results[i];
          return (
            <li key={url}>
              <Link to={to} className="group flex h-full items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-blue-700"><Icon aria-hidden="true" className="size-6" /></span>
                <span className="min-w-0">
                  <span className="block text-sm text-muted-foreground">{label}</span>
                  {q.isPending ? <span role="status" className="mt-1 block h-8 w-12 animate-pulse rounded-md bg-muted"><span className="sr-only">Đang tải…</span></span>
                    : <span className={cn('block text-3xl font-bold tabular-nums', q.isError && 'text-base font-medium text-red-700')}>{q.isError ? 'Không tải được' : q.data}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {RECENT[user?.role] && <RecentTopics spec={RECENT[user.role]} />}
    </section>
  );
}
