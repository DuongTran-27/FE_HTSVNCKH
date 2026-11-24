import { Link } from 'react-router';
import { btnPrimary } from './ui.jsx';
import { AdvisingActions } from './AdvisingActions.jsx';
import { StudentActions } from './StudentActions.jsx';
import { CLOSE_ACTIONS, CloseActions } from './CloseActions.jsx';
import { RECRUIT_ACTIONS, RecruitActions } from './RecruitActions.jsx';
import { DEFENSE_ACTIONS, DefenseActions } from './DefenseActions.jsx';

const STUDENT = ['REQUEST_ADVISOR', 'WITHDRAW_ADVISOR_REQUEST', 'SUBMIT_FOR_REVIEW', 'RESUBMIT'];

/**
 * Thanh hành động R6 (UI §5.1). Nút lấy từ topic.availableActions của server, không tự suy.
 * T306: action GV; T305: action SV; T307: nút "Xét duyệt" dẫn sang R17; T406: đóng đề tài (FR27); DC-13: tuyển sinh viên (FR31, FR33); DC-15: ra hội đồng (FR34, FR35). Action chưa có UI thì bỏ qua.
 */
export function TopicActionBar({ topic }) {
  const advising = topic.availableActions.filter((a) => a === 'ACCEPT_ADVISING' || a === 'DECLINE_ADVISING');
  const student = topic.availableActions.filter((a) => STUDENT.includes(a));
  const review = topic.availableActions.includes('APPROVE');
  const close = topic.availableActions.filter((a) => CLOSE_ACTIONS.includes(a));
  const recruit = topic.availableActions.filter((a) => RECRUIT_ACTIONS.includes(a));
  const defense = topic.availableActions.filter((a) => DEFENSE_ACTIONS.includes(a));
  if (advising.length === 0 && student.length === 0 && !review && close.length === 0 && recruit.length === 0 && defense.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-[0_-4px_12px_rgb(0_0_0/0.06)]" role="group" aria-label="Hành động">
      {advising.length > 0 && <AdvisingActions topic={topic} actions={advising} />}
      {review && <Link to={`/xet-duyet/${topic.id}`} className={btnPrimary}>Xét duyệt</Link>}
      {student.length > 0 && <StudentActions topic={topic} actions={student} />}
      {recruit.length > 0 && <RecruitActions topic={topic} actions={recruit} />}
      {defense.length > 0 && <DefenseActions topic={topic} actions={defense} />}
      {close.length > 0 && <CloseActions topic={topic} actions={close} />}
    </div>
  );
}
