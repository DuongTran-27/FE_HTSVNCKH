import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';
import { wordDiff } from '../../lib/diff.js';
import { useSubmissions } from '../../lib/queries.js';
import { Badge, QueryBox } from '../../components/ui.jsx';

const FIELDS = [['title', 'Tên đề tài'], ['summary', 'Tóm tắt'], ['objectives', 'Mục tiêu']];

// side 'from' hiện phần bị xóa, 'to' hiện phần thêm; phần giữ nguyên hiện ở cả hai
function Diff({ parts, side }) {
  const hide = side === 'from' ? 'add' : 'del';
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.filter((p) => p.type !== hide).map((p, i) => (p.type === 'same'
        ? <span key={i}>{side === 'from' ? p.old ?? p.text : p.text}</span>
        : p.type === 'add'
          ? <ins key={i} className="bg-green-100 text-green-900 no-underline" data-testid="diff-add">{p.text}</ins>
          : <del key={i} className="bg-red-100 text-red-900" data-testid="diff-del">{p.text}</del>))}
    </p>
  );
}

function DiffView({ id, from, to }) {
  const query = useQuery({
    queryKey: ['submission-diff', id, from, to],
    queryFn: () => api(`/topics/${id}/submission-diff?from=${from}&to=${to}`),
  });
  return (
    <QueryBox query={query}>
      {(d) => (
        <div className="space-y-4">
          <div className="grid gap-2 lg:grid-cols-2 text-sm text-slate-700">
            <p>Cũ: lần gửi {d.from.seq} · {fmtDateTime(d.from.createdAt)}</p>
            <p>Mới: lần gửi {d.to.seq} · {fmtDateTime(d.to.createdAt)}</p>
          </div>
          {FIELDS.map(([key, label]) => {
            const parts = wordDiff(d.from.payload[key] ?? '', d.to.payload[key] ?? '');
            return (
              <div key={key}>
                <h2 className="font-bold">{label} {d.changes[key] ? <Badge tone="amber">Có thay đổi</Badge> : <Badge>Không đổi</Badge>}</h2>
                <div className="grid gap-2 lg:grid-cols-2">
                  <div><p className="text-sm font-medium text-slate-700 lg:hidden">Cũ</p><Diff parts={parts} side="from" /></div>
                  <div><p className="text-sm font-medium text-slate-700 lg:hidden">Mới</p><Diff parts={parts} side="to" /></div>
                </div>
              </div>
            );
          })}
          <div>
            <h2 className="font-bold">Lĩnh vực {d.changes.fieldId ? <Badge tone="amber">Có thay đổi</Badge> : <Badge>Không đổi</Badge>}</h2>
            <div className="grid gap-2 lg:grid-cols-2">
              <div><p className="text-sm font-medium text-slate-700 lg:hidden">Cũ</p><p>{d.from.payload.fieldName}</p></div>
              <div><p className="text-sm font-medium text-slate-700 lg:hidden">Mới</p><p>{d.to.payload.fieldName}</p></div>
            </div>
          </div>
          <div>
            <h2 className="font-bold">Từ khóa</h2>
            {d.changes.keywords.added.length === 0 && d.changes.keywords.removed.length === 0 && <p>Không đổi</p>}
            <div className="flex flex-wrap gap-1">
              {d.changes.keywords.added.map((k) => <Badge key={`a${k}`} tone="green">+ {k}</Badge>)}
              {d.changes.keywords.removed.map((k) => <Badge key={`r${k}`} tone="red">− {k}</Badge>)}
            </div>
          </div>
        </div>
      )}
    </QueryBox>
  );
}

// R13 – API_GD2 §8.4. Mặc định: lần trước và lần mới nhất
export function SubmissionDiffPage() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const qFrom = Number(sp.get('from'));
  const qTo = Number(sp.get('to'));
  const given = qFrom > 0 && qTo > 0 && qFrom !== qTo;
  const subs = useSubmissions(id, !given);
  return (
    <section>
      <Link to={`/de-tai/${id}/lich-su`} className="inline-flex min-h-11 items-center text-blue-700 underline-offset-4 hover:underline">← Lịch sử</Link>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">So sánh các lần gửi</h1>
      <div className="mt-3">
        {given ? <DiffView id={id} from={Math.min(qFrom, qTo)} to={Math.max(qFrom, qTo)} /> : (
          <QueryBox query={subs} empty="Cần có ít nhất 2 lần gửi để so sánh." isEmpty={(d) => d.length < 2}>
            {(items) => <DiffView id={id} from={items[1].seq} to={items[0].seq} />}
          </QueryBox>
        )}
      </div>
    </section>
  );
}
