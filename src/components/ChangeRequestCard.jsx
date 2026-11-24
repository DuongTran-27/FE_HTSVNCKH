import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CHANGE_STAGE_LABEL, CHANGE_TYPE_LABEL, REQUEST_STATUS_LABEL, ROLE_LABEL } from '@nckh/shared';
import { api } from '../lib/api.js';
import { GONE_CODES, invalidateChangeRequests } from '../lib/changeRequests.js';
import { fmtDateTime } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import { useCooldown } from '../lib/useCooldown.js';
import { ReasonDialog } from './ReasonDialog.jsx';
import { SimilarityPanel } from './SimilarityPanel.jsx';
import { Badge, ConfirmDialog, btnDanger, btnGhost, btnPrimary } from './ui.jsx';

const FIELD_LABEL = { title: 'Tên đề tài', summary: 'Tóm tắt', objectives: 'Mục tiêu', keywords: 'Từ khóa', fieldId: 'Lĩnh vực' };
const show = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? '—'));
const TONE = { PENDING: 'amber', ACCEPTED: 'green', DECLINED: 'red', WITHDRAWN: 'slate' };

/** Nội dung riêng của từng loại (API_GD6 §2.1) */
function Payload({ cr }) {
  const p = cr.payload ?? {};
  if (cr.type === 'ADVISOR_CHANGE') {
    return <p>Thay <strong>{p.from?.fullName}</strong> bằng <strong>{p.to?.fullName}</strong>.</p>;
  }
  if (cr.type === 'CANCEL') return <p>Đề nghị hủy đề tài do {p.requesterRole === 'LECTURER' ? 'giảng viên hướng dẫn' : 'trưởng nhóm'} gửi.</p>;
  if (cr.type === 'LEAVE_GROUP') {
    return <p><strong>{p.member?.fullName}</strong> ({p.member?.code}) xin rời nhóm. Nhóm hiện có {p.memberCountBefore} thành viên.</p>;
  }
  const keys = Object.keys(p.after ?? {}).filter((k) => FIELD_LABEL[k]);
  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const [b, a] = k === 'fieldId' ? [p.before?.fieldName, p.after?.fieldName] : [p.before?.[k], p.after?.[k]];
        return (
          <div key={k} className="grid gap-1 sm:grid-cols-2">
            <div className="rounded bg-red-50 p-2"><p className="text-xs font-medium">{FIELD_LABEL[k]} – trước</p><p className="whitespace-pre-wrap break-words">{show(b)}</p></div>
            <div className="rounded bg-green-50 p-2"><p className="text-xs font-medium">{FIELD_LABEL[k]} – sau</p><p className="whitespace-pre-wrap break-words">{show(a)}</p></div>
          </div>
        );
      })}
      {p.addMember && <p>Thêm thành viên: <strong>{p.addMember.fullName}</strong> ({p.addMember.code})</p>}
      {cr.similarityCheck && <SimilarityPanel check={cr.similarityCheck} />}
    </div>
  );
}

/** Hậu quả của việc duyệt, nêu trong hộp xác nhận theo loại (MINOR T607a) */
const approveMessage = (cr) => {
  const p = cr.payload ?? {};
  if (cr.type === 'ADVISOR_CHANGE') return `${p.to?.fullName} sẽ là giảng viên hướng dẫn mới; ${p.from?.fullName} mất mọi quyền với đề tài (trừ khi được cấp quyền đọc). Có hiệu lực ngay.`;
  if (cr.type === 'LEAVE_GROUP') return `${p.member?.fullName} sẽ rời nhóm ngay và chỉ xem được các phiên bản hồ sơ, tài liệu trong thời gian đã tham gia.`;
  if (cr.type === 'TOPIC_CHANGE') return `Hồ sơ đề tài được cập nhật theo nội dung "sau"${p.addMember ? `; ${p.addMember.fullName} được thêm vào nhóm` : ''}. Không tạo lần gửi mới. Có hiệu lực ngay.`;
  return 'Duyệt yêu cầu này? Thay đổi có hiệu lực ngay.';
};

/** Thẻ một yêu cầu + nút theo `availableActions` của server (API_GD6 §2.2) */
export function ChangeRequestCard({ cr, linkTopic = true }) {
  const qc = useQueryClient();
  const cd = useCooldown();
  const [dlg, setDlg] = useState(null); // 'DECLINE' | 'APPROVE' | 'WITHDRAW' | 'ACCEPT'
  const [error, setError] = useState('');
  const act = useMutation({
    mutationFn: ({ path, body }) => api(`/change-requests/${cr.id}/${path}`, { method: 'POST', body }),
    onSettled: () => invalidateChangeRequests(qc, cr.topic.id),
  });
  // Ném lại lỗi để hộp thoại hiện; yêu cầu đã đóng/đề tài đổi → thông điệp + tải lại (đã invalidate ở onSettled)
  const run = async (path, body = {}) => {
    try {
      await act.mutateAsync({ path, body });
      setDlg(null);
      toast('Đã cập nhật yêu cầu', { type: 'success' });
    } catch (err) {
      if (err.sessionExpired) return;
      if (err.status === 429) cd.start(err.retryAfter);
      if (GONE_CODES.has(err.code)) { setDlg(null); toast(err.message, { type: 'error' }); return; }
      throw err;
    }
  };
  const confirm = (path) => () => { setError(''); run(path).catch((e) => setError(e.message)); };
  const has = (a) => cr.availableActions?.includes(a) ?? false;
  const open = (d) => () => { setError(''); setDlg(d); };
  const off = cd.active || act.isPending;
  const title = cr.topic.title ?? `Đề tài ${cr.topic.code}`;
  const needReason = cr.type === 'CANCEL';

  return (
    <li className="space-y-2 rounded-xl border bg-card p-4 shadow-sm" data-testid="change-request">
      <p className="flex flex-wrap items-center gap-2">
        <Badge>{CHANGE_TYPE_LABEL[cr.type]}</Badge>
        <Badge tone={TONE[cr.status]}>{REQUEST_STATUS_LABEL[cr.status]}</Badge>
        {cr.stage && <span className="text-sm">{CHANGE_STAGE_LABEL[cr.stage]}</span>}
      </p>
      <p className="break-words font-medium">{cr.topic.code} – {title}</p>
      <Payload cr={cr} />
      <p className="whitespace-pre-wrap break-words text-sm text-slate-700">Lý do: {cr.reason}</p>
      <p className="text-sm text-slate-700">
        {cr.createdBy?.fullName} ({ROLE_LABEL[cr.createdBy?.role]}) · {fmtDateTime(cr.createdAt)}
        {cr.target && ` · Người được đề xuất: ${cr.target.fullName}${cr.targetAcceptedAt ? ' (đã đồng ý)' : ''}`}
      </p>
      {cr.decidedAt && (
        <p className="break-words text-sm text-slate-700">
          {cr.decidedBy ? `${cr.decidedBy.fullName} · ` : ''}{fmtDateTime(cr.decidedAt)}{cr.decisionReason && ` · ${cr.decisionReason}`}
        </p>
      )}
      {cd.active && <p role="status" className="text-sm text-amber-900">{cd.message}</p>}
      <div className="flex flex-wrap gap-2">
        {linkTopic && <Link to={`/de-tai/${cr.topic.id}/yeu-cau`} className={btnGhost}>Xem đề tài</Link>}
        {has('ACCEPT') && <button type="button" className={btnPrimary} disabled={off} onClick={open('ACCEPT')}>Đồng ý</button>}
        {has('APPROVE') && <button type="button" className={btnPrimary} disabled={off} onClick={open('APPROVE')}>Duyệt</button>}
        {has('DECLINE') && <button type="button" className={btnDanger} disabled={off} onClick={open('DECLINE')}>Từ chối</button>}
        {has('WITHDRAW') && <button type="button" className={btnGhost} disabled={off} onClick={open('WITHDRAW')}>Rút yêu cầu</button>}
      </div>
      {dlg === 'ACCEPT' && (
        <ConfirmDialog title="Đồng ý yêu cầu" message="Bạn đồng ý với đề xuất này? Sau đó cán bộ khoa sẽ duyệt." confirmLabel="Đồng ý" busy={act.isPending} error={error}
          onConfirm={confirm('accept')} onCancel={() => setDlg(null)} />
      )}
      {dlg === 'WITHDRAW' && (
        <ConfirmDialog title="Rút yêu cầu" message="Rút yêu cầu này? Mọi thứ giữ nguyên." confirmLabel="Rút yêu cầu" danger busy={act.isPending} error={error}
          onConfirm={confirm('withdraw')} onCancel={() => setDlg(null)} />
      )}
      {dlg === 'APPROVE' && (needReason
        ? <ReasonDialog title="Duyệt hủy đề tài" message="Đề tài sẽ chuyển sang Đã hủy (không bị xóa). Nhập lý do quyết định." confirmLabel="Duyệt hủy"
          onSubmit={(reason) => run('approve', { reason })} onCancel={() => setDlg(null)} />
        : <ConfirmDialog title="Duyệt yêu cầu" message={approveMessage(cr)} confirmLabel="Duyệt" busy={act.isPending} error={error}
          onConfirm={confirm('approve')} onCancel={() => setDlg(null)} />)}
      {dlg === 'DECLINE' && (
        <ReasonDialog title="Từ chối yêu cầu" message="Mọi thứ giữ nguyên. Nhập lý do từ chối." confirmLabel="Từ chối"
          onSubmit={(reason) => run('decline', { reason })} onCancel={() => setDlg(null)} />
      )}
    </li>
  );
}
