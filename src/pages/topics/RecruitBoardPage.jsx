import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { qs, searchTerm } from '../../lib/format.js';
import { useCatalog } from '../../lib/queries.js';
import { pickPage, useUrlParams } from '../../lib/urlParams.js';
import { DebouncedInput, FilterSelect } from '../../components/ListFilters.jsx';
import { Badge, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

// Nhãn và màu của đơn ứng tuyển "của tôi" (UI §12.6); dùng chung với trang chi tiết và "Đơn ứng tuyển"
export const APPLICATION_LABEL = { PENDING: 'Đang chờ duyệt', ACCEPTED: 'Đã được nhận', DECLINED: 'Bị từ chối', WITHDRAWN: 'Đã rút' };
export const APPLICATION_TONE = { PENDING: 'blue', ACCEPTED: 'green', DECLINED: 'red', WITHDRAWN: 'slate' };

// R26 – UI §12.6, API_GD7 §4.2: bảng tin đề tài giảng viên đang tuyển. Lọc/tìm/phân trang ở server, trạng thái nằm trên URL.
export function RecruitBoardPage() {
  const { user } = useAuth();
  const u = useUrlParams();
  const params = { roundId: u.get('roundId'), fieldId: u.get('fieldId'), lecturerId: u.get('lecturerId'), q: u.get('q').slice(0, 200), page: pickPage(u.get('page')) };
  const rounds = useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const fields = useCatalog('fields');
  // API danh sách giảng viên tính hạn mức theo đợt → chỉ lọc theo giảng viên khi đã chọn đợt
  const lecturers = useQuery({
    queryKey: ['lecturers', 'board-filter', params.roundId], enabled: Boolean(params.roundId),
    queryFn: async () => (await api(`/lecturers${qs({ roundId: params.roundId, pageSize: 100 })}`)).items,
  });
  const query = useQuery({
    queryKey: ['recruitments', 'list', params],
    queryFn: () => api(`/recruitments${qs({ ...params, q: searchTerm(params.q), pageSize: 12 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Đề tài tuyển sinh viên</h1>
        {user?.role === 'LECTURER' && <Link to="/de-tai/moi" className={btnPrimary}>Công bố đề tài tuyển sinh viên</Link>}
      </div>
      <div className="mt-4 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <DebouncedInput label="Tìm kiếm" value={params.q} onCommit={(v) => u.set('q', v)} placeholder="Tên, từ khóa" />
        <FilterSelect label="Đợt" value={params.roundId} onChange={(v) => { u.set('roundId', v); if (params.lecturerId) u.set('lecturerId', ''); }} placeholder="Mọi đợt"
          options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
        <FilterSelect label="Lĩnh vực" value={params.fieldId} onChange={(v) => u.set('fieldId', v)} placeholder="Mọi lĩnh vực"
          options={(fields.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
        <FilterSelect label="Giảng viên" value={params.lecturerId} onChange={(v) => u.set('lecturerId', v)} placeholder={params.roundId ? 'Mọi giảng viên' : 'Chọn đợt trước'}
          options={(lecturers.data ?? []).map((l) => ({ value: l.id, label: `${l.code} – ${l.fullName}` }))} />
      </div>
      {u.any && <button type="button" className={`${btnGhost} mt-2`} onClick={u.clear}>Xóa bộ lọc</button>}
      <div className="mt-3">
        <QueryBox query={query} empty={u.any ? 'Không có đề tài nào khớp bộ lọc.' : 'Hiện chưa có đề tài nào đang tuyển sinh viên.'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {d.items.map((t) => <RecruitCard key={t.topicId} item={t} />)}
              </ul>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => u.set('page', p > 1 ? String(p) : '')} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}

// Thẻ một đề tài đang tuyển: mã, tên, giảng viên, số chỗ còn lại và trạng thái đơn của tôi.
function RecruitCard({ item: t }) {
  const left = Math.max(t.recruitSlots - t.acceptedCount, 0);
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <Link to={`/tuyen-sinh/${t.topicId}`} className="break-words text-base font-semibold text-blue-900 underline-offset-4 hover:text-blue-700 hover:underline">
        <span className="mr-1.5 font-medium text-muted-foreground tabular-nums">{t.code}</span><span className="sr-only">– </span>{t.title}
      </Link>
      <p className="text-sm text-muted-foreground">{t.field?.name} · Giảng viên {t.lecturer?.fullName}</p>
      <p className="line-clamp-4 break-words text-sm">{t.summaryExcerpt}</p>
      <p className="mt-auto flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={left > 0 ? 'green' : 'amber'}>Còn {left} chỗ</Badge>
        <span className="text-muted-foreground">{t.round?.name}</span>
        {t.round?.registrationOpen === false && <Badge tone="amber">Đã đóng đăng ký</Badge>}
        {t.myApplication && <Badge tone={APPLICATION_TONE[t.myApplication.status]}>{APPLICATION_LABEL[t.myApplication.status] ?? t.myApplication.status}</Badge>}
      </p>
    </li>
  );
}
