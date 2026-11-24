import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COUNCIL_ROLE_LABEL, DEFAULT_ROUND_CONFIG, DEFENSE_DECISION_LABEL, FINAL_RESULT_LABEL, TOPIC_STATUS_LABEL,
  defenseFinalizeSchema, defenseScoreSchema, gradeFromDefenseScore,
} from '@nckh/shared';
import { ArrowLeft, FileText, Gavel, MessageSquare, ShieldCheck, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { invalidateExec } from '../../lib/execution.js';
import { fmtDateTime, fmtScore, qs } from '../../lib/format.js';
import { applyServerErrors } from '../../lib/forms.js';
import { invalidateAfterAction, useTopic } from '../../lib/queries.js';
import { toast } from '../../lib/toast.js';
import { FeedbackList } from '../../components/Feedback.jsx';
import { FormField } from '../../components/FormField.jsx';
import { ScoreTable } from '../../components/DefenseSection.jsx';
import { Badge, FormError, Pager, QueryBox, STATUS_TONE, btnGhost, btnPrimary, card, keepOpenOnEscIf, keepOpenOnOutside, useReturnFocus } from '../../components/ui.jsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const h2 = 'flex items-center gap-2 text-sm font-semibold text-blue-900';
// Lỗi đồng thời: dữ liệu đã đổi ở server → hiện thông điệp server và tải lại (UI §12.9)
const RELOAD_CODES = ['NOT_WAITING_DEFENSE', 'CONCURRENT_UPDATE', 'INVALID_TRANSITION'];

/** Tải lại phân công, danh sách R33, đề tài và hội đồng sau mọi lần ghi (kể cả lỗi) */
const refreshAll = (qc, a) => {
  ['council-assignment', 'council-assignments', 'council', 'councils'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  invalidateAfterAction(qc, a.topic.id);
  invalidateExec(qc, a.topic.id);
};

// R34 – UI §12.9, API_GD7 §7: màn chấm một đề tài. Trái: hồ sơ (đề tài, báo cáo tổng kết, điểm quá trình, nhận xét GVHD).
// Phải: điểm của tôi; chủ tịch/thư ký thấy bảng điểm + chốt. Điểm người khác hiện hay ẩn hoàn toàn theo server (`scores`).
export function DefenseScorePage() {
  const { assignmentId } = useParams();
  const query = useQuery({ queryKey: ['council-assignment', assignmentId], queryFn: async () => (await api(`/council-assignments/${assignmentId}`)).assignment });
  return <section><QueryBox query={query}>{(a) => <DefenseScore a={a} />}</QueryBox></section>;
}

// Bố cục 2 cột ≥ lg (phải dính khi cuộn); dưới lg hồ sơ trên, khối chấm dưới
function DefenseScore({ a }) {
  // G62: đề tài đã đóng/hủy thì thành viên hội đồng không còn quyền đọc hồ sơ – không gọi API đề tài
  const closed = ['CLOSED', 'CANCELLED'].includes(a.topic.status);
  const topic = useTopic(a.topic.id, !closed);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground tabular-nums">{a.topic.code} · Hội đồng {a.council.code} – {a.council.name}</p>
          <h1 className="break-words text-2xl font-bold sm:text-3xl">{a.topic.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={STATUS_TONE[a.topic.status]}>{TOPIC_STATUS_LABEL[a.topic.status] ?? a.topic.status}</Badge>
            {a.myRole && <span>Vai trò của bạn: <span className="font-medium">{COUNCIL_ROLE_LABEL[a.myRole]}</span></span>}
          </p>
        </div>
        <Link to="/cham-bao-ve" className={btnGhost}><ArrowLeft aria-hidden="true" className="size-4" />Danh sách chấm</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          {closed
            ? (
              <p role="note" className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-blue-900">
                Đề tài đã đóng – xem kết quả trong <Link to="/kho" className="font-medium underline underline-offset-4">Kho đề tài</Link> nếu đạt.
              </p>
            )
            : <QueryBox query={topic}>{(t) => <Dossier a={a} t={t} />}</QueryBox>}
        </div>
        <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <DecidedCard a={a} />
          {a.cancelledAt && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">Phân công đã bị hủy {fmtDateTime(a.cancelledAt)}.</p>}
          <MyScoreCard a={a} />
          <OfficerCard a={a} topic={topic.data} />
        </div>
      </div>
    </div>
  );
}

// Cột trái: tóm tắt đề tài, nhóm, GVHD, báo cáo tổng kết, điểm quá trình, nhận xét GVHD
function Dossier({ a, t }) {
  return (
    <>
      <div className={card}>
        <h2 className={h2}><Users aria-hidden="true" className="size-4" />Đề tài</h2>
        <p className="mt-2 whitespace-pre-wrap break-words">{t.summary}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">Đợt</dt><dd>{t.round?.name} ({t.round?.academicYear})</dd>
          <dt className="text-muted-foreground">GVHD</dt><dd>{t.advisor?.fullName ?? a.topic.advisor?.fullName ?? '—'}</dd>
          <dt className="text-muted-foreground">Nhóm</dt>
          <dd><ul>{t.members.map((m) => <li key={m.userId}>{m.fullName} ({m.code}){m.role === 'LEADER' && ' – Trưởng nhóm'}</li>)}</ul></dd>
        </dl>
        <Link to={`/de-tai/${t.id}`} className="mt-3 inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:underline">Xem trang đề tài</Link>
      </div>
      <FinalReports topicId={t.id} />
      {a.processScore && (
        <div className={card}>
          <h2 className={h2}><ShieldCheck aria-hidden="true" className="size-4" />Điểm quá trình</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums">{fmtScore(a.processScore.score)}<span className="text-base font-normal text-muted-foreground">/10</span></p>
          <p className="mt-2 whitespace-pre-wrap break-words">{a.processScore.comment}</p>
          {a.topic.advisor && <p className="mt-1 text-sm text-muted-foreground">{a.topic.advisor.fullName}</p>}
        </div>
      )}
      <AdvisorFeedbacks topicId={t.id} />
    </>
  );
}

// "Báo cáo tổng kết": tài liệu stage=FINAL, tải về qua URL ký mỗi lần bấm (FR24, kiểm quyền + ghi lịch sử ở server)
function FinalReports({ topicId }) {
  const docs = useQuery({ queryKey: ['documents', topicId, 'FINAL'], queryFn: async () => (await api(`/topics/${topicId}/documents${qs({ stage: 'FINAL' })}`)).items });
  const [busy, setBusy] = useState(null);
  const download = async (d) => {
    setBusy(d.id);
    try {
      const { url } = await api(`/documents/${d.id}/download-url`, { method: 'POST', body: {} });
      window.location.assign(url);
    } catch (err) {
      if (!err.sessionExpired) toast(err.message, { type: 'error' });
    } finally { setBusy(null); }
  };
  return (
    <div className={card}>
      <h2 className={h2}><FileText aria-hidden="true" className="size-4" />Báo cáo tổng kết</h2>
      <div className="mt-2">
        <QueryBox query={docs} empty="Chưa có báo cáo tổng kết." isEmpty={(d) => d.length === 0}>
          {(items) => (
            <ul className="divide-y">
              {items.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block break-all font-medium">{d.fileName}</span>
                    <span className="block text-sm text-muted-foreground">Phiên bản {d.version} · {fmtDateTime(d.uploadedAt)}</span>
                  </span>
                  {d.kind === 'FILE' && <button type="button" className={btnGhost} disabled={busy === d.id} onClick={() => download(d)}>{busy === d.id ? 'Đang xử lý…' : 'Tải về'}<span className="sr-only"> {d.fileName}</span></button>}
                  {d.kind === 'LINK' && d.externalUrl?.startsWith('https://') && <a href={d.externalUrl} target="_blank" rel="noopener noreferrer" className={btnGhost}>Mở đường dẫn</a>}
                </li>
              ))}
            </ul>
          )}
        </QueryBox>
      </div>
    </div>
  );
}

// "Nhận xét của GVHD": mọi nhận xét của đề tài, phân trang server
function AdvisorFeedbacks({ topicId }) {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['feedbacks', topicId, { page }], placeholderData: keepPreviousData,
    queryFn: () => api(`/topics/${topicId}/feedbacks${qs({ page, pageSize: 20 })}`),
  });
  return (
    <div className={card}>
      <h2 className={h2}><MessageSquare aria-hidden="true" className="size-4" />Nhận xét của GVHD</h2>
      <div className="mt-2">
        <QueryBox query={q}>
          {(d) => (<><FeedbackList items={d.items} /><Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} /></>)}
        </QueryBox>
      </div>
    </div>
  );
}

// Kết quả đã chốt (chỉ đọc): điểm cuối, Đạt/Không đạt, biên bản, người chốt
function DecidedCard({ a }) {
  if (!a.decidedAt) return null;
  return (
    <div className={card}>
      <h2 className={h2}><Gavel aria-hidden="true" className="size-4" />Kết quả hội đồng</h2>
      <p className="mt-2 flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-bold tabular-nums">{fmtScore(a.finalScore)}</span>
        {a.decision && <Badge tone={a.decision === 'PASSED' ? 'green' : 'red'}>{DEFENSE_DECISION_LABEL[a.decision]}</Badge>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Chốt bởi {a.decidedBy?.fullName ?? '—'} · {fmtDateTime(a.decidedAt)}</p>
      {a.minutes && <><p className="mt-3 text-sm font-medium">Biên bản</p><p className="whitespace-pre-wrap break-words">{a.minutes}</p></>}
    </div>
  );
}

// "Điểm của tôi": form khi server cho SCORE (điền sẵn nếu đã chấm); không thì chỉ đọc điểm đã chấm
function MyScoreCard({ a }) {
  const canScore = a.availableActions.includes('SCORE');
  if (!canScore && !a.myScore) return null;
  return (
    <div className={card}>
      <h2 className={h2}><ShieldCheck aria-hidden="true" className="size-4" />Điểm của tôi</h2>
      {canScore
        ? <ScoreForm key={a.myScore?.updatedAt ?? 'new'} a={a} />
        : (
          <>
            <p className="mt-2 text-3xl font-bold tabular-nums">{fmtScore(a.myScore.score)}<span className="text-base font-normal text-muted-foreground">/10</span></p>
            <p className="mt-2 whitespace-pre-wrap break-words">{a.myScore.comment}</p>
          </>
        )}
    </div>
  );
}

// Form chấm (defenseScoreSchema dùng chung, server kiểm lại). Lỗi đồng thời (đã chốt, đề tài đổi trạng thái) → thông điệp server + tải lại
function ScoreForm({ a }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(defenseScoreSchema),
    defaultValues: { score: a.myScore ? Number(a.myScore.score) : undefined, comment: a.myScore?.comment ?? '' },
  });
  const submit = async (body) => {
    try {
      const r = await api(`/council-assignments/${a.id}/my-score`, { method: 'PUT', body });
      qc.setQueryData(['council-assignment', a.id], r.assignment);
      toast(a.myScore ? 'Đã cập nhật điểm' : 'Đã lưu điểm', { type: 'success' });
    } catch (err) {
      if (err.sessionExpired) return;
      if (err.code === 'ASSIGNMENT_DECIDED') { toast(err.message, { type: 'error' }); return; }
      const msgs = applyServerErrors(err, setError, ['score', 'comment']);
      if (msgs.length) setError('root', { message: `${msgs.join(' ')}${err.status === 409 ? '. Dữ liệu đã được tải lại.' : ''}` });
    } finally { refreshAll(qc, a); }
  };
  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="mt-2 space-y-3" aria-label="Điểm của tôi">
      <FormField label="Điểm (thang 10)" error={errors.score?.message} hint="Tối đa 2 chữ số thập phân, ví dụ 7,25">
        <input type="number" inputMode="decimal" min={0} max={10} step={0.25} {...register('score', { valueAsNumber: true })} />
      </FormField>
      <FormField label="Nhận xét" error={errors.comment?.message} hint="Tối thiểu 10 ký tự">
        <textarea rows={5} maxLength={5000} {...register('comment')} />
      </FormField>
      <FormError error={errors.root?.message} />
      {/* Dưới lg nút lưu dính đáy màn hình để không phải cuộn tìm */}
      <div className="max-lg:sticky max-lg:bottom-0 max-lg:-mx-4 max-lg:border-t max-lg:bg-card max-lg:px-4 max-lg:py-2">
        <button type="submit" disabled={isSubmitting} className={`${btnPrimary} max-lg:w-full`}>{isSubmitting ? 'Đang lưu…' : a.myScore ? 'Cập nhật điểm' : 'Lưu điểm'}</button>
      </div>
    </form>
  );
}

/** Trung bình tạm tính ở client (chỉ để hiển thị – điểm cuối do server tính khi chốt), chuỗi 2 chữ số */
export const previewAverage = (scores) => (scores.length ? (scores.reduce((s, x) => s + Number(x.score), 0) / scores.length).toFixed(2) : null);

// Chủ tịch/thư ký (và mọi người sau chốt): bảng điểm mọi thành viên – chỉ hiện khi server trả `scores`; nút chốt theo FINALIZE
function OfficerCard({ a, topic }) {
  const [finalizing, setFinalizing] = useState(false);
  const canFinalize = a.availableActions.includes('FINALIZE');
  if (!a.scores.length && !canFinalize) return null;
  const avg = previewAverage(a.scores);
  return (
    <div className={card}>
      <h2 className={h2}><Users aria-hidden="true" className="size-4" />Bảng điểm hội đồng</h2>
      <p className="mt-1 text-sm tabular-nums">Đã chấm {a.scoredCount}/{a.memberCount}</p>
      {a.scores.length > 0 && <ScoreTable scores={a.scores} />}
      {!a.decidedAt && avg && <p className="mt-3">Điểm trung bình tạm tính: <span className="text-xl font-bold tabular-nums">{fmtScore(avg)}</span></p>}
      {canFinalize && (
        <button type="button" className={`${btnPrimary} mt-3`} disabled={!topic} onClick={() => setFinalizing(true)}>Chốt nghiệm thu</button>
      )}
      {finalizing && topic && <FinalizeDialog a={a} topic={topic} avg={avg} onClose={() => setFinalizing(false)} />}
    </div>
  );
}

// Hộp chốt 2 bước: (1) biên bản + xem trước kết quả, (2) xác nhận. Gửi { version: topic.version, minutes } (API_GD7 §7.4)
function FinalizeDialog({ a, topic, avg, onClose }) {
  const qc = useQueryClient();
  const returnFocus = useReturnFocus();
  const [step, setStep] = useState(1);
  const [error, setError] = useState(null); // { message, lines }
  const [busy, setBusy] = useState(false);
  const form = useForm({ resolver: zodResolver(defenseFinalizeSchema), defaultValues: { version: topic.version, minutes: '' } });
  const { register, handleSubmit, getValues, formState: { errors, isDirty } } = form;
  const grades = topic.round?.effectiveConfig?.defenseGrades ?? DEFAULT_ROUND_CONFIG.defenseGrades;
  const preview = avg ? `${Number(avg) >= 5 ? DEFENSE_DECISION_LABEL.PASSED : DEFENSE_DECISION_LABEL.FAILED} – ${FINAL_RESULT_LABEL[gradeFromDefenseScore(avg, grades)]}` : null;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      // version mới nhất của đề tài (đã tải lại sau lỗi đồng thời), không lấy giá trị lúc mở hộp
      const r = await api(`/council-assignments/${a.id}/finalize`, { method: 'POST', body: { version: topic.version, minutes: getValues('minutes') } });
      qc.setQueryData(['council-assignment', a.id], r.assignment);
      qc.setQueryData(['topic', a.topic.id], r.topic);
      toast(`Đã chốt nghiệm thu đề tài ${a.topic.code}`, { type: 'success' });
      onClose();
    } catch (err) {
      if (err.sessionExpired) return;
      if (err.code === 'ASSIGNMENT_DECIDED' || err.status === 403) { toast(err.message, { type: 'error' }); onClose(); return; }
      const missing = (err.details?.missing ?? []).map((m) => `${m.fullName} (${COUNCIL_ROLE_LABEL[m.role] ?? m.role})`);
      const fieldMsgs = err.code === 'VALIDATION_ERROR' ? applyServerErrors(err, form.setError, ['minutes']) : [err.message];
      setError({ message: `${fieldMsgs.join(' ')}${RELOAD_CODES.includes(err.code) ? '. Dữ liệu đã được tải lại.' : ''}`, lines: missing });
      setStep(1);
    } finally { setBusy(false); refreshAll(qc, a); }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} {...keepOpenOnOutside} {...keepOpenOnEscIf(isDirty)} {...returnFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Chốt nghiệm thu</DialogTitle>
        {step === 1
          ? (
            <form noValidate onSubmit={handleSubmit(() => setStep(2))} className="space-y-3">
              <DialogDescription>{a.topic.code} – {a.topic.title}</DialogDescription>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p>Điểm trung bình tạm tính: <span className="font-bold tabular-nums">{avg ? fmtScore(avg) : '—'}</span> (đã chấm {a.scoredCount}/{a.memberCount})</p>
                {preview && <p>Kết quả dự kiến: <span className="font-medium">{preview}</span></p>}
                <p className="text-muted-foreground">Chỉ để xem trước – điểm cuối do hệ thống tính khi chốt.</p>
              </div>
              <FormField label="Biên bản/nhận xét chung" error={errors.minutes?.message} hint="Tối thiểu 20 ký tự">
                <textarea rows={6} maxLength={5000} {...register('minutes')} />
              </FormField>
              {error && (
                <div role="alert" className="break-words text-sm text-red-700">
                  <p>{error.message}</p>
                  {error.lines.length > 0 && <ul className="list-disc pl-5">{error.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={onClose} className={btnGhost}>Hủy</button>
                <button type="submit" className={btnPrimary}>Tiếp tục</button>
              </div>
            </form>
          )
          : (
            <div className="space-y-3">
              <DialogDescription className="text-amber-900">Hành động này sẽ khóa toàn bộ điểm và chuyển đề tài sang Chờ đóng. Bạn có chắc chắn?</DialogDescription>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={onClose} className={btnGhost}>Hủy</button>
                <button type="button" onClick={send} disabled={busy} className={btnPrimary}>{busy ? 'Đang chốt…' : 'Chốt nghiệm thu'}</button>
              </div>
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
