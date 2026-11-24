import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NOTIFICATION_TYPE_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { fmtDateTime, qs } from '../lib/format.js';
import { safeNext } from '../lib/nav.js';
import { pickPage, useUrlParams } from '../lib/urlParams.js';
import { CheckCheck } from 'lucide-react';
import { Badge, PageHeader, Pager, QueryBox, btnGhost } from '../components/ui.jsx';

// /thong-bao – API_GD45 §8.1. Chưa đọc lọc ở server; mở một thông báo thì đánh dấu đã đọc rồi đi tới link
export function NotificationsPage() {
  const u = useUrlParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unread = u.get('unread') === 'true' ? 'true' : '';
  const page = pickPage(u.get('page'));
  const query = useQuery({
    queryKey: ['notifications', 'list', unread, page],
    queryFn: () => api(`/notifications${qs({ unread, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id) => api(`/notifications/${id}/read`, { method: 'POST' }), onSuccess: refresh });
  const open = async (n) => {
    if (!n.readAt) await readOne.mutateAsync(n.id).catch(() => {}); // lỗi đánh dấu không chặn việc đi tới trang đích
    const to = safeNext(n.link);
    if (to) navigate(to);
  };
  return (
    <section>
      <PageHeader title="Thông báo" description="Nhắc hạn, kết quả xét duyệt, lời mời và phản hồi về đề tài của bạn.">
          <button type="button" className={btnGhost} aria-pressed={unread === 'true'} onClick={() => u.set('unread', unread ? '' : 'true')}>Chỉ chưa đọc</button>
          <button type="button" className={btnGhost} disabled={readAll.isPending || !query.data?.unreadCount} onClick={() => readAll.mutate()}><CheckCheck aria-hidden="true" className="size-4" />Đánh dấu tất cả đã đọc</button>
      </PageHeader>
      {(readAll.isError || readOne.isError) && <p role="alert" className="mt-2 text-sm text-red-700">{(readAll.error ?? readOne.error).message}</p>}
      <div>
        <QueryBox query={query} empty={unread ? 'Không có thông báo chưa đọc.' : 'Chưa có thông báo nào.'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <ul className="space-y-2">
                {d.items.map((n) => (
                  <li key={n.id} className={`relative rounded-xl border p-4 pl-8 shadow-sm ${n.readAt ? 'border-slate-300 bg-card' : 'border-blue-200 bg-blue-50/60'}`}>
                    {!n.readAt && <span aria-hidden="true" className="absolute top-[2.125rem] left-3.5 size-2 rounded-full bg-vlu-red" />}
                    <button type="button" onClick={() => open(n)} className="min-h-11 w-full break-words text-left hover:text-blue-700">
                      <span className={n.readAt ? '' : 'font-semibold'}>{n.title}</span>
                    </button>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <Badge>{NOTIFICATION_TYPE_LABEL[n.type] ?? n.type}</Badge>
                      {!n.readAt && <Badge tone="amber">Chưa đọc</Badge>}
                      <span>{fmtDateTime(n.createdAt)}</span>
                      {!n.readAt && <button type="button" className="min-h-11 font-medium text-blue-700 hover:underline" onClick={() => readOne.mutate(n.id)}>Đánh dấu đã đọc</button>}
                    </p>
                  </li>
                ))}
              </ul>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => u.set('page', p > 1 ? String(p) : '')} />
            </>
          )}
        </QueryBox>
      </div>
      <p className="mt-4 text-sm"><Link to="/" className="text-blue-700 hover:underline">Về trang chủ</Link></p>
    </section>
  );
}
