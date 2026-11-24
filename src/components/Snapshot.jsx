import { ACTION_LABEL } from '@nckh/shared';
import { fmtDateTime } from '../lib/format.js';
import { Badge } from './ui.jsx';

const Block = ({ title, children }) => (
  <div><h3 className="text-sm font-semibold text-blue-900">{title}</h3><div className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed text-slate-800">{children}</div></div>
);

/** Nội dung bất biến của một lần gửi (payload, FR17) */
export function SnapshotBody({ payload }) {
  return (
    <div className="space-y-4">
      <h2 className="break-words text-lg font-semibold">{payload.title}</h2>
      <Block title="Tóm tắt">{payload.summary || '—'}</Block>
      <Block title="Mục tiêu">{payload.objectives || '—'}</Block>
      <Block title="Lĩnh vực">{payload.fieldName || '—'}</Block>
      <div><h3 className="text-sm font-semibold text-blue-900">Từ khóa</h3><div className="mt-2 flex flex-wrap gap-1.5">{payload.keywords?.length ? payload.keywords.map((k) => <Badge key={k} tone="blue">{k}</Badge>) : '—'}</div></div>
    </div>
  );
}

/** Quyết định của cán bộ; decision null -> "Chưa xử lý" */
export function DecisionBox({ decision, title = 'Quyết định' }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm" data-testid="decision-box">
      <h3 className="font-semibold">{title}</h3>
      {decision ? (
        <>
          <p>{ACTION_LABEL[decision.action] ?? decision.action}</p>
          {decision.reason && <p className="whitespace-pre-wrap break-words">Lý do: {decision.reason}</p>}
          <p className="text-sm text-slate-700">{decision.decidedBy?.fullName} · {fmtDateTime(decision.decidedAt)}</p>
        </>
      ) : <p>Chưa xử lý</p>}
    </div>
  );
}
