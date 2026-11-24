import { useEffect, useState } from 'react';
import { FlaskConical, Loader2, WifiOff } from 'lucide-react';

const Brand = () => <p className="flex items-center gap-2 text-xl font-semibold text-blue-800"><FlaskConical aria-hidden="true" className="size-6" />Nghiên cứu khoa học sinh viên</p>;

// Màn tải toàn trang lúc khởi động (UI §1.1); > 5 s thì báo máy chủ đang khởi động (Render ngủ, NFR10)
export function FullPageLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <Brand />
      <p className="flex items-center gap-2 text-slate-600"><Loader2 aria-hidden="true" className="size-4 animate-spin" />Đang tải…</p>
      {slow && <p className="text-sm text-slate-600">Máy chủ đang khởi động, vui lòng chờ…</p>}
    </div>
  );
}

export function FullPageOffline({ onRetry }) {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <Brand />
      <WifiOff aria-hidden="true" className="size-8 text-slate-400" />
      <p className="text-slate-700">Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.</p>
      <button type="button" onClick={onRetry} className="min-h-11 rounded-md bg-navy px-4 font-medium text-white hover:bg-navy/90">Thử lại</button>
    </div>
  );
}
