import { useState } from 'react';
import { Link } from 'react-router';
import { FINAL_RESULT_LABEL, TOPIC_STATUS_LABEL } from '@nckh/shared';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime } from '../../lib/format.js';
import { Badge, Stamp, card } from '../../components/ui.jsx';
import { Award, CalendarRange, FileClock, GitPullRequestArrow, History, Info, Layers, Pencil, ScanSearch, TriangleAlert, UserRound, Users } from 'lucide-react';
import { useSimilarityLatest } from '../../lib/queries.js';
import { ExecTabs, TopicQuery } from '../../components/ExecShell.jsx';
import { ResultSection } from '../../components/ResultSection.jsx';
import { TopicActionBar } from '../../components/TopicActionBar.jsx';
import { FormerAdvisors, LeaveGroupButton, ReadOnlyBanner } from '../../components/MembershipActions.jsx';
import { SimilarityBadge, SimilarityPanel, UncheckedFlag } from '../../components/SimilarityPanel.jsx';
import { BypassNote, GrantBypass } from '../../components/SimilarityBypass.jsx';
import { CouncilAccessBanner, DefenseSection, ProcessScoreCard } from '../../components/DefenseSection.jsx';

const NOTICE_STATUSES = ['DRAFT', 'WAITING_ADVISOR', 'HAS_ADVISOR'];
const h2 = 'flex items-center gap-2 text-sm font-semibold text-blue-900';
const link = 'inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-700';
const Block = ({ title, children }) => (
  <div><h2 className={h2}>{title}</h2><div className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed text-slate-800">{children}</div></div>
);
const Notice = ({ tone = 'blue', children }) => {
  const [cls, Icon] = tone === 'amber' ? ['border-amber-200 bg-amber-50 text-amber-900', TriangleAlert] : ['border-blue-100 bg-blue-50 text-blue-900', Info];
  return <div role="note" className={`flex gap-3 rounded-lg border p-4 ${cls}`}><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1">{children}</div></div>;
};

// R6 – API_GD2 §5.1
export function TopicDetailPage() {
  return <section><TopicQuery>{(t) => <TopicDetail topic={t} />}</TopicQuery></section>;
}

function TopicDetail({ topic: t }) {
  const { user } = useAuth();
  const sub = t.latestSubmission;
  const decision = sub?.decision;
  const showReason = (t.status === 'NEEDS_REVISION' || t.status === 'REJECTED') && decision;
  // UI §5.3 ngoại lệ 2: GV chưa là GVHD không đọc được lịch sử (API §8.4)
  const canHistory = !(user.role === 'LECTURER' && t.advisor?.id !== user.id);
  const max = t.round.effectiveConfig?.maxMembers;
  const pending = t.pendingChangeRequests?.length ?? 0;
  const [showSim, setShowSim] = useState(false);
  const sim = useSimilarityLatest(t.id, showSim);
  return (
    <div className="space-y-4">
      <header className={card}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p data-testid="topic-code" className="text-sm font-medium text-slate-600">{t.code}</p>
            <h1 className="mt-1 break-words text-2xl font-bold">{t.title || '(Chưa đặt tên)'}</h1>
          </div>
          <Stamp>{TOPIC_STATUS_LABEL[t.status] ?? t.status}</Stamp>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5"><CalendarRange aria-hidden="true" className="size-4" />{t.round.name} – {t.round.academicYear}</span>
          {t.field && <span className="inline-flex items-center gap-1.5"><Layers aria-hidden="true" className="size-4" />{t.field.name}</span>}
          {t.currentResult && <span className="inline-flex items-center gap-1.5 font-medium text-green-800"><Award aria-hidden="true" className="size-4" />Kết quả: {FINAL_RESULT_LABEL[t.currentResult.result]}</span>}
        </p>
        <div className="mt-4 border-t border-slate-200 pt-3"><ExecTabs topic={t} /></div>
      </header>

      <ReadOnlyBanner topic={t} />
      <CouncilAccessBanner access={t.councilAccess} />
      {showReason && (
        <Notice tone="amber">
          <p className="font-semibold">{t.status === 'REJECTED' ? 'Đề tài bị từ chối' : 'Cần chỉnh sửa'}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{decision.reason}</p>
          <p className="mt-1 text-sm opacity-80">{decision.decidedBy?.fullName} · {fmtDateTime(decision.decidedAt)}</p>
        </Notice>
      )}
      {t.status === 'RECRUITING' && (
        <Notice>
          <p className="font-semibold">Đang tuyển sinh viên – {t.acceptedCount}/{t.recruitSlots} chỗ{t.applicationCounts && `, ${t.applicationCounts.pending} đơn chờ`}</p>
          {t.applicationCounts && <Link to={`/de-tai/${t.id}/ung-vien`} className="mt-1 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">Xem ứng viên</Link>}
        </Notice>
      )}
      {t.status === 'WAITING_ADVISOR' && t.pendingAdvisorRequest && (
        <Notice>Đang chờ {t.pendingAdvisorRequest.lecturer.fullName} phản hồi – {t.pendingAdvisorRequest.pendingDays} ngày</Notice>
      )}
      {t.round.registrationOpen === false && NOTICE_STATUSES.includes(t.status) && (
        <Notice tone="amber">Đã hết thời gian đăng ký của đợt – không gửi đề nghị/gửi xét duyệt được</Notice>
      )}
      {t.status === 'WAITING_CLOSE' && (
        <Notice>Đang chờ cán bộ khoa xác nhận đóng đề tài – không sửa được mốc, tiến độ, tài liệu, kết quả.</Notice>
      )}
      {t.status === 'UNDER_REVIEW' && sub && (
        <Notice>Đang chờ cán bộ xét duyệt – lần gửi {sub.seq} lúc {fmtDateTime(sub.createdAt)}; hạn xét duyệt {fmtDateTime(t.round.reviewDeadline)}</Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className={`${card} space-y-5`}>
            <Block title="Tóm tắt">{t.summary || '—'}</Block>
            <Block title="Mục tiêu">{t.objectives || '—'}</Block>
            {t.origin === 'LECTURER' && <Block title="Yêu cầu ứng viên">{t.requirements || '—'}</Block>}
            <div>
              <h2 className={h2}>Từ khóa</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">{t.keywords.length ? t.keywords.map((k) => <Badge key={k} tone="blue">{k}</Badge>) : '—'}</div>
            </div>
          </div>
          <div className={card}>
            <h2 className={h2}><ScanSearch aria-hidden="true" className="size-4" />Kiểm tra trùng lặp</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SimilarityBadge similarity={t.latestSimilarity} />
              {sub?.unchecked && <UncheckedFlag />}
              {t.latestSimilarity && (
                <button type="button" className="min-h-11 text-sm font-medium text-blue-700 hover:underline" aria-expanded={showSim} onClick={() => setShowSim((v) => !v)}>
                  {showSim ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                </button>
              )}
            </div>
            <div className="mt-2 space-y-2"><BypassNote bypass={t.similarityBypass} /><GrantBypass topic={t} /></div>
            {showSim && <div className="mt-2">{sim.isPending ? <p role="status">Đang tải…</p> : sim.isError ? <p role="alert" className="text-red-800">{sim.error.message}</p> : <SimilarityPanel check={sim.data} />}</div>}
          </div>
          {/* DC-15: bảo vệ trước hội đồng + điểm quá trình (UI §12.7) */}
          <DefenseSection defense={t.defense} />
          <ProcessScoreCard score={t.processScore} />
          <ResultSection topic={t} />
        </div>

        {/* Máy tính: cột phải dính khi cuộn phần tóm tắt dài; quá cao thì tự cuộn trong cột */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <div className={card}>
            <Block title="Giảng viên hướng dẫn">
              <span className="inline-flex items-center gap-2"><UserRound aria-hidden="true" className="size-4 text-slate-400" />{t.advisor?.fullName ?? 'Chưa có'}</span>
            </Block>
            <FormerAdvisors topic={t} />
          </div>
          <div className={card}>
            <h2 className={h2}><Users aria-hidden="true" className="size-4" />Nhóm ({t.members.length}{max ? `/${max}` : ''})</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {t.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 py-2">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{m.fullName.trim().split(/\s+/).pop()?.[0]}</span>
                  <span className="min-w-0 break-words text-sm">{m.fullName} ({m.code}){m.role === 'LEADER' && ' – trưởng nhóm'}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link to={`/de-tai/${t.id}/nhom`} className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline-offset-4 hover:underline">Quản lý nhóm</Link>
              <LeaveGroupButton topic={t} />
            </div>
          </div>
          <nav aria-label="Liên kết đề tài" className={`${card} flex flex-col !p-2`}>
            {sub && <Link to={`/de-tai/${t.id}/lan-gui/${sub.seq}`} className={link}><FileClock aria-hidden="true" className="size-4" />Lần gửi gần nhất (lần {sub.seq})</Link>}
            {canHistory && <Link to={`/de-tai/${t.id}/lich-su`} className={link}><History aria-hidden="true" className="size-4" />Lịch sử</Link>}
            <Link to={`/de-tai/${t.id}/yeu-cau`} className={link}><GitPullRequestArrow aria-hidden="true" className="size-4" />Yêu cầu thay đổi{pending > 0 && ` (${pending} đang chờ)`}</Link>
            {t.permissions?.edit && <Link to={`/de-tai/${t.id}/sua`} className={link}><Pencil aria-hidden="true" className="size-4" />Sửa hồ sơ</Link>}
          </nav>
        </aside>
      </div>
      <TopicActionBar topic={t} />
    </div>
  );
}
