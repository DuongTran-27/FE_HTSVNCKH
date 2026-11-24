import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { COUNCIL_ROLE_LABEL, DEFENSE_DECISION_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { fmtScore, qs } from '../../lib/format.js';
import { pickEnum, pickPage, useUrlParams } from '../../lib/urlParams.js';
import { Badge, PageHeader, Pager, QueryBox } from '../../components/ui.jsx';

// Hai tab của R33: phân công chưa chốt (mặc định) / đã chốt – ánh xạ sang `status` của GET /api/council-assignments
const TABS = [['OPEN', 'Chưa chốt'], ['DECIDED', 'Đã chốt']];
const COLS = 'lg:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_7rem_8rem_8rem]';

// R33 – UI §12.9, API_GD7 §7.2: danh sách đề tài giảng viên được phân công chấm (hội đồng mình là thành viên).
export function DefenseAssignmentsPage() {
  const u = useUrlParams();
  const status = pickEnum(u.get('status'), ['DECIDED']) || 'OPEN';
  const page = pickPage(u.get('page'));
  const query = useQuery({
    queryKey: ['council-assignments', { status, page }],
    queryFn: () => api(`/council-assignments${qs({ status, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <section>
      <PageHeader title="Chấm bảo vệ" description="Đề tài được phân công cho các hội đồng bạn là thành viên." />
      <div role="tablist" aria-label="Trạng thái phân công" className="flex flex-wrap gap-2">
        {TABS.map(([s, label]) => (
          <button key={s} type="button" role="tab" aria-selected={s === status} onClick={() => u.set('status', s === 'OPEN' ? '' : s)}
            className={`min-h-11 rounded-md border px-3 ${s === status ? 'border-blue-700 bg-navy text-white' : 'border-slate-300 bg-card'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <QueryBox query={query} empty="Bạn chưa được phân công chấm đề tài nào." isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              {/* Máy tính: bảng lưới có đầu cột; dưới lg mỗi phân công là một thẻ */}
              <div aria-hidden="true" className={`hidden gap-3 px-4 pb-2 text-xs font-semibold text-muted-foreground uppercase lg:grid ${COLS}`}>
                <span>Đề tài</span><span>Hội đồng</span><span>Vai trò</span><span>Của tôi</span><span>Đã chấm</span>
              </div>
              <ul className="space-y-3">
                {d.items.map((a) => (
                  <li key={a.id} className={`rounded-xl border bg-card p-4 shadow-sm lg:grid lg:items-center lg:gap-3 ${COLS}`}>
                    <span className="block min-w-0">
                      <span className="mr-1.5 text-sm tabular-nums text-muted-foreground">{a.topic.code}</span>
                      <Link to={`/cham-bao-ve/${a.id}`} className="break-words font-semibold text-blue-900 underline-offset-4 hover:underline">{a.topic.title}</Link>
                    </span>
                    <span className="block text-sm"><span className="lg:sr-only">Hội đồng: </span>{a.council.code} – {a.council.name}</span>
                    <span className="block text-sm"><span className="lg:sr-only">Vai trò: </span>{COUNCIL_ROLE_LABEL[a.myRole] ?? '—'}</span>
                    <span className="mt-1 block lg:mt-0"><Badge tone={a.myScore ? 'green' : 'amber'}>{a.myScore ? 'Tôi đã chấm' : 'Chưa chấm'}</Badge></span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm tabular-nums lg:mt-0">
                      Đã chấm {a.scoredCount}/{a.memberCount}
                      {a.decidedAt && <><span>· {fmtScore(a.finalScore)}</span>{a.decision && <Badge tone={a.decision === 'PASSED' ? 'green' : 'red'}>{DEFENSE_DECISION_LABEL[a.decision]}</Badge>}</>}
                    </span>
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
