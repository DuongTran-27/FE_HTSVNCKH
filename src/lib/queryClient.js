import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from './toast.js';

// GET thử lại tối đa 2 lần chỉ với mất mạng (status 0) và 503; mutation không thử lại (UI §6)
export const shouldRetryQuery = (failureCount, error) =>
  failureCount < 2 && (error?.status === 0 || error?.status === 503);

// 503 khi tải dữ liệu: toast không tự ẩn, có nút "Thử lại" (UI §7; review T301-reviewer-v2 i2)
export const queryCache = new QueryCache({
  onError: (error, query) => {
    if (error?.status !== 503 || error.sessionExpired) return;
    toast(error.message, {
      type: 'error',
      duration: 0,
      action: { label: 'Thử lại', onClick: () => queryClient.invalidateQueries({ queryKey: query.queryKey }) },
    });
  },
});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: { retry: shouldRetryQuery },
    mutations: { retry: false },
  },
});
