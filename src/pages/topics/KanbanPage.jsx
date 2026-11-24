// R36 – Kanban mốc thực hiện (FR38, UI §12.10, API_GD7 §10.2). Cột suy ra từ MilestoneView, không lưu;
// GVHD hiện hành chuyển cột bằng kéo thả HTML5 (chuột) hoặc menu "Chuyển sang…" (bàn phím, cảm ứng). Không thư viện kéo thả (GD7 §12).
import { useState } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { DropdownMenu } from 'radix-ui';
import { useQueryClient } from '@tanstack/react-query';
import { progressFeedbackSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime } from '../../lib/format.js';
import { invalidateExec, useMilestones } from '../../lib/execution.js';
import { toast } from '../../lib/toast.js';
import { ExecShell } from '../../components/ExecShell.jsx';
import { ReasonDialog } from '../../components/ReasonDialog.jsx';
import { Badge, QueryBox, btnGhost, btnPrimary } from '../../components/ui.jsx';

// Bốn cột theo thứ tự hiển thị
export const KANBAN_COLUMNS = [['TODO', 'Chưa nộp'], ['AWAITING', 'Chờ đánh giá'], ['NEEDS_WORK', 'Cần bổ sung'], ['PASSED', 'Đạt']];
const COLUMN_LABEL = Object.fromEntries(KANBAN_COLUMNS);

/** Cột của mốc (GD7 §10.2): Đạt → Chờ đánh giá (bản mới nhất chưa có nhận xét kèm đánh giá) → Cần bổ sung → còn lại Chưa nộp */
export const kanbanColumn = (m) => {
  if (m.evaluation === 'PASSED') return 'PASSED';
  if (m.awaitingFeedback) return 'AWAITING';
  if (m.evaluation === 'NEEDS_WORK') return 'NEEDS_WORK';
  return 'TODO';
};

/** Cột đích hợp lệ: Chờ đánh giá → Đạt/Cần bổ sung (nhận xét kèm đánh giá); Đạt → Cần bổ sung (mở lại mốc). Cặp khác: không có */
export const kanbanTargets = (m) => ({ AWAITING: ['PASSED', 'NEEDS_WORK'], PASSED: ['NEEDS_WORK'] })[kanbanColumn(m)] ?? [];

// Nhận xét bắt buộc dùng đúng ràng buộc nội dung nhận xét của API (1–2000 ký tự); khóa `reason` theo ReasonDialog
const commentSchema = z.object({ reason: progressFeedbackSchema.shape.content });

export function KanbanPage() {
  return <ExecShell title="Kanban tiến độ">{(t) => <Kanban topic={t} />}</ExecShell>;
}

function Kanban({ topic: t }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useMilestones(t.id);
  // Chỉ GVHD hiện hành khi đề tài đang thực hiện; SV, cán bộ, thành viên hội đồng chỉ xem (backend vẫn kiểm quyền)
  const canMove = t.status === 'IN_PROGRESS' && Boolean(t.permissions?.manageMilestones) && Boolean(user) && t.advisor?.id === user.id;
  const [dragging, setDragging] = useState(null); // mốc đang kéo
  const [move, setMove] = useState(null); // { m, to } – hộp thoại đang mở
  const [announce, setAnnounce] = useState('');

  /** Gửi chuyển cột. Thẻ chỉ đổi cột khi tải lại sau API thành công (không cập nhật lạc quan – U11) */
  const submit = async (text) => {
    const { m, to } = move;
    try {
      if (kanbanColumn(m) === 'PASSED') await api(`/milestones/${m.id}/reopen`, { method: 'POST', body: { version: m.version, reason: text } });
      else await api(`/documents/${m.latestDocument.id}/feedbacks`, { method: 'POST', body: { content: text, evaluation: to, milestoneVersion: m.version } });
    } catch (err) {
      // Lỗi dữ liệu nhập → hiện trong hộp, giữ chữ đã gõ; lỗi khác (409 STALE_DOCUMENT/MILESTONE_ALREADY_PASSED/CONCURRENT_UPDATE, mạng…) → toast, thẻ ở cột cũ
      if (err.sessionExpired || err.code === 'VALIDATION_ERROR' || err.code === 'REASON_REQUIRED') throw err;
      // Lỗi mạng: giữ hộp mở để không mất nhận xét đã gõ (hộp hiện lỗi, bấm lại để gửi lại)
      if (err.code === 'NETWORK_ERROR') { toast('Mạng gián đoạn, cập nhật thất bại', { type: 'error' }); throw err; }
      setMove(null);
      toast(err.message, { type: 'error' });
      return;
    } finally {
      invalidateExec(qc, t.id); // thành công hay 409 đều cần dữ liệu mới
    }
    setMove(null);
    setAnnounce(`Đã chuyển ${m.name} sang ${COLUMN_LABEL[to]}`);
  };

  return (
    <div className="space-y-4">
      {canMove && <p className="text-sm text-muted-foreground">Kéo thẻ sang cột khác hoặc dùng nút “Chuyển sang…” để đánh giá mốc hoặc mở lại mốc đã Đạt.</p>}
      <p aria-live="polite" className="sr-only">{announce}</p>
      <QueryBox query={q} empty="Chưa có mốc thực hiện nào." isEmpty={(d) => d.length === 0}>
        {(items) => (
          <div className="grid gap-4 lg:grid-cols-4">
            {KANBAN_COLUMNS.map(([col, label]) => (
              <Column key={col} col={col} label={label} topicId={t.id} items={items.filter((m) => kanbanColumn(m) === col)}
                canMove={canMove} dragging={dragging} setDragging={setDragging} onMove={(m, to) => setMove({ m, to })} />
            ))}
          </div>
        )}
      </QueryBox>
      {move && (kanbanColumn(move.m) === 'PASSED'
        ? <ReasonDialog title={`Mở lại mốc “${move.m.name}”`} confirmLabel="Mở lại"
            message="Mốc về Cần bổ sung để sinh viên nộp bản mới; hạn không tự đổi. Nhập lý do."
            onCancel={() => setMove(null)} onSubmit={submit} />
        : <ReasonDialog title={`Đánh giá “${move.m.name}”: ${COLUMN_LABEL[move.to]}`} label="Nhận xét" confirmLabel="Gửi đánh giá"
            message={`Nhận xét gắn với bản nộp phiên bản ${move.m.latestDocument.version}.`} schema={commentSchema} confirmClassName={btnPrimary}
            onCancel={() => setMove(null)} onSubmit={submit} />)}
    </div>
  );
}

/** Một cột: vùng thả (chỉ nhận khi là đích hợp lệ của thẻ đang kéo); dưới lg thu gọn được */
function Column({ col, label, topicId, items, canMove, dragging, setDragging, onMove }) {
  const [collapsed, setCollapsed] = useState(false);
  const accepts = Boolean(dragging) && kanbanTargets(dragging).includes(col);
  const descId = `kanban-col-${col}`;
  return (
    <section aria-label={label}
      className={`min-w-0 rounded-xl border bg-muted/40 p-3 ${accepts ? 'border-blue-600 ring-2 ring-blue-600' : ''}`}
      onDragOver={(e) => {
        if (!dragging) return;
        if (accepts) e.preventDefault(); // cho phép thả
        e.dataTransfer.dropEffect = accepts ? 'move' : 'none';
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (accepts) onMove(dragging, col);
        setDragging(null);
      }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{label} <span className="tabular-nums text-muted-foreground">({items.length})</span></h2>
        <button type="button" className="min-h-11 px-2 text-sm text-blue-800 lg:hidden" aria-expanded={!collapsed} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? 'Mở rộng' : 'Thu gọn'}
        </button>
      </div>
      <span id={descId} className="sr-only">Cột hiện tại: {label}</span>
      <ul className={`mt-2 space-y-2 ${collapsed ? 'hidden lg:block' : ''}`}>
        {items.length === 0 && <li className="text-sm text-muted-foreground">Không có mốc</li>}
        {items.map((m) => (
          <KanbanCard key={m.id} m={m} topicId={topicId} descId={descId} targets={canMove ? kanbanTargets(m) : []}
            setDragging={setDragging} onMove={onMove} />
        ))}
      </ul>
    </section>
  );
}

/** Thẻ mốc: tên (bấm → tab Mốc tại mốc đó), hạn, bắt buộc, bản nộp mới nhất; kéo/menu chỉ khi có cột đích */
function KanbanCard({ m, topicId, descId, targets, setDragging, onMove }) {
  const d = m.latestDocument;
  const movable = targets.length > 0;
  return (
    <li aria-describedby={descId} data-testid={`kanban-card-${m.id}`}
      className={`space-y-1 break-words rounded-lg border bg-card p-3 shadow-sm ${movable ? 'cursor-grab' : ''}`}
      {...(movable && {
        draggable: true,
        onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', m.id); setDragging(m); },
        onDragEnd: () => setDragging(null),
      })}>
      <Link to={`/de-tai/${topicId}/moc#moc-${m.id}`} aria-describedby={descId} className="font-medium text-blue-800 underline-offset-4 hover:underline">{m.order}. {m.name}</Link>
      <p className={`text-sm tabular-nums ${m.isOverdue ? 'font-medium text-red-700' : 'text-muted-foreground'}`}>
        Hạn: {fmtDateTime(m.dueAt)}{m.isOverdue && ' (quá hạn)'}
      </p>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {m.required && <Badge>Bắt buộc</Badge>}
        {d ? <span className="text-muted-foreground">Bản nộp phiên bản {d.version}</span> : <span className="text-muted-foreground">Chưa có bản nộp</span>}
        {d?.isLate && <Badge tone="red">Nộp muộn</Badge>}
      </div>
      {movable && (
        // modal={false}: tránh khóa pointer-events của body khi mở hộp thoại ngay sau khi chọn mục
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger className={`${btnGhost} mt-1`} aria-label={`Chuyển ${m.name} sang…`}>Chuyển sang…</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" className="z-50 min-w-40 rounded-md border bg-card p-1 shadow-md">
              {targets.map((to) => (
                <DropdownMenu.Item key={to} onSelect={() => onMove(m, to)}
                  className="flex min-h-11 cursor-pointer items-center rounded px-3 text-sm outline-none data-[highlighted]:bg-muted">
                  {COLUMN_LABEL[to]}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </li>
  );
}
