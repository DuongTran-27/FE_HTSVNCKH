import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTION_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { invalidateAfterAction, useSimilarityLatest } from '../../lib/queries.js';
import { justificationState, needsFreshCheck } from '../../lib/similarity.js';
import { PUBLISH_FIELDS, SUBMIT_FIELDS, submitProblems, topicToForm } from '../../lib/topicForm.js';
import { toast } from '../../lib/toast.js';
import { useCooldown } from '../../lib/useCooldown.js';
import { FormField } from '../../components/FormField.jsx';
import { SimilarityPanel } from '../../components/SimilarityPanel.jsx';
import { BypassNote } from '../../components/SimilarityBypass.jsx';
import { QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

// R10 – UI §4.10, API §8.2. Cũng là trang công bố đề tài tuyển của giảng viên (UI §12.5, U12): cùng 4 bước, đổi action PUBLISH_RECRUITMENT,
// danh sách điều kiện (thêm số sinh viên cần tuyển) và lời báo thành công (không có lần gửi/snapshot).
export function SubmitPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['topic', id], queryFn: async () => (await api(`/topics/${id}`)).topic });
  return <section><QueryBox query={query}>{(t) => <Submit topic={t} />}</QueryBox></section>;
}

function Submit({ topic: t }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const action = ['SUBMIT_FOR_REVIEW', 'RESUBMIT', 'PUBLISH_RECRUITMENT'].find((a) => t.availableActions.includes(a));
  useEffect(() => { if (!action) navigate(`/de-tai/${t.id}`, { replace: true }); }, [action, t.id, navigate]);
  const publish = action === 'PUBLISH_RECRUITMENT';
  const problems = submitProblems(topicToForm(t), t.round.effectiveConfig, publish);
  const missing = (publish ? PUBLISH_FIELDS : SUBMIT_FIELDS).filter(([k]) => problems[k]);
  const complete = missing.length === 0;

  const latest = useSimilarityLatest(t.id, !!action && complete);
  const [fresh, setFresh] = useState(null); // kết quả vừa chạy hoặc từ details của lỗi, ưu tiên hơn `latest`
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const cd = useCooldown();
  const box = useRef(null);
  const check = fresh ?? latest.data ?? null;
  const st = justificationState(check, text);

  const run = useMutation({
    mutationFn: () => api(`/topics/${t.id}/similarity-checks`, { method: 'POST' }),
    onMutate: () => setError(''),
    onSuccess: (r) => setFresh(r.similarityCheck),
    onError: (err) => { if (err.sessionExpired) return; if (err.status === 429) cd.start(err.retryAfter); setError(err.message); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['similarity-latest', t.id] }); qc.invalidateQueries({ queryKey: ['topic', t.id] }); qc.invalidateQueries({ queryKey: ['topics'] }); },
  });
  // Tự chạy "Kiểm tra trước" đúng một lần khi chưa có kết quả / kết quả cũ (UI §4.10 bước 2, U3)
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !action || !complete || latest.isPending || latest.isError) return;
    auto.current = true;
    if (needsFreshCheck(latest.data)) run.mutate();
  }, [action, complete, latest.isPending, latest.isError, latest.data, run]);

  const submit = useMutation({
    mutationFn: () => api(`/topics/${t.id}/actions`, { method: 'POST', body: { action, version: t.version, ...(text.trim() ? { justification: text.trim() } : {}) } }),
    onMutate: () => setError(''),
    onSuccess: (r) => {
      qc.setQueryData(['topic', t.id], r.topic);
      toast(publish ? 'Đã công bố đề tài, sinh viên có thể ứng tuyển' : `Đã gửi hồ sơ lần ${r.submission.seq}${r.submission.unchecked ? ' (chưa kiểm tra được trùng lặp, hệ thống sẽ tự kiểm tra lại)' : ''}`, { type: 'success' });
      navigate(`/de-tai/${t.id}`);
    },
    onError: (err) => {
      if (err.sessionExpired) return;
      if (err.code === 'JUSTIFICATION_REQUIRED' || err.code === 'SIMILARITY_NOT_CHECKED') {
        if (err.details?.similarityCheck) setFresh(err.details.similarityCheck);
        setError(err.code === 'SIMILARITY_NOT_CHECKED' ? 'Chưa kiểm tra được, vui lòng thử lại' : err.message);
        if (err.code === 'JUSTIFICATION_REQUIRED') setTimeout(() => box.current?.focus(), 0);
      } else if (err.code === 'TOPIC_INCOMPLETE' && t.permissions?.edit) {
        navigate(`/de-tai/${t.id}/sua`, { state: { incomplete: err.details } });
      } else if (err.code === 'INVALID_TRANSITION') {
        toast(err.message, { type: 'error' });
        navigate(`/de-tai/${t.id}`, { replace: true });
      } else setError(err.message); // REGISTRATION_CLOSED, CONCURRENT_UPDATE, 429...
    },
    // Lỗi JUSTIFICATION_REQUIRED/SIMILARITY_NOT_CHECKED cũng đã ghi một lần kiểm mới ở server (UI §9.2)
    onSettled: () => invalidateAfterAction(qc, t.id),
  });

  const label = ACTION_LABEL[action] ?? 'Gửi';
  return (
    <div className="max-w-2xl space-y-4">
      <header>
        <p className="text-sm text-slate-700">{t.code}</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{label}</h1>
      </header>

      <div>
        <h2 className="font-bold">1. Đủ trường bắt buộc</h2>
        {complete ? <p className="text-green-800">Đạt</p> : (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <ul className="list-disc pl-5">{missing.map(([k, l]) => <li key={k}>{l}: {problems[k]}</li>)}</ul>
            {t.permissions?.edit
              ? <Link to={`/de-tai/${t.id}/sua`} className={`${btnGhost} mt-2`}>Sửa hồ sơ</Link>
              : <p className="mt-2">Hồ sơ không còn đạt yêu cầu hiện tại của đợt (có thể cán bộ vừa đổi cấu hình). Vui lòng liên hệ cán bộ khoa.</p>}
          </div>
        )}
      </div>

      {complete && (
        <>
          <div className="space-y-2">
            <h2 className="font-bold">2. Kiểm tra trùng lặp</h2>
            <BypassNote bypass={t.similarityBypass} />
            {run.isPending || latest.isPending ? <p role="status">Đang kiểm tra trùng lặp…</p>
              : latest.isError && !fresh ? (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                  <p className="break-words">{latest.error.message}</p>
                  <button type="button" className={`${btnGhost} mt-2`} onClick={() => latest.refetch()}>Thử lại</button>
                </div>
              ) : <SimilarityPanel check={check} />}
            <button type="button" className={btnGhost} disabled={run.isPending || cd.active} onClick={() => run.mutate()}>{st.kind === 'error' ? 'Thử lại' : 'Kiểm tra lại'}</button>
            {cd.active && <p role="status" className="text-sm text-amber-900">{cd.message}</p>}
          </div>

          {(st.kind === 'review' || st.kind === 'high') && (
            <div>
              <h2 className="font-bold">3. Giải trình</h2>
              <FormField label={st.required ? 'Giải trình (bắt buộc)' : 'Giải trình (tùy chọn)'}
                hint={st.required ? `${st.words}/${st.min} từ` : undefined} error={st.required && !st.ok ? `Cần giải trình tối thiểu ${st.min} từ` : undefined}>
                <textarea ref={box} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
              </FormField>
            </div>
          )}

          <div>
            <h2 className="font-bold">{publish ? '4. Công bố' : '4. Gửi'}</h2>
            {error && <p role="alert" className="mb-2 break-words rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
            <button type="button" className={btnPrimary} disabled={submit.isPending || run.isPending || (!st.ok && !(st.kind === 'unchecked' && t.similarityBypass))} onClick={() => submit.mutate()}>
              {submit.isPending ? 'Đang xử lý…' : label}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
