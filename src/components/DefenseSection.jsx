import { Link } from 'react-router';
import { COUNCIL_ROLE_LABEL, DEFENSE_DECISION_LABEL } from '@nckh/shared';
import { Gavel, ShieldCheck } from 'lucide-react';
import { fmtDateTime, fmtScore } from '../lib/format.js';
import { Badge, btnPrimary, card } from './ui.jsx';

const h2 = 'flex items-center gap-2 text-sm font-semibold text-blue-900';

/** Dải cho thành viên hội đồng mở R6 (API_GD7 §1.1, UI §12.7): chỉ đọc + lối sang màn chấm R34 */
export function CouncilAccessBanner({ access }) {
  if (!access) return null;
  return (
    <div role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-blue-900">
      <p>Bạn xem với tư cách thành viên hội đồng ({COUNCIL_ROLE_LABEL[access.role] ?? access.role}) – chỉ đọc.</p>
      <Link to={`/cham-bao-ve/${access.assignmentId}`} className={btnPrimary}>Đến màn chấm</Link>
    </div>
  );
}

/** Khối "Điểm quá trình" (API_GD7 §5.5): bản mới nhất do GVHD nhập khi đề nghị ra hội đồng; null → không hiện */
export function ProcessScoreCard({ score: p }) {
  if (!p) return null;
  return (
    <div className={card}>
      <h2 className={h2}><ShieldCheck aria-hidden="true" className="size-4" />Điểm quá trình</h2>
      <p className="mt-2 text-3xl font-bold tabular-nums">{fmtScore(p.score)}<span className="text-base font-normal text-muted-foreground">/10</span></p>
      <p className="mt-2 whitespace-pre-wrap break-words">{p.comment}</p>
      <p className="mt-1 text-sm text-muted-foreground">{p.lecturer?.fullName} · {fmtDateTime(p.createdAt)}</p>
    </div>
  );
}

/**
 * Khối "Bảo vệ trước hội đồng" theo topic.defense (API_GD7 §7.5, UI §12.7).
 * defense = null (chưa từng ra hội đồng, hoặc đã trả về Đang thực hiện và chỉ còn phân công bị hủy) → không hiện khối.
 * Biên bản hội đồng không có trong TopicDetail.defense: nội dung biên bản là kết quả cuối nguồn hội đồng (mục "Kết quả cuối").
 */
export function DefenseSection({ defense: d }) {
  if (!d) return null;
  return (
    <div className={card}>
      <h2 className={h2}><Gavel aria-hidden="true" className="size-4" />Bảo vệ trước hội đồng</h2>
      {d.state === 'WAITING_ASSIGNMENT' && <p className="mt-2">Chờ khoa phân công hội đồng.</p>}
      {d.state === 'ASSIGNED' && (
        <>
          <p className="mt-2 font-medium">Hội đồng {d.council?.code} – {d.council?.name}</p>
          <p className="text-muted-foreground">Chưa có kết quả.</p>
        </>
      )}
      {d.state === 'DECIDED' && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Hội đồng {d.council?.code} – {d.council?.name} · chốt {fmtDateTime(d.decidedAt)}</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-bold tabular-nums">{fmtScore(d.finalScore)}</span>
            <Badge tone={d.decision === 'PASSED' ? 'green' : 'red'}>{DEFENSE_DECISION_LABEL[d.decision] ?? d.decision}</Badge>
          </p>
          {/* Biên bản = tóm tắt kết quả cuối nguồn hội đồng (API_GD7 §7.4 bước 6) – chỉ dẫn để người đọc không phải tìm (m4 DC-15) */}
          <p className="mt-1 text-sm text-muted-foreground">Biên bản hội đồng: xem mục "Kết quả cuối".</p>
        </>
      )}
      {d.scores.length > 0 && <ScoreTable scores={d.scores} />}
    </div>
  );
}

/** Bảng điểm từng thành viên hội đồng (API_GD7 §7.1, §7.5) – dùng ở khối bảo vệ R6 và màn chấm R34; danh sách do server lọc theo quyền */
export function ScoreTable({ scores }) {
  return (
    <table className="mt-3 w-full text-sm">
      <caption className="sr-only">Điểm từng thành viên hội đồng</caption>
      <thead className="max-sm:sr-only">
        <tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="py-2 pr-2">Vai trò</th><th className="py-2 pr-2">Họ tên</th><th className="py-2 pr-2">Điểm</th><th className="py-2">Nhận xét</th></tr>
      </thead>
      <tbody>
        {/* Dưới sm mỗi dòng xếp thành khối (không cuộn ngang ở 360 px) */}
        {scores.map((s) => (
          <tr key={s.member.lecturerId} className="border-b align-top last:border-0 max-sm:block max-sm:py-2">
            <td className="py-2 pr-2 max-sm:inline max-sm:py-0">{COUNCIL_ROLE_LABEL[s.member.role] ?? '—'}</td>
            <td className="py-2 pr-2 font-medium max-sm:inline max-sm:py-0 max-sm:before:content-['_–_']">{s.member.fullName}</td>
            <td className="py-2 pr-2 tabular-nums max-sm:block max-sm:py-0">{fmtScore(s.score)}</td>
            <td className="whitespace-pre-wrap break-words py-2 max-sm:block max-sm:py-0">{s.comment}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
