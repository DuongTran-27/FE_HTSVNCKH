import { Link, NavLink, useParams } from 'react-router';
import { TOPIC_STATUS_LABEL } from '@nckh/shared';
import { useTopic } from '../lib/queries.js';
import { EXEC_STATUSES } from '../lib/execution.js';
import { Badge, QueryBox, STATUS_TONE, btnGhost, card } from './ui.jsx';

/** Tải đề tài theo :id; 403/404 hiện tại chỗ (UI §4.6), lỗi khác qua QueryBox */
export function TopicQuery({ children }) {
  const { id } = useParams();
  const query = useTopic(id);
  const status = query.error?.status;
  if (status === 403 || status === 404) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <p>{status === 403 ? 'Bạn không có quyền xem đề tài này' : 'Không tìm thấy đề tài'}</p>
        <Link to="/de-tai" className={`${btnGhost} mt-2`}>Về danh sách đề tài</Link>
      </div>
    );
  }
  return <QueryBox query={query}>{children}</QueryBox>;
}

const tab = ({ isActive }) => 'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors '
  + (isActive ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-700/15' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900');

/** Tab thực hiện của đề tài (UI §2.7). Hiện theo permissions.readExecution của server */
export function ExecTabs({ topic: t }) {
  if (!t.permissions?.readExecution) return null;
  const exec = EXEC_STATUSES.includes(t.status);
  const base = `/de-tai/${t.id}`;
  return (
    <nav aria-label="Thực hiện đề tài" className="flex flex-wrap gap-1">
      <NavLink end to={base} className={tab}>Thông tin</NavLink>
      {exec && <NavLink to={`${base}/moc`} className={tab}>Mốc</NavLink>}
      {exec && <NavLink to={`${base}/kanban`} className={tab}>Kanban</NavLink>}
      {exec && <NavLink to={`${base}/tien-do`} className={tab}>Tiến độ</NavLink>}
      <NavLink to={`${base}/tai-lieu`} className={tab}>Tài liệu</NavLink>
      <NavLink to={`${base}/yeu-cau`} className={tab}>Yêu cầu</NavLink>
    </nav>
  );
}

/** Khung chung của tab Mốc / Tiến độ / Tài liệu */
export function ExecShell({ title, children }) {
  return (
    <section>
      <TopicQuery>
        {(t) => (
          <div className="space-y-4">
            <header className={`${card} space-y-3`}>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground tabular-nums">{t.code}</span>
                <span className="sr-only"> · </span>
                <Badge tone={STATUS_TONE[t.status]}>{TOPIC_STATUS_LABEL[t.status] ?? t.status}</Badge>
              </p>
              <div>
                <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                {t.title && <p className="mt-1 break-words text-sm text-muted-foreground">{t.title}</p>}
              </div>
              <div className="border-t pt-3"><ExecTabs topic={t} /></div>
            </header>
            {children(t)}
          </div>
        )}
      </TopicQuery>
    </section>
  );
}
