import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../lib/api.js';

/** Chuông (FR13): poll 60 s, dừng khi tab ẩn (refetchIntervalInBackground mặc định false). Danh sách ở /thong-bao */
export function NotificationBell() {
  const q = useQuery({
    queryKey: ['notifications', 'count'], queryFn: async () => (await api('/notifications/unread-count')).count,
    refetchInterval: 60_000, retry: false,
  });
  const n = q.data ?? 0;
  return (
    <Link to="/thong-bao" aria-label={n > 0 ? `Thông báo, ${n} chưa đọc` : 'Thông báo'} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
      <Bell aria-hidden="true" className="size-5" />
      {n > 0 && <span className="absolute right-0.5 top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-5 text-white ring-2 ring-white">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
