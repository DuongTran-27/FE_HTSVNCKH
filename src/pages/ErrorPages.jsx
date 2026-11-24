import { Link } from 'react-router';
import { useAuth } from '../lib/auth.js';
import { homePath } from '../lib/nav.js';
import { FileQuestion, ShieldX } from 'lucide-react';
import { btnPrimary } from '../components/ui.jsx';

function Notice({ title, icon: Icon, hint }) {
  const { user } = useAuth();
  return (
    <section className="flex flex-col items-center py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-slate-100 text-slate-500"><Icon aria-hidden="true" className="size-8" /></span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">{hint}</p>
      <Link to={homePath(user?.role)} className={`${btnPrimary} mt-6`}>
        Về trang chủ
      </Link>
    </section>
  );
}

export const Forbidden = () => <Notice title="Bạn không có quyền truy cập trang này" icon={ShieldX} hint="Trang này dành cho vai trò khác. Nếu cần quyền, hãy liên hệ cán bộ khoa." />;
export const NotFound = () => <Notice title="Không tìm thấy trang" icon={FileQuestion} hint="Đường dẫn có thể đã sai hoặc trang đã bị gỡ." />;
