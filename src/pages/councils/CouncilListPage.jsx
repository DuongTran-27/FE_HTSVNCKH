import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { qs } from '../../lib/format.js';
import { pickPage, useUrlParams } from '../../lib/urlParams.js';
import { DebouncedInput, FilterSelect } from '../../components/ListFilters.jsx';
import { Badge, PageHeader, Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';
import { useRounds } from './CouncilCreatePage.jsx';

const COLS = 'lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,12rem)_minmax(0,12rem)_6rem_6rem]';

// R30 – UI §12.8, API_GD7 §6.5: danh sách hội đồng của cán bộ; lọc đợt + tìm, trạng thái lọc nằm trên URL.
export function CouncilListPage() {
  const u = useUrlParams();
  const params = { roundId: u.get('roundId'), q: u.get('q').slice(0, 200), page: pickPage(u.get('page')) };
  const rounds = useRounds();
  const query = useQuery({
    queryKey: ['councils', params],
    queryFn: () => api(`/councils${qs({ ...params, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <section>
      <PageHeader title="Hội đồng"><Link to="/hoi-dong/moi" className={btnPrimary}>Lập hội đồng</Link></PageHeader>
      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 sm:p-5">
        <DebouncedInput label="Tìm kiếm" value={params.q} onCommit={(v) => u.set('q', v)} placeholder="Mã hoặc tên hội đồng" />
        <FilterSelect label="Đợt" value={params.roundId} onChange={(v) => u.set('roundId', v)} placeholder="Mọi đợt"
          options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
      </div>
      {u.any && <button type="button" className={`${btnGhost} mt-2`} onClick={u.clear}>Xóa bộ lọc</button>}
      <div className="mt-3">
        <QueryBox query={query} empty={u.any ? 'Không có hội đồng nào khớp bộ lọc.' : 'Chưa có hội đồng nào trong đợt này.'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              {/* Máy tính: hàng của một bảng lưới có đầu cột; dưới lg mỗi hội đồng là một thẻ */}
              <div aria-hidden="true" className={`hidden gap-3 px-4 pb-2 text-xs font-semibold text-muted-foreground uppercase lg:grid ${COLS}`}>
                <span>Mã</span><span>Tên</span><span>Đợt</span><span>Chủ tịch</span><span>Thành viên</span><span>Đề tài</span>
              </div>
              <ul className="space-y-3">
                {d.items.map((c) => (
                  <li key={c.id} className={`rounded-xl border bg-card p-4 shadow-sm lg:grid lg:items-center lg:gap-3 ${COLS}`}>
                    <span className="font-medium tabular-nums text-muted-foreground">{c.code}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link to={`/hoi-dong/${c.id}`} className="break-words font-semibold text-blue-900 underline-offset-4 hover:underline">{c.name}</Link>
                      {c.locked && <Badge tone="green">Đã có điểm</Badge>}
                    </span>
                    <span className="block text-sm">{c.round?.name} ({c.round?.academicYear})</span>
                    <span className="block text-sm"><span className="lg:sr-only">Chủ tịch: </span>{c.members.find((m) => m.role === 'CHAIR')?.fullName ?? '—'}</span>
                    <span className="text-sm tabular-nums">{c.members.length}<span className="lg:sr-only"> thành viên</span></span>
                    <span className="ml-3 text-sm tabular-nums lg:ml-0">{c.assignmentCount}<span className="lg:sr-only"> đề tài</span></span>
                  </li>
                ))}
              </ul>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => u.set('page', p > 1 ? String(p) : '')} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
