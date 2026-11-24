import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';
import { toast } from '../../lib/toast.js';
import { SimilarityLevelCell } from '../../components/SimilarityPanel.jsx';
import { Pager, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

const Windows = ({ windows }) => windows.map((w) => `${fmtDateTime(w.joinedAt)} – ${fmtDateTime(w.leftAt)}`).join('; ');

// /lich-su-tham-gia – FR21, API_GD6 §5.4: đề tài đã rời, chỉ xem các phiên bản trong thời gian là thành viên
export function PastTopicsPage() {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['past-topics', page], queryFn: () => api(`/me/past-topics?page=${page}&pageSize=20`) });
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lịch sử tham gia</h1>
      <QueryBox query={query} empty="Bạn chưa rời nhóm nào" isEmpty={(d) => d.items.length === 0}>
        {(d) => (
          <>
            <ul className="space-y-2">
              {d.items.map((t) => (
                <li key={t.topicId} className="rounded-xl border bg-card p-4 shadow-sm">
                  <Link to={`/lich-su-tham-gia/${t.topicId}`} className="break-words font-medium text-blue-700 underline-offset-4 hover:underline">{t.code} – {t.title ?? 'Không có tên trong thời gian bạn tham gia'}</Link>
                  <p className="text-sm text-slate-700">Thời gian tham gia: <Windows windows={t.windows} />. {t.submissionCount} lần gửi, {t.documentCount} tài liệu.</p>
                </li>
              ))}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryBox>
    </section>
  );
}

function PastDocument({ d }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { url } = await api(`/documents/${d.id}/download-url`, { method: 'POST', body: {} });
      window.location.assign(url);
    } catch (err) {
      if (!err.sessionExpired) toast(err.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="space-y-1 rounded-xl border bg-card p-4 shadow-sm">
      <p className="break-all">{d.fileName ?? d.title}</p>
      <p className="text-sm text-slate-700">{d.uploadedBy?.fullName} · {fmtDateTime(d.uploadedAt)}</p>
      {d.kind === 'FILE' && <button type="button" className={btnGhost} disabled={busy} onClick={download}>{busy ? 'Đang xử lý…' : 'Tải về'}</button>}
    </li>
  );
}

// /lich-su-tham-gia/:topicId – chỉ các mục server trả về (đã lọc theo khoảng thời gian)
export function PastTopicDetailPage() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [picked, setPicked] = useState([]);
  const subs = useQuery({ queryKey: ['submissions', topicId], queryFn: async () => (await api(`/topics/${topicId}/submissions`)).items });
  const docs = useQuery({ queryKey: ['documents', topicId], queryFn: async () => (await api(`/topics/${topicId}/documents`)).items });
  const toggle = (seq) => setPicked((p) => (p.includes(seq) ? p.filter((x) => x !== seq) : [...p, seq].slice(-2)));
  const [from, to] = [...picked].sort((a, b) => a - b);
  return (
    <section className="space-y-6">
      <div>
        <Link to="/lich-su-tham-gia" className="inline-flex min-h-11 items-center text-blue-700 underline-offset-4 hover:underline">← Lịch sử tham gia</Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Phiên bản trong thời gian tham gia</h1>
      </div>
      <div>
        <h2 className="font-bold">Các lần gửi hồ sơ</h2>
        <QueryBox query={subs} empty="Không có lần gửi nào trong thời gian bạn tham gia." isEmpty={(d) => d.length === 0}>
          {(items) => (
            <>
              <ul className="mt-2 space-y-2">
                {items.map((s) => (
                  <li key={s.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <label className="inline-flex min-h-11 items-center gap-2">
                      <input type="checkbox" className="size-5" checked={picked.includes(s.seq)} onChange={() => toggle(s.seq)} aria-label={`Chọn lần gửi ${s.seq} để so sánh`} />
                      <Link to={`/de-tai/${topicId}/lan-gui/${s.seq}`} className="font-medium text-blue-700 underline-offset-4 hover:underline">Lần gửi {s.seq}</Link>
                    </label>
                    <p className="flex flex-wrap items-center gap-x-3 text-sm">{fmtDateTime(s.createdAt)} <SimilarityLevelCell level={s.similarityLevel} status={s.similarityStatus} unchecked={s.unchecked} /></p>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={picked.length !== 2} className={`${btnPrimary} mt-2`} onClick={() => navigate(`/de-tai/${topicId}/so-sanh?from=${from}&to=${to}`)}>So sánh 2 lần đã chọn</button>
            </>
          )}
        </QueryBox>
      </div>
      <div>
        <h2 className="font-bold">Tài liệu</h2>
        <QueryBox query={docs} empty="Không có tài liệu nào trong thời gian bạn tham gia." isEmpty={(d) => d.length === 0}>
          {(items) => <ul className="mt-2 space-y-2">{items.map((d) => <PastDocument key={d.id} d={d} />)}</ul>}
        </QueryBox>
      </div>
    </section>
  );
}
