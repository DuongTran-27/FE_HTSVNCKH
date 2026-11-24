import { SIMILARITY_LEVEL_LABEL } from '@nckh/shared';
import { fmtDateTime } from '../lib/format.js';
import { Badge } from './ui.jsx';

const LEVEL_TONE = { NONE: 'green', REVIEW: 'amber', HIGH: 'red' };
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
const isError = (c) => c.status === 'ERROR' || !c.level;

/** Ô mức (UI §4.13): null → Chưa kiểm tra; ERROR/level null → Chưa kiểm tra được; không bao giờ "Không trùng" */
export function SimilarityBadge({ similarity }) {
  if (!similarity) return <Badge>Chưa kiểm tra</Badge>;
  if (isError(similarity)) return <Badge>Chưa kiểm tra được</Badge>;
  return (
    <>
      <Badge tone={LEVEL_TONE[similarity.level]}>{SIMILARITY_LEVEL_LABEL[similarity.level]}</Badge>
      {similarity.isStale && <span className="ml-2 text-sm text-amber-900">Kết quả cũ – nội dung đã đổi sau lần kiểm này</span>}
    </>
  );
}

/** Cờ G5 (API_GD6 §9.1): lần gửi chưa có kết quả FR06 hợp lệ – không bao giờ trình bày như "không trùng" */
export const UncheckedFlag = () => (
  <Badge tone="amber"><span title="Hồ sơ được gửi khi chưa kiểm tra được trùng lặp; hệ thống sẽ tự kiểm tra lại">Gửi khi chưa kiểm tra</span></Badge>
);

/** Ô mức trong danh sách (UI §4.13, API_GD6 §9.6): ERROR → "Chưa kiểm tra được"; null → "—"; không bao giờ "Không trùng" */
export function SimilarityLevelCell({ level, status, unchecked }) {
  if (unchecked || status === 'ERROR') {
    const noResult = status === 'ERROR' || !level; // có mức hợp lệ (đã kiểm lại) thì hiện cả mức lẫn cờ
    return <>{noResult ? <Badge>Chưa kiểm tra được</Badge> : <Badge tone={LEVEL_TONE[level]}>{SIMILARITY_LEVEL_LABEL[level]}</Badge>}{unchecked && <UncheckedFlag />}</>;
  }
  if (!level) return <span title="Chưa có mức trùng lặp ở danh sách; mở hồ sơ để xem">—<span className="sr-only"> Chưa có mức trùng lặp</span></span>;
  return <Badge tone={LEVEL_TONE[level]}>{SIMILARITY_LEVEL_LABEL[level]}</Badge>;
}

const Score = ({ label, value }) => (
  <div className="text-sm">
    <span>{label}: {pct(value)}</span>
    <div className="h-2 w-full rounded bg-slate-200" aria-hidden="true"><div className="h-2 rounded bg-slate-600" style={{ width: pct(value) }} /></div>
  </div>
);

function Match({ m }) {
  if (m.hidden) {
    return (
      <li className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="break-words">{m.note}</p>
        <Score label="Điểm tên" value={m.titleScore} /><Score label="Điểm nội dung" value={m.contentScore} />
        <Badge tone={LEVEL_TONE[m.level]}>{SIMILARITY_LEVEL_LABEL[m.level]}</Badge>
      </li>
    );
  }
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="break-words font-medium">{m.code}{m.title && ` – ${m.title}`}</p>
      <p className="text-sm text-slate-700">{m.academicYear}{m.field ? ` · ${m.field}` : ''}{m.status ? ` · ${m.status}` : ''}</p>
      <Score label="Điểm tên" value={m.titleScore} /><Score label="Điểm nội dung" value={m.contentScore} />
      <Badge tone={LEVEL_TONE[m.level]}>{SIMILARITY_LEVEL_LABEL[m.level]}</Badge>
      {m.matchedKeywords?.length > 0 && <p className="mt-1 break-words text-sm">Từ khóa trùng: {m.matchedKeywords.join(', ')}</p>}
    </li>
  );
}

/**
 * Panel kết quả kiểm tra trùng lặp (UI §4.13). check = SimilarityCheckView | null.
 * Vàng = Cần xem xét, đỏ = Nghi trùng cao; top 5 từ server; dòng ẩn chỉ có note + điểm.
 */
export function SimilarityPanel({ check }) {
  if (!check) return <p className="text-slate-700">Chưa kiểm tra lần nào.</p>;
  const err = isError(check);
  const box = err ? 'border-slate-300 bg-slate-50' : { NONE: 'border-green-300 bg-green-50', REVIEW: 'border-amber-300 bg-amber-50', HIGH: 'border-red-300 bg-red-50' }[check.level];
  return (
    <div className={`space-y-3 rounded-xl border p-4 ${box}`} data-testid="similarity-panel" data-level={err ? 'ERROR' : check.level}>
      <p className="flex flex-wrap items-center gap-2 font-bold">
        {err ? 'Chưa kiểm tra được' : SIMILARITY_LEVEL_LABEL[check.level]}
        <span className="text-sm font-normal text-slate-700">{fmtDateTime(check.createdAt)}</span>
      </p>
      {err && <p>{check.message ?? 'Chưa kiểm tra được'}. Hệ thống không kết luận hồ sơ có trùng hay không.</p>}
      {check.justificationMissing && <p><Badge tone="red">Chưa có giải trình</Badge> Kết quả kiểm tra lại là nghi trùng cao nhưng nhóm chưa giải trình.</p>}
      {check.isStale && <p className="text-sm text-amber-900">Kết quả cũ – nội dung đã đổi sau lần kiểm này</p>}
      {!err && check.level === 'NONE' && <p>Không phát hiện đề tài tương tự đáng kể.</p>}
      {check.matches?.length > 0 && <ul className="space-y-2">{check.matches.slice(0, 5).map((m, i) => <Match key={m.code ?? i} m={m} />)}</ul>}
      {check.justification && (
        <div className="rounded-lg bg-card p-3"><p className="font-medium">Giải trình của nhóm</p><p className="whitespace-pre-wrap break-words">{check.justification}</p></div>
      )}
      <details className="text-sm text-slate-700">
        <summary className="min-h-11 cursor-pointer">Chi tiết kỹ thuật</summary>
        <p>Thuật toán {check.algorithmVersion} · {check.corpusSize} hồ sơ đối chiếu</p>
        {check.thresholds && <p>Ngưỡng tên {pct(check.thresholds.titleReview)}/{pct(check.thresholds.titleHigh)}, nội dung {pct(check.thresholds.contentReview)}/{pct(check.thresholds.contentHigh)}</p>}
      </details>
    </div>
  );
}
