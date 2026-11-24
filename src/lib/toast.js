// Store toast cấp module để cả code ngoài React (API client) gọi được
let toasts = [];
let nextId = 1;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const dismissToast = (id) => {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
};

// Xóa hết khi xóa phiên: toast của phiên trước không được sang phiên sau
export const clearToasts = () => {
  toasts = [];
  emit();
};

// type: 'info' | 'success' | 'error'; action: { label, onClick } – vd. 503 → "Thử lại" (UI §7)
export const toast = (message, { type = 'info', duration = 5000, action } = {}) => {
  const id = nextId++;
  toasts = [...toasts, { id, message, type, action }];
  emit();
  if (duration) setTimeout(() => dismissToast(id), duration);
  return id;
};

export const toastStore = {
  get: () => toasts,
  subscribe: (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
