// Danh mục giá trị dùng chung frontend + backend (khớp enum trong Prisma).
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',       // Quản trị hệ thống, không có quyền nghiệp vụ (FR25)
  STAFF: 'STAFF',       // Cán bộ khoa
  LECTURER: 'LECTURER', // Giảng viên
  STUDENT: 'STUDENT',   // Sinh viên
});

export const TOPIC_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  RECRUITING: 'RECRUITING', // GĐ7 FR31: đề tài GV công bố đang tuyển SV
  WAITING_ADVISOR: 'WAITING_ADVISOR',
  HAS_ADVISOR: 'HAS_ADVISOR',
  UNDER_REVIEW: 'UNDER_REVIEW',
  NEEDS_REVISION: 'NEEDS_REVISION',
  REJECTED: 'REJECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_DEFENSE: 'WAITING_DEFENSE', // GĐ7 FR34: chờ hội đồng nghiệm thu
  CANCELLED: 'CANCELLED',
  WAITING_CLOSE: 'WAITING_CLOSE',
  CLOSED: 'CLOSED',
});

export const TOPIC_STATUS_LABEL = Object.freeze({
  DRAFT: 'Nháp',
  RECRUITING: 'Đang tuyển sinh viên',
  WAITING_ADVISOR: 'Chờ giảng viên hướng dẫn',
  HAS_ADVISOR: 'Đã có giảng viên hướng dẫn',
  UNDER_REVIEW: 'Chờ xét duyệt',
  NEEDS_REVISION: 'Cần chỉnh sửa',
  REJECTED: 'Bị từ chối',
  IN_PROGRESS: 'Đang thực hiện',
  WAITING_DEFENSE: 'Chờ bảo vệ',
  CANCELLED: 'Đã hủy',
  WAITING_CLOSE: 'Chờ đóng',
  CLOSED: 'Đã đóng',
});

// GĐ7 FR31 (API_GD7 §3, §11): nguồn đề tài, khớp enum TopicOrigin của Prisma
export const TOPIC_ORIGIN = Object.freeze({ STUDENT: 'STUDENT', LECTURER: 'LECTURER' });
export const TOPIC_ORIGIN_LABEL = Object.freeze({ STUDENT: 'Sinh viên đề xuất', LECTURER: 'Giảng viên công bố' });

// "Đề tài hoạt động" theo mục 1 của đặc tả
export const INACTIVE_STATUSES = Object.freeze(['DRAFT', 'REJECTED', 'CANCELLED', 'CLOSED']);
export const isActiveStatus = (s) => !INACTIVE_STATUSES.includes(s);

export const FINAL_RESULT = Object.freeze({
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  PASS: 'PASS',
  FAIL: 'FAIL',
});
export const FINAL_RESULT_LABEL = Object.freeze({
  EXCELLENT: 'Xuất sắc', GOOD: 'Tốt', PASS: 'Đạt', FAIL: 'Không đạt',
});

export const SIMILARITY_LEVEL = Object.freeze({ NONE: 'NONE', REVIEW: 'REVIEW', HIGH: 'HIGH' });

// Tham số mặc định theo mục 8 của đặc tả; mỗi đợt có thể ghi đè.
export const DEFAULT_ROUND_CONFIG = Object.freeze({
  minMembers: 1,
  maxMembers: 5,
  maxActiveTopicsPerStudent: 1,
  maxTopicsPerLecturer: 5,
  advisorReminderDays: 3,
  dueReminderDays: 3,
  minSummaryWords: 100,
  minKeywords: 3,
  maxKeywords: 5,
  maxFileSizeMB: 10,
  allowedFileTypes: ['pdf', 'docx', 'pptx', 'xlsx'],
  similarity: { titleReview: 0.5, titleHigh: 0.7, contentReview: 0.35, contentHigh: 0.55, minJustificationWords: 50 },
  // GĐ7 §2.4 (CAU_HOI #13): hội đồng không bắt buộc; quy đổi điểm bảo vệ → kết quả (pass cố định 5)
  requireDefense: false,
  defenseGrades: { excellent: 9, good: 7, pass: 5 },
});
// FR34: điểm quá trình tối thiểu ra hội đồng (cố định theo đề cương, DAC_TA mục 9)
export const MIN_PROCESS_SCORE = 5;

// GĐ4 (API_GD45 §1.4, §3)
export const MILESTONE_MAX_PER_TOPIC = 20;
export const DOCUMENT_MAX_VERSIONS = 50;
export const DOCUMENT_STAGES = Object.freeze(['PROPOSAL', 'MIDTERM', 'FINAL', 'OTHER']);
export const DOCUMENT_FILE_TYPES = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
export const DOWNLOAD_URL_TTL_SECONDS = 300;
export const UPLOAD_HARD_MAX_BYTES = 10 * 1024 * 1024;

// Thông báo trong web FR13 (API_GD45 §8.3)
export const NOTIFICATION_TYPES = Object.freeze([
  'INVITATION_RECEIVED', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED',
  'ADVISOR_REQUESTED', 'ADVISOR_ACCEPTED', 'ADVISOR_DECLINED', 'ADVISOR_REQUEST_WITHDRAWN',
  'REVIEW_DECIDED',
  'MILESTONE_CREATED', 'MILESTONE_REQUIRED_REMOVED', 'MILESTONE_DUE_CHANGED',
  'DOCUMENT_SUBMITTED', 'FEEDBACK_CREATED', 'RESULT_ENTERED',
  'CLOSE_REQUESTED', 'CLOSE_RETURNED', 'TOPIC_CLOSED',
  'MILESTONE_DUE_SOON', 'MILESTONE_OVERDUE', 'ADVISOR_REQUEST_REMINDER',
  // GĐ6 (API_GD6 §11b) – khung yêu cầu thay đổi, thay GV
  'CHANGE_REQUESTED', 'CHANGE_TARGET_INVITED', 'CHANGE_TARGET_ACCEPTED', 'CHANGE_DECIDED', 'CHANGE_WITHDRAWN', 'ADVISOR_HANDOVER', 'RESULT_CORRECTED',
  'MILESTONE_REOPENED', // T606: FR22
  'SIMILARITY_BYPASS_GRANTED', 'SIMILARITY_RECHECKED', // T609: G5 (API_GD6 §9)
  'MEMBER_LEFT', // T603: FR21 rời nhóm
  'RECRUITMENT_CANCELLED', 'APPLICATION_DECLINED', // DC-05: FR31 ngừng tuyển (API_GD7 §3.4)
  'APPLICATION_RECEIVED', 'APPLICATION_ACCEPTED', 'APPLICATION_WITHDRAWN', 'GROUP_FINALIZED', // DC-06: FR32, FR33 (API_GD7 §4, G51)
  'DEFENSE_REQUESTED', 'DEFENSE_RETURNED', // DC-07: FR34, FR35 (API_GD7 §5.1, §5.4)
  'COUNCIL_MEMBER_ADDED', 'COUNCIL_MEMBER_REMOVED', 'COUNCIL_ASSIGNED', 'COUNCIL_UNASSIGNED', // DC-08: FR35 (API_GD7 §6.2–6.4)
  'DEFENSE_DECIDED', // DC-09: FR37 (API_GD7 §7.4)
]);

// GĐ7 §2.1, §11 (DC-07): hội đồng nghiệm thu, nguồn kết quả – khớp enum Prisma
export const COUNCIL_ROLE = Object.freeze({ CHAIR: 'CHAIR', SECRETARY: 'SECRETARY', MEMBER: 'MEMBER' });
export const COUNCIL_ROLE_LABEL = Object.freeze({ CHAIR: 'Chủ tịch', SECRETARY: 'Thư ký', MEMBER: 'Ủy viên' });
export const DEFENSE_DECISION = Object.freeze({ PASSED: 'PASSED', FAILED: 'FAILED' });
export const DEFENSE_DECISION_LABEL = Object.freeze({ PASSED: 'Đạt', FAILED: 'Không đạt' });
export const RESULT_SOURCE = Object.freeze({ ADVISOR: 'ADVISOR', COUNCIL: 'COUNCIL', STAFF: 'STAFF' });
export const RESULT_SOURCE_LABEL = Object.freeze({ ADVISOR: 'Giảng viên hướng dẫn', COUNCIL: 'Hội đồng', STAFF: 'Cán bộ khoa' });

// GĐ6 (API_GD6 §2): yêu cầu thay đổi (khớp enum ChangeType của Prisma); stage suy ra, không lưu
export const CHANGE_TYPE = Object.freeze({ TOPIC_CHANGE: 'TOPIC_CHANGE', ADVISOR_CHANGE: 'ADVISOR_CHANGE', CANCEL: 'CANCEL', LEAVE_GROUP: 'LEAVE_GROUP' });
export const CHANGE_STAGE = Object.freeze({ TARGET: 'TARGET', STAFF: 'STAFF' });
// G35: thay GV được ở mọi trạng thái có GVHD còn làm việc (không WAITING_CLOSE)
export const ADVISOR_CHANGE_STATUSES = Object.freeze(['HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION', 'IN_PROGRESS']);
// RECRUITING: GĐ7 §0 (FR21 rời tự do trước duyệt)
export const PRE_APPROVAL_STATUSES = Object.freeze(['DRAFT', 'RECRUITING', 'WAITING_ADVISOR', 'HAS_ADVISOR', 'UNDER_REVIEW', 'NEEDS_REVISION']);

// FR14 (API_GD45 §9): chiều thống kê
export const STATS_GROUP_BY = Object.freeze(['lecturer', 'field', 'status', 'result', 'academicYear', 'round']);
