import { useSyncExternalStore } from 'react';

// Nguồn duy nhất của user + access token, chỉ trong bộ nhớ (NFR01, UI §1.1).
// status: 'loading' (đang refresh khởi động) | 'ready' | 'offline' (không gọi được máy chủ lúc khởi động)
let state = { status: 'loading', user: null, accessToken: null };
const listeners = new Set();

const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const auth = {
  get: () => state,
  subscribe: (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setSession: ({ accessToken, user }) => set({ status: 'ready', accessToken, user }),
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clear: () => set({ status: 'ready', user: null, accessToken: null }),
  // API trả 403 PASSWORD_CHANGE_REQUIRED dù user trong bộ nhớ còn cũ (UI §1.2)
  requirePasswordChange: () => state.user && !state.user.mustChangePassword
    && set({ user: { ...state.user, mustChangePassword: true } }),
};

export const useAuth = () => useSyncExternalStore(auth.subscribe, auth.get);
