import { auth } from './auth.js';
import { queryClient } from './queryClient.js';
import { clearToasts, toast } from './toast.js';

// Thông điệp khi server không gửi message (UI §7); bình thường hiện error.message của server
const FALLBACK_MESSAGES = {
  NETWORK_ERROR: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  VALIDATION_ERROR: 'Dữ liệu không hợp lệ',
  TOPIC_INCOMPLETE: 'Hồ sơ chưa đủ thông tin bắt buộc',
  JUSTIFICATION_REQUIRED: 'Hồ sơ nghi trùng cao, cần giải trình',
  REASON_REQUIRED: 'Thao tác này bắt buộc nhập lý do',
  IMPORT_HAS_ERRORS: 'File có dòng lỗi, chưa ghi dữ liệu nào',
  BAD_JSON: 'Yêu cầu không hợp lệ',
  BAD_REQUEST: 'Yêu cầu không hợp lệ',
  UNKNOWN_ACTION: 'Yêu cầu không hợp lệ',
  UNAUTHORIZED: 'Phiên đăng nhập không hợp lệ',
  PASSWORD_CHANGE_REQUIRED: 'Bạn cần đổi mật khẩu trước khi tiếp tục',
  ACCOUNT_LOCKED: 'Tài khoản đã bị khóa',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
  NOT_FOUND: 'Không tìm thấy',
  CONCURRENT_UPDATE: 'Đề tài vừa được người khác cập nhật, vui lòng tải lại',
  INVALID_TRANSITION: 'Không thể thực hiện thao tác này khi đề tài đang ở trạng thái hiện tại',
  INVITATION_CLOSED: 'Lời mời không còn hiệu lực',
  TOPIC_NOT_EDITABLE: 'Chỉ sửa được hồ sơ ở trạng thái Nháp hoặc Cần chỉnh sửa',
  REGISTRATION_CLOSED: 'Ngoài thời gian đăng ký của đợt',
  STUDENT_TOPIC_LIMIT: 'Sinh viên đã đạt số đề tài hoạt động tối đa trong đợt',
  LECTURER_QUOTA_EXCEEDED: 'Giảng viên đã đủ hạn mức hướng dẫn trong đợt',
  ALREADY_MEMBER: 'Sinh viên đã là thành viên hoặc đã được mời',
  SIMILARITY_NOT_CHECKED: 'Chưa kiểm tra được trùng lặp, vui lòng thử lại',
  STALE_SUBMISSION: 'Quyết định phải gắn với lần gửi mới nhất chưa được xử lý',
  DUPLICATE: 'Dữ liệu đã tồn tại',
  IMPORT_IN_PROGRESS: 'Đang có lượt nhập khác, vui lòng thử lại sau',
  PAYLOAD_TOO_LARGE: 'File vượt quá dung lượng cho phép',
  UNSUPPORTED_MEDIA_TYPE: 'Định dạng dữ liệu gửi lên không được hỗ trợ',
  RATE_LIMITED: 'Thao tác quá nhiều lần, vui lòng thử lại sau',
  TEMP_LOCKED: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau',
  INTERNAL: 'Lỗi hệ thống, vui lòng thử lại',
  SERVICE_BUSY: 'Hệ thống đang bận, vui lòng thử lại',
  // GĐ4 (API_GD45 §2)
  TOPIC_NOT_IN_PROGRESS: 'Chỉ thực hiện được khi đề tài đang thực hiện',
  MILESTONES_NOT_PASSED: 'Còn mốc bắt buộc chưa Đạt',
  NO_FINAL_RESULT: 'Giảng viên hướng dẫn chưa nhập kết quả cuối và nhận xét tổng kết',
  NO_REQUIRED_MILESTONE: 'Đề tài chưa có mốc bắt buộc nào',
  CLOSE_CONDITIONS_MET: 'Đề tài đã đủ điều kiện đóng, hãy chờ giảng viên hướng dẫn gửi đóng',
  ROUND_NOT_ENDED: 'Đợt chưa hết hạn, chưa thể đóng với kết quả Không đạt',
  PROGRESS_LOCKED: 'Cập nhật tiến độ đã được giảng viên hướng dẫn nhận xét, không sửa được nữa',
  MILESTONE_LIMIT: 'Đề tài đã đủ số mốc tối đa (20)',
  MILESTONE_ALREADY_PASSED: 'Mốc đã Đạt; muốn thay đổi cần mở lại mốc',
  STALE_DOCUMENT: 'Chỉ đánh giá mốc trên bản nộp mới nhất',
  DOCUMENT_VERSION_LIMIT: 'Đã đạt số phiên bản tối đa cho mục này',
  STORAGE_UNAVAILABLE: 'Kho lưu trữ file đang lỗi, vui lòng thử lại',
};

export class ApiError extends Error {
  constructor({ status, code, message, details, retryAfter, requestId }) {
    super(message || FALLBACK_MESSAGES[code] || 'Đã có lỗi xảy ra');
    Object.assign(this, { name: 'ApiError', status, code, details, retryAfter, requestId });
  }
}

// Retry-After: số giây hoặc ngày HTTP → số giây (null nếu không có/không đọc được)
export const parseRetryAfter = (value, now = Date.now()) => {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
};

const toApiError = async (res) => {
  const body = await res.json().catch(() => null);
  const e = body?.error ?? {};
  return new ApiError({
    status: res.status,
    code: e.code ?? (res.status === 503 ? 'SERVICE_BUSY' : res.status >= 500 ? 'INTERNAL' : 'UNKNOWN'),
    message: e.message,
    details: e.details,
    retryAfter: parseRetryAfter(res.headers.get('Retry-After')),
    requestId: e.requestId,
  });
};

// Chỉ đường dẫn tương đối /api/* cùng origin (cookie nckh_rt SameSite=Lax, API_GD2 §1.1)
const send = async (path, { method = 'GET', body, headers, signal, keepalive } = {}) => {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error(`Đường dẫn API không hợp lệ: ${path}`);
  const h = new Headers(headers);
  const token = auth.get().accessToken;
  if (token) h.set('Authorization', `Bearer ${token}`);
  let payload = body;
  // FormData: để trình duyệt tự đặt multipart/form-data; boundary=…
  if (body !== undefined && !(body instanceof FormData)) {
    h.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }
  try {
    return await fetch(`/api${path}`, { method, headers: h, body: payload, signal, keepalive, credentials: 'same-origin' });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR' });
  }
};

// ---- Refresh tuần tự hóa (API_GD2 §1.1): refresh gọi đôi sẽ thu hồi cả họ phiên ----
// Promise dùng chung ở cấp module (không ở state/effect) để StrictMode và nhiều 401 đồng thời chỉ ra 1 request
let refreshPromise = null;
// Thế hệ phiên: tăng mỗi lần xóa phiên phía client; kết quả về sau khi thế hệ đổi thì bỏ (review T301-bao-mat #1)
let generation = 0;
// Promise /auth/logout đang gửi (không bao giờ reject); login và refresh chờ nó
let serverLogout = null;

const doRefresh = async (gen) => {
  const res = await send('/auth/refresh', { method: 'POST' });
  if (res.status === 401 || res.status === 403) return false;
  if (!res.ok) throw await toApiError(res);
  const session = await res.json();
  // Đã đăng xuất trong lúc chờ: không hồi sinh phiên (logout gửi sau refresh để server thu hồi cookie mới)
  if (gen !== generation) return false;
  // Cookie đã đổi sang người khác (đăng nhập tài khoản khác ở tab khác): bỏ cache và phiên của người cũ (INFO i1 T303)
  const prev = auth.get().user;
  if (prev && prev.id !== session.user.id) {
    clearClientSession();
    handlers.onLogout();
    return false;
  }
  auth.setSession(session);
  return true;
};

// true: đã có token mới; false: phiên không còn (401/403); ném ApiError khi mất mạng/5xx (không coi là hết phiên)
export const refreshSession = () => {
  refreshPromise ??= (async () => {
    const gen = generation;
    try {
      // Logout đang gửi: refresh phải đi sau để không mang cookie chưa bị thu hồi (review T301-bao-mat-v2 #1)
      await serverLogout;
      // Giữa các tab: khóa Web Locks; trình duyệt không có thì chỉ tuần tự trong tab (UI §1.1)
      return await (globalThis.navigator?.locks
        ? navigator.locks.request('nckh-refresh', () => doRefresh(gen))
        : doRefresh(gen));
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
};

let handlers = { onExpired: () => {}, onLogout: () => {} };
// main.jsx gắn điều hướng của router vào đây (tránh vòng import api ↔ router)
export const configureSession = (h) => {
  handlers = { ...handlers, ...h };
};

const clearClientSession = () => {
  generation += 1;
  auth.clear();
  queryClient.cancelQueries();
  queryClient.clear();
  clearToasts();
};

// Báo đăng xuất sang các tab khác (review T301-bao-mat-v2 INFO #3). Tab nhận chỉ xóa phía client, không gọi server.
let authChannel = null;
export const startCrossTabSync = () => {
  if (authChannel || typeof BroadcastChannel === 'undefined') return;
  authChannel = new BroadcastChannel('nckh-auth');
  authChannel.onmessage = (e) => {
    if ((e.data !== 'logout' && e.data !== 'login') || !auth.get().user) return;
    clearClientSession();
    handlers.onLogout();
  };
};

// Lỗi trả cho request bị bỏ vì phiên đã kết thúc; toast đã hiện (hoặc người dùng tự đăng xuất) → màn bỏ qua lỗi có cờ này
const sessionEndedError = () => Object.assign(new ApiError({ status: 401, code: 'UNAUTHORIZED' }), { sessionExpired: true });

// Chỉ xử lý một lần dù nhiều request cùng thất bại: lần sau user đã null
const expireSession = (message = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại') => {
  if (!auth.get().user) return;
  clearClientSession();
  toast(message, { type: 'error' });
  handlers.onExpired();
};

const NO_REFRESH = new Set(['/auth/login', '/auth/refresh']);

/**
 * Gọi API. path tương đối với /api (ví dụ '/topics'). Trả JSON, hoặc null với 204.
 * Lỗi luôn là ApiError { status, code, message, details, retryAfter, requestId }.
 * Lỗi có `sessionExpired: true`: phiên đã kết thúc (đã toast + điều hướng đăng nhập) → màn/handler chung KHÔNG hiện thêm toast.
 */
export const api = async (path, options = {}) => {
  const gen = generation;
  const sentToken = auth.get().accessToken;
  let res = await send(path, options);
  // Request không kèm token (khách, hoặc sinh ra sau khi đăng xuất) thì không có gì để làm mới:
  // refresh lúc đó chỉ hồi sinh phiên bằng cookie chưa bị thu hồi (review T301-bao-mat-v2 #1)
  if (res.status === 401 && !NO_REFRESH.has(path) && gen === generation) {
    // Token đã được request khác làm mới trong lúc chờ → gửi lại luôn, không refresh thêm
    const fresh = auth.get().accessToken !== sentToken && auth.get().accessToken;
    if (fresh || (sentToken && (await refreshSession()))) {
      if (gen === generation) res = await send(path, options);
    } else if (sentToken && gen === generation) {
      expireSession();
    }
  }
  // Phiên bị xóa (đăng xuất/hết hạn) trong lúc chờ: bỏ kết quả, không đổ dữ liệu phiên cũ vào app
  if (gen !== generation) throw sessionEndedError();
  if (!res.ok) {
    const err = await toApiError(res);
    if (err.code === 'PASSWORD_CHANGE_REQUIRED') auth.requirePasswordChange();
    if (err.code === 'ACCOUNT_LOCKED' && path !== '/auth/login') {
      expireSession(err.message);
      err.sessionExpired = true;
    }
    throw err;
  }
  if (options.as === 'blob') return res.blob(); // tải file (CSV thống kê)
  return res.status === 204 ? null : res.json();
};

// Khởi động app: refresh đúng một lần; 401 → khách; mất mạng → 'offline' (màn có nút thử lại)
let bootPromise = null;
export const bootstrapSession = ({ retry = false } = {}) => {
  if (retry) {
    bootPromise = null;
    auth.setStatus('loading');
  }
  bootPromise ??= refreshSession()
    .then((ok) => ok || auth.clear())
    .catch(() => auth.setStatus('offline'));
  return bootPromise;
};

export const login = async (values) => {
  // Chờ logout trước gửi xong, tránh nó thu hồi/ghi đè cookie của phiên mới
  await serverLogout;
  auth.setSession(await api('/auth/login', { method: 'POST', body: values }));
  authChannel?.postMessage('login'); // tab khác đang giữ phiên người cũ thì xóa (INFO i1 T303)
  return auth.get().user;
};

// Xóa client ngay (lỗi mạng vẫn xóa, UI §1.1). Gọi thẳng send(): /auth/logout chỉ cần cookie,
// không đi qua refresh/expireSession (không toast "hết hạn", không giữ next – review T301-bao-mat #3).
// Refresh đang chạy sẽ đặt cookie mới → gửi logout sau khi nó xong để server thu hồi đúng họ phiên;
// khi đó không chờ (refresh có thể mất hàng chục giây lúc Render khởi động).
export const logout = async () => {
  const pendingRefresh = refreshPromise;
  clearClientSession();
  authChannel?.postMessage('logout');
  serverLogout = (pendingRefresh ?? Promise.resolve())
    .catch(() => {})
    .then(() => send('/auth/logout', { method: 'POST', keepalive: true }))
    .catch(() => {});
  if (!pendingRefresh) await serverLogout;
  handlers.onLogout();
};
