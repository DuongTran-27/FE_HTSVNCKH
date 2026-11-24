import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { invalidateAfterAction, useTopic } from '../../lib/queries.js';
import { toast } from '../../lib/toast.js';
import { RECRUIT_ACTIONS, RecruitActions } from '../../components/RecruitActions.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { Badge, ConfirmDialog, Pager, QueryBox, btnGhost, btnPrimary, card } from '../../components/ui.jsx';
import { ArrowLeft } from 'lucide-react';

const TABS = [['PENDING', 'Chờ duyệt'], ['ACCEPTED', 'Đã nhận'], ['DECLINED', 'Đã từ chối'], ['WITHDRAWN', 'Đã rút']];
const STATUS_LABEL = Object.fromEntries(TABS);
const STATUS_TONE = { PENDING: 'blue', ACCEPTED: 'green', DECLINED: 'red', WITHDRAWN: 'slate' };
// Mã lỗi nghĩa là đơn/đề tài đã đổi trạng thái: đóng hộp thoại, báo bằng toast và tải lại danh sách
const STALE = ['APPLICATION_CLOSED', 'NOT_RECRUITING'];
const COLS = 'lg:grid-cols-[7rem_minmax(0,12rem)_6rem_minmax(0,1fr)_9rem_auto]';

// R29 – UI §12.5, API_GD7 §4.2, §4.4: đơn ứng tuyển của một đề tài; duyệt/từ chối từng đơn, chốt nhóm ở đầu trang.
export function ApplicantsPage() {
  const { id } = useParams();
  const topic = useTopic(id);
  return <section><QueryBox query={topic}>{(t) => <Applicants topic={t} />}</QueryBox></section>;
}

function Applicants({ topic: t }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null); // { kind: 'accept' | 'decline', app }
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['topic-applications', t.id, { status, page }],
    queryFn: () => api(`/topics/${t.id}/applications${qs({ status, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  // Sau mọi lần duyệt/từ chối (kể cả lỗi như GROUP_FULL) tải lại đề tài + danh sách: server là nơi quyết định còn chỗ hay không
  const settle = () => invalidateAfterAction(qc, t.id);
  const handleStale = (err) => {
    if (!STALE.includes(err.code)) return false;
    setDialog(null);
    toast(err.message, { type: 'error' });
    return true;
  };
  const accept = useMutation({
    mutationFn: (app) => api(`/applications/${app.id}/accept`, { method: 'POST', body: {} }),
    onSuccess: () => { setDialog(null); toast('Đã nhận sinh viên vào đề tài', { type: 'success' }); },
    onError: (err) => { if (!err.sessionExpired && !handleStale(err)) setError(err.message); },
    onSettled: settle,
  });
  const decline = async (reason) => {
    try {
      await api(`/applications/${dialog.app.id}/decline`, { method: 'POST', body: { reason } });
    } catch (err) {
      settle();
      if (handleStale(err)) return;
      throw err;
    }
    setDialog(null);
    settle();
    toast('Đã từ chối đơn ứng tuyển', { type: 'success' });
  };
  const open = (kind, app) => { setError(''); setDialog({ kind, app }); };
  const actions = t.availableActions.filter((a) => RECRUIT_ACTIONS.includes(a) && a !== 'PUBLISH_RECRUITMENT');
  const full = t.recruitSlots != null && t.acceptedCount >= t.recruitSlots;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p data-testid="topic-code" className="text-sm font-medium text-muted-foreground">{t.code}</p>
          <h1 className="break-words text-2xl font-bold sm:text-3xl">Ứng viên</h1>
          <p className="mt-1 break-words text-sm text-muted-foreground">{t.title}</p>
        </div>
        <Link to={`/de-tai/${t.id}`} className={btnGhost}><ArrowLeft aria-hidden="true" className="size-4" />Về chi tiết</Link>
      </div>

      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <p className="font-medium" role="status">{t.acceptedCount}/{t.recruitSlots ?? '—'} đã nhận{full && ' – nhóm đã đủ số lượng'}</p>
        {t.status !== 'RECRUITING' && <p className="text-sm text-muted-foreground">Đề tài không còn ở trạng thái đang tuyển; chỉ từ chối được đơn còn chờ.</p>}
        <div className="flex flex-wrap gap-2"><RecruitActions topic={t} actions={actions} /></div>
      </div>

      <div role="tablist" aria-label="Trạng thái đơn" className="flex flex-wrap gap-2">
        {TABS.map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={status === v} onClick={() => { setStatus(v); setPage(1); }}
            className={status === v ? btnPrimary : btnGhost}>{label}</button>
        ))}
      </div>

      <QueryBox query={query} empty="Chưa có sinh viên ứng tuyển." isEmpty={(d) => d.items.length === 0}>
        {(d) => (
          <>
            {/* Máy tính: các dòng là hàng của một bảng lưới có đầu cột; dưới lg mỗi đơn là một thẻ */}
            <div aria-hidden="true" className={`hidden gap-3 px-4 text-xs font-semibold text-muted-foreground uppercase lg:grid ${COLS}`}>
              <span>Mã sinh viên</span><span>Họ tên</span><span>Lớp</span><span>Lời giới thiệu</span><span>Ngày nộp</span><span>Thao tác</span>
            </div>
            <ul className="space-y-3">
              {d.items.map((a) => <ApplicationRow key={a.id} app={a} full={full} onAccept={() => open('accept', a)} onDecline={() => open('decline', a)} />)}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryBox>

      {dialog?.kind === 'accept' && (
        <ConfirmDialog title="Nhận sinh viên" confirmLabel="Đồng ý" busy={accept.isPending} error={error}
          message={`Nhận ${dialog.app.student.fullName} (${dialog.app.student.code}) vào đề tài ${t.code}?`}
          onConfirm={() => accept.mutate(dialog.app)} onCancel={() => setDialog(null)} />
      )}
      {dialog?.kind === 'decline' && (
        <ReasonDialog title="Từ chối đơn ứng tuyển" label="Lý do từ chối" confirmLabel="Từ chối"
          message={`Từ chối ${dialog.app.student.fullName} (${dialog.app.student.code})? Sinh viên sẽ nhận được lý do này.`}
          onSubmit={decline} onCancel={() => setDialog(null)} />
      )}
    </div>
  );
}

function ApplicationRow({ app: a, full, onAccept, onDecline }) {
  const [expanded, setExpanded] = useState(false);
  const canAccept = a.availableActions.includes('ACCEPT');
  const canDecline = a.availableActions.includes('DECLINE');
  return (
    <li className={`rounded-xl border bg-card p-4 shadow-sm lg:grid lg:items-start lg:gap-3 ${COLS}`}>
      <span className="font-medium tabular-nums">{a.student.code}</span>
      <span className="break-words font-medium">{a.student.fullName}</span>
      <span className="text-sm text-muted-foreground">{a.student.classCode}</span>
      <div className="mt-2 min-w-0 lg:mt-0">
        <p className={`whitespace-pre-wrap break-words text-sm ${expanded ? '' : 'line-clamp-2'}`}>{a.coverLetter}</p>
        <button type="button" className="min-h-11 text-sm font-medium text-blue-700 hover:underline" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Thu gọn' : 'Xem toàn văn'}<span className="sr-only"> lời giới thiệu của {a.student.fullName}</span>
        </button>
        {a.reason && <p className="break-words text-sm text-muted-foreground">Lý do: {a.reason}</p>}
      </div>
      <div className="mt-1 space-y-1 text-sm lg:mt-0">
        <p className="text-muted-foreground">{fmtDateTime(a.createdAt)}</p>
        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 lg:mt-0">
        {canAccept && <button type="button" className={btnPrimary} onClick={onAccept}>Đồng ý</button>}
        {canDecline && <button type="button" className={btnGhost} onClick={onDecline}>Từ chối</button>}
        {canAccept && full && <span className="text-xs text-amber-800">Nhóm đã đủ số lượng</span>}
      </div>
    </li>
  );
}
