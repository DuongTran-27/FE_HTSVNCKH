import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, matchPath, useLocation } from 'react-router';
import {
  Archive, BarChart3, CalendarRange, ChevronRight, ClipboardCheck, FileStack, FlaskConical, GitPullRequestArrow, History,
  KeyRound, LayoutDashboard, LibraryBig, LogOut, Mail, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, Tags, UserCheck, UserRound, Users,
} from 'lucide-react';
import { logout } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { ROLE_LABEL } from '@nckh/shared';
import { NotificationBell } from './NotificationBell.jsx';
import { MENU, SCREENS } from '../lib/nav.js';
import { setTheme, useTheme } from '../lib/theme.js';
import { initials } from './ui.jsx';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// Biểu tượng theo đường dẫn menu (nav.js giữ nhãn và quyền, ở đây chỉ trang trí)
const ICON = {
  '/tong-quan': LayoutDashboard, '/de-tai': FileStack, '/loi-moi': Mail, '/yeu-cau': GitPullRequestArrow, '/lich-su-tham-gia': History, '/kho': Archive,
  '/de-nghi-huong-dan': UserCheck, '/thong-ke': BarChart3, '/xet-duyet': ClipboardCheck, '/quan-ly/dot': CalendarRange,
  '/quan-ly/tai-khoan': Users, '/quan-ly/danh-muc/nganh': Tags, '/quan-ly/danh-muc/khoa': Tags,
};

const linkClass = ({ isActive }) => cn(buttonVariants({ variant: 'ghost' }), 'min-h-11 shrink-0 gap-2.5 px-3 text-muted-foreground hover:text-blue-900',
  isActive && 'bg-accent text-blue-900');
// Thanh bên navy Văn Lang (người dùng chọn 2026-11-18): mục đang mở nền trắng mờ + vạch vàng Văn Lang bên trái
const navClass = (collapsed) => ({ isActive }) => cn(
  'relative inline-flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-vlu-gold',
  collapsed && 'lg:justify-center lg:px-0',
  isActive
    ? 'bg-white/12 text-white lg:before:absolute lg:before:inset-y-2 lg:before:left-0 lg:before:w-[3px] lg:before:rounded-full lg:before:bg-vlu-gold'
    : 'text-white/70 hover:bg-white/8 hover:text-white',
);
// Đường dẫn trang: mỗi tiền tố của URL khớp một màn trong SCREENS thành một mục ("/de-tai/x/nhom" → Đề tài › Chi tiết đề tài › Nhóm)
export const crumbsOf = (pathname) => pathname.split('/').filter(Boolean)
  .map((_, i, segs) => `/${segs.slice(0, i + 1).join('/')}`)
  .map((to) => {
    const screen = SCREENS.find(([p]) => matchPath(`/${p}`, to));
    return screen && { to, label: screen[2] };
  })
  .filter(Boolean);

function Breadcrumbs({ pathname }) {
  const crumbs = crumbsOf(pathname);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Đường dẫn" className="hidden min-w-0 sm:block">
      {/* span thay vì ol/li: danh sách đề tài và test của nó tìm listitem, mục đường dẫn không được lẫn vào */}
      <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={c.to} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />}
            {i === crumbs.length - 1
              ? <span aria-current="page" className="truncate font-medium text-foreground">{c.label}</span>
              : <Link to={c.to} className="truncate hover:text-foreground hover:underline">{c.label}</Link>}
          </span>
        ))}
      </p>
    </nav>
  );
}

function NavItems({ menu, collapsed = false, onPick }) {
  return menu.map((m) => {
    const Icon = ICON[m.to] ?? LibraryBig;
    return (
      <NavLink key={m.to} to={m.to} title={collapsed ? m.label : undefined} className={navClass(collapsed)} onClick={onPick}>
        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
        <span className={cn(collapsed && 'lg:sr-only')}>{m.label}</span>
      </NavLink>
    );
  });
}

const COLLAPSE_KEY = 'nckh.sidebarCollapsed';
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
};

// Khung các trang sau đăng nhập. Mật khẩu tạm: chỉ còn "Đăng xuất" (UI §1.2).
export function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const theme = useTheme();
  if (!user) return null; // đang đăng xuất, router sắp chuyển về /dang-nhap
  if (user.mustChangePassword && pathname !== '/doi-mat-khau') return <Navigate to="/doi-mat-khau" replace />;
  const menu = user.mustChangePassword ? [] : (MENU[user.role] ?? []);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* chỉ là tiện ích, bỏ qua nếu bị chặn */ }
    return !c;
  });
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  return (
    <div className={cn('min-h-screen lg:grid', collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[16rem_1fr]')}>
      <aside className="flex items-center bg-navy text-white lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:items-stretch">
        <Link to="/" className={cn('flex min-h-11 items-center gap-3 px-4 py-3 focus-visible:outline-vlu-gold lg:h-16', collapsed && 'lg:justify-center lg:px-0')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-vlu-red text-white shadow-sm"><FlaskConical aria-hidden="true" className="size-5" /></span>
          <span className={cn('leading-tight', collapsed && 'lg:sr-only')}>
            <span className="block font-bold text-white">Nghiên cứu khoa học</span>
            <span className="block text-xs text-white/60">Khoa Công nghệ Thông tin</span>
          </span>
        </Link>
        {menu.length > 0 && (
          <button type="button" onClick={() => setDrawer(true)} aria-expanded={drawer}
            className="mr-2 ml-auto inline-flex size-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/8 hover:text-white focus-visible:outline-vlu-gold lg:hidden">
            <Menu aria-hidden="true" className="size-5" /><span className="sr-only">Mở menu</span>
          </button>
        )}
        <Separator className="hidden bg-white/10 lg:block" />
        {menu.length > 0 && (
          <nav aria-label="Menu chính" className="hidden lg:flex lg:flex-1 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:p-3">
            {!collapsed && <p aria-hidden="true" className="px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-white/50 uppercase">Chức năng</p>}
            <NavItems menu={menu} collapsed={collapsed} />
          </nav>
        )}
        <div className="hidden border-t border-white/10 p-3 lg:block">
          <button type="button" onClick={toggle} aria-pressed={collapsed}
            className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-11 w-full justify-start gap-3 px-3 text-white/70 hover:bg-white/8 hover:text-white focus-visible:outline-vlu-gold', collapsed && 'justify-center px-0')}>
            <ToggleIcon aria-hidden="true" className="size-[18px]" /><span className={cn(collapsed && 'sr-only')}>Thu gọn menu</span>
          </button>
        </div>
      </aside>
      {/* Điện thoại, máy tính bảng: menu trượt từ trái (Radix Dialog khóa focus, Esc đóng, trả focus về nút mở) */}
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogContent aria-describedby={undefined}
          className="top-0 left-0 h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 content-start gap-0 rounded-none border-0 bg-navy p-0 text-white sm:max-w-72 data-[state=closed]:zoom-out-100 data-[state=closed]:slide-out-to-left data-[state=open]:zoom-in-100 data-[state=open]:slide-in-from-left lg:hidden [&>button]:text-white">
          <DialogTitle className="flex h-16 items-center gap-3 px-4 text-base">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-vlu-red"><FlaskConical aria-hidden="true" className="size-5" /></span>Menu
          </DialogTitle>
          <nav aria-label="Menu chính" className="flex flex-col gap-1 border-t border-white/10 p-3">
            <NavItems menu={menu} onPick={() => setDrawer(false)} />
          </nav>
        </DialogContent>
      </Dialog>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex min-h-16 flex-wrap items-center justify-end gap-1 px-4 py-2 lg:px-8">
            <div className="mr-auto min-w-0"><Breadcrumbs pathname={pathname} /></div>
            <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-pressed={theme === 'dark'} title="Chế độ tối" className={linkClass({ isActive: false })}>
              <ThemeIcon aria-hidden="true" className="size-4" /><span className="sr-only">Chế độ tối</span>
            </button>
            {!user.mustChangePassword && <NotificationBell />}
            {!user.mustChangePassword && <NavLink to="/ho-so" className={linkClass}><UserRound aria-hidden="true" className="size-4" /><span className="sr-only sm:not-sr-only">Hồ sơ</span></NavLink>}
            {!user.mustChangePassword && <NavLink to="/doi-mat-khau" className={linkClass}><KeyRound aria-hidden="true" className="size-4" /><span className="sr-only sm:not-sr-only">Đổi mật khẩu</span></NavLink>}
            <button type="button" onClick={logout} className={linkClass({ isActive: false })}><LogOut aria-hidden="true" className="size-4" /><span className="sr-only sm:not-sr-only">Đăng xuất</span></button>
            <div className="ml-1 flex min-w-0 items-center gap-2.5 border-l pl-3">
              <Avatar aria-hidden="true" className="size-9"><AvatarFallback className="bg-navy text-xs font-semibold text-white dark:bg-blue-200">{initials(user.fullName)}</AvatarFallback></Avatar>
              <span className="hidden min-w-0 text-sm leading-tight md:block"><span className="block max-w-48 truncate font-semibold">{user.fullName}</span><span className="text-xs text-muted-foreground">{ROLE_LABEL[user.role] ?? user.role}</span></span>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[100rem] p-4 sm:p-6 lg:p-8"><Outlet /></div>
      </div>
    </div>
  );
}
