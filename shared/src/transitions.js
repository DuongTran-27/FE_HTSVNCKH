// Bảng chuyển trạng thái – nguồn sự thật duy nhất (mục 5 đặc tả).
// Backend dùng để chặn thao tác ngoài bảng; frontend dùng để hiện/ẩn nút.
import { ROLES as R, TOPIC_STATUS as S } from './enums.js';

export const TRANSITIONS = Object.freeze([
  { action: 'REQUEST_ADVISOR', from: S.DRAFT, to: S.WAITING_ADVISOR, actors: [R.STUDENT], leaderOnly: true, fr: ['FR03', 'FR16'] },
  { action: 'ACCEPT_ADVISING', from: S.WAITING_ADVISOR, to: S.HAS_ADVISOR, actors: [R.LECTURER], requestedLecturerOnly: true, fr: ['FR16'] },
  { action: 'DECLINE_ADVISING', from: S.WAITING_ADVISOR, to: S.DRAFT, actors: [R.LECTURER], requestedLecturerOnly: true, reasonRequired: true, fr: ['FR16'] },
  { action: 'WITHDRAW_ADVISOR_REQUEST', from: S.WAITING_ADVISOR, to: S.DRAFT, actors: [R.STUDENT], leaderOnly: true, fr: ['FR16'] },
  { action: 'SUBMIT_FOR_REVIEW', from: S.HAS_ADVISOR, to: S.UNDER_REVIEW, actors: [R.STUDENT], leaderOnly: true, needsSimilarity: true, fr: ['FR05', 'FR06', 'FR17'] },
  { action: 'REQUEST_REVISION', from: S.UNDER_REVIEW, to: S.NEEDS_REVISION, actors: [R.STAFF], reasonRequired: true, fr: ['FR07'] },
  { action: 'RESUBMIT', from: S.NEEDS_REVISION, to: S.UNDER_REVIEW, actors: [R.STUDENT], leaderOnly: true, needsSimilarity: true, fr: ['FR06', 'FR17'] },
  { action: 'REJECT', from: S.UNDER_REVIEW, to: S.REJECTED, actors: [R.STAFF], reasonRequired: true, fr: ['FR07'] },
  { action: 'APPROVE', from: S.UNDER_REVIEW, to: S.IN_PROGRESS, actors: [R.STAFF], fr: ['FR07', 'FR17'] },
  { action: 'CANCEL', from: S.IN_PROGRESS, to: S.CANCELLED, actors: [R.STAFF], reasonRequired: true, fr: ['FR20'] },
  { action: 'REQUEST_CLOSE', from: S.IN_PROGRESS, to: S.WAITING_CLOSE, actors: [R.LECTURER], currentAdvisorOnly: true, fr: ['FR12', 'FR27'] },
  { action: 'RETURN_TO_ADVISOR', from: S.WAITING_CLOSE, to: S.IN_PROGRESS, actors: [R.STAFF], reasonRequired: true, fr: ['FR27'] },
  { action: 'CONFIRM_CLOSE', from: S.WAITING_CLOSE, to: S.CLOSED, actors: [R.STAFF], fr: ['FR22', 'FR27'] },
  { action: 'CLOSE_EXPIRED', from: S.IN_PROGRESS, to: S.CLOSED, actors: [R.STAFF], reasonRequired: true, forcesFail: true, fr: ['FR27'] },
  // GĐ7 §0 (DAC_TA mục 9): đề tài GV công bố, hội đồng nghiệm thu
  { action: 'PUBLISH_RECRUITMENT', from: S.DRAFT, to: S.RECRUITING, actors: [R.LECTURER], currentAdvisorOnly: true, needsSimilarity: true, fr: ['FR06', 'FR31'] },
  { action: 'UNPUBLISH_RECRUITMENT', from: S.RECRUITING, to: S.DRAFT, actors: [R.LECTURER], currentAdvisorOnly: true, reasonRequired: true, fr: ['FR31'] },
  { action: 'FINALIZE_GROUP', from: S.RECRUITING, to: S.HAS_ADVISOR, actors: [R.LECTURER], currentAdvisorOnly: true, fr: ['FR33'] },
  { action: 'REQUEST_DEFENSE', from: S.IN_PROGRESS, to: S.WAITING_DEFENSE, actors: [R.LECTURER], currentAdvisorOnly: true, fr: ['FR34'] },
  { action: 'RETURN_FROM_DEFENSE', from: S.WAITING_DEFENSE, to: S.IN_PROGRESS, actors: [R.STAFF], reasonRequired: true, fr: ['FR35'] },
  { action: 'COUNCIL_FINALIZE', from: S.WAITING_DEFENSE, to: S.WAITING_CLOSE, actors: [R.LECTURER], councilOfficerOnly: true, fr: ['FR37'] },
]);

// Action gọi qua POST /actions; CANCEL chỉ chạy khi cán bộ duyệt đề nghị hủy (API_GD6 §4),
// COUNCIL_FINALIZE chỉ chạy trong POST /api/council-assignments/:id/finalize (API_GD7 §7.4)
const INTERNAL_ACTIONS = ['CANCEL', 'COUNCIL_FINALIZE'];
export const ENABLED_ACTIONS = Object.freeze(TRANSITIONS.map((t) => t.action).filter((a) => !INTERNAL_ACTIONS.includes(a)));

export const findTransition = (action) => TRANSITIONS.find((t) => t.action === action) ?? null;

export const availableActions = (status, role) =>
  TRANSITIONS.filter((t) => t.from === status && t.actors.includes(role)).map((t) => t.action);
