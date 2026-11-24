import { useQuery } from '@tanstack/react-query';
import { CHANGE_STAGE_LABEL, CHANGE_TYPE_LABEL, REQUEST_STATUS_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { qs } from '../lib/format.js';
import { pickEnum, pickPage, useUrlParams } from '../lib/urlParams.js';
import { ChangeRequestCard } from '../components/ChangeRequestCard.jsx';
import { inputClass } from '../components/FormField.jsx';
import { Options, Pager, QueryBox } from '../components/ui.jsx';

const Select = ({ label, value, onChange, labels, placeholder }) => (
  <select aria-label={label} className={`${inputClass} sm:max-w-56`} value={value} onChange={(e) => onChange(e.target.value)}>
    <Options placeholder={placeholder} options={Object.entries(labels).map(([v, l]) => ({ value: v, label: l }))} />
  </select>
);

// /yeu-cau – API_GD6 §2.4, §12. Mặc định "đang chờ"; cán bộ lọc bước "Chờ cán bộ khoa duyệt" để thấy hàng chờ
export function ChangeRequestsPage() {
  const { user } = useAuth();
  const u = useUrlParams();
  const status = pickEnum(u.get('status'), [...Object.keys(REQUEST_STATUS_LABEL), 'ALL']) || 'PENDING';
  const type = pickEnum(u.get('type'), Object.keys(CHANGE_TYPE_LABEL));
  const stage = pickEnum(u.get('stage'), Object.keys(CHANGE_STAGE_LABEL));
  const page = pickPage(u.get('page'));
  const params = { status: status === 'ALL' ? '' : status, type, stage, page, pageSize: 20 };
  const query = useQuery({ queryKey: ['change-requests', 'all', params], queryFn: () => api(`/change-requests${qs(params)}`) });
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Yêu cầu thay đổi</h1>
      <div className="flex flex-wrap gap-2">
        <Select label="Trạng thái" value={status} onChange={(v) => u.set('status', v === 'PENDING' ? '' : v)} labels={{ ...REQUEST_STATUS_LABEL, ALL: 'Tất cả' }} />
        <Select label="Loại yêu cầu" value={type} onChange={(v) => u.set('type', v)} labels={CHANGE_TYPE_LABEL} placeholder="Mọi loại" />
        <Select label="Bước xử lý" value={stage} onChange={(v) => u.set('stage', v)} labels={CHANGE_STAGE_LABEL} placeholder="Mọi bước" />
      </div>
      <QueryBox query={query} empty={status === 'PENDING' ? 'Không có yêu cầu đang chờ' : 'Không có yêu cầu nào'} isEmpty={(d) => d.items.length === 0}>
        {(d) => (
          <>
            <ul className="space-y-3">
              {d.items.map((cr) => <ChangeRequestCard key={cr.id} cr={cr} linkTopic={!(cr.type === 'TOPIC_CHANGE' && cr.target?.id === user.id)} />)}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => u.set('page', String(p))} />
          </>
        )}
      </QueryBox>
    </section>
  );
}
