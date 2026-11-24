import { useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Nút dựa trên buttonVariants của shadcn/ui; vùng chạm ≥ 44 px (UI §8), co 3% khi nhấn (skill review-animations)
const press = 'min-h-11 px-4 font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97]';
export const btn = cn(buttonVariants({ variant: 'outline' }), press);
export const btnPrimary = cn(buttonVariants(), press);
export const btnGhost = cn(buttonVariants({ variant: 'outline' }), press, 'border-blue-700/30 text-blue-800 hover:border-blue-700');
export const btnDanger = cn(buttonVariants({ variant: 'outline' }), press, 'border-destructive text-destructive hover:bg-red-50 hover:text-destructive');
// Cùng class với Card của shadcn/ui (bo góc, viền, nền thẻ) nhưng giữ dạng chuỗi để các trang ghép thêm class
export const card = 'rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6';
// xl: bỏ overflow để đầu bảng dính được theo trang (overflow tạo khung cuộn riêng làm sticky mất tác dụng)
export const tableFrame = 'overflow-x-auto xl:overflow-visible rounded-2xl border bg-card shadow-sm';
// Hộp thoại có ô nhập hoặc lựa chọn bắt buộc: bấm ra ngoài không đóng
export const keepOpenOnOutside = { onInteractOutside: (e) => e.preventDefault() };
// Esc không đóng khi form đã gõ dở (đóng bằng nút Hủy), tránh mất nội dung
export const keepOpenOnEscIf = (dirty) => ({ onEscapeKeyDown: (e) => { if (dirty) e.preventDefault(); } });
/**
 * Props cho DialogContent: đóng thì trả focus về phần tử đang focus lúc mở.
 * Không có DialogTrigger nên mặc định của Radix (focus trigger) để focus rơi về body.
 */
export function useReturnFocus() {
  const [opener] = useState(() => document.activeElement);
  return { onCloseAutoFocus: (e) => { e.preventDefault(); if (opener?.isConnected) opener.focus(); } };
}
/** Chữ tắt cho ô avatar: chữ đầu của 2 từ cuối họ tên ("Nguyễn Thị Minh Anh" → "MA") */
export const initials = (name = '') => name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();

/** Đầu trang: tiêu đề + mô tả ngắn bên trái, nút thao tác chính bên phải */
export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/** Trạng thái đang tải / lỗi (error.message từ API) / dữ liệu; empty: nội dung khi rỗng (UI §6) */
export function QueryBox({ query, empty, isEmpty, children }) {
  // Khung xám nhấp nháy theo dáng danh sách; chữ "Đang tải…" vẫn còn cho trình đọc màn hình (và E2E chờ theo nó)
  if (query.isPending) return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Đang tải…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="space-y-2.5 rounded-2xl border bg-card p-5">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
  if (query.isError) {
    return (
      <Alert variant="destructive" className="border-red-200 bg-red-50">
        <AlertCircle aria-hidden="true" />
        <AlertDescription className="break-words text-red-800">
          {query.error.message}
          <button type="button" onClick={() => query.refetch()} className={`${btnGhost} mt-2`}>Thử lại</button>
        </AlertDescription>
      </Alert>
    );
  }
  if (empty && isEmpty?.(query.data)) return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-12 text-center text-muted-foreground">
      <span className="grid size-14 place-items-center rounded-full bg-accent"><Inbox aria-hidden="true" className="size-7 text-blue-700" /></span>
      <p>{empty}</p>
    </div>
  );
  return children(query.data);
}

/** Màu nhãn trạng thái đề tài: chờ người khác = blue, cần sinh viên xử lý = amber, đang chạy = green, kết thúc xấu = red */
export const STATUS_TONE = {
  WAITING_ADVISOR: 'blue', HAS_ADVISOR: 'blue', UNDER_REVIEW: 'blue', WAITING_CLOSE: 'blue', WAITING_DEFENSE: 'blue',
  NEEDS_REVISION: 'amber', IN_PROGRESS: 'green', RECRUITING: 'green', REJECTED: 'red',
};

export function Badge({ children, tone = 'slate' }) {
  const t = {
    slate: ['bg-slate-100 text-slate-700', 'bg-slate-400'], green: ['bg-emerald-50 text-emerald-800', 'bg-emerald-500'],
    amber: ['bg-amber-50 text-amber-900', 'bg-amber-500'], red: ['bg-red-50 text-red-800', 'bg-red-500'],
    blue: ['bg-blue-50 text-blue-800', 'bg-blue-500'],
  }[tone];
  return (
    <UiBadge variant="outline" className={cn('gap-1.5 border-0 py-1 pl-2 pr-2.5', t[0])}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', t[1])} />{children}
    </UiBadge>
  );
}

/** Con dấu trạng thái ở đầu trang chi tiết đề tài – điểm nhấn duy nhất của giao diện, luôn màu son */
export function Stamp({ children }) {
  return (
    <span className="inline-flex animate-stamp items-center rounded-sm border-[4px] border-double border-seal px-4 py-1.5 text-base font-bold tracking-wide text-seal">
      {children}
    </span>
  );
}

// Dialog của shadcn/ui (Radix): khóa focus, Esc đóng, trả focus về nút đã mở; luôn mở khi được render
export function ConfirmDialog({ title, message, confirmLabel = 'Xác nhận', danger, busy, error, onConfirm, onCancel }) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} {...returnFocus} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-red-700 break-words">{error}</p>}
        <DialogFooter>
          <button type="button" onClick={onCancel} className={btnGhost}>Hủy</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={danger ? btnDanger : btnPrimary}>{busy ? 'Đang xử lý…' : confirmLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hộp mật khẩu tạm (UI §4.20): chỉ giữ ở props/state cục bộ của trang gọi, không vào cache */
export function TempPasswordBox({ password, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div role="alertdialog" aria-label="Mật khẩu tạm" className="rounded-xl border border-amber-300 bg-amber-50 p-5 animate-in fade-in-0 slide-in-from-top-1">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound aria-hidden="true" className="size-4" />Mật khẩu tạm</h2>
      <p className="mt-2 break-all rounded-md border border-amber-200 bg-card p-3 font-mono text-lg tracking-wider" data-testid="temp-password">{password}</p>
      <p className="mt-2 text-sm text-red-800">Mật khẩu chỉ hiện một lần. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={btnGhost}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
        <button type="button" onClick={onClose} className={btnPrimary}>Đóng</button>
      </div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">Trang {page}/{pages} ({total} mục)</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btnGhost}><ChevronLeft aria-hidden="true" className="size-4" />Trang trước</button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={btnGhost}>Trang sau<ChevronRight aria-hidden="true" className="size-4" /></button>
      </div>
    </div>
  );
}

/** Nhóm checkbox chọn nhiều theo id; value là mảng id */
export function CheckGroup({ legend, options, value = [], onChange, error }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-800">{legend}</legend>
      <div className="flex flex-wrap gap-x-4">
        {options.map((o) => (
          <label key={o.id} className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} className="size-5 rounded border-input accent-blue-700" />
            {o.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-red-700 break-words">{error}</p>}
    </fieldset>
  );
}

/** <select> đồng bộ nhãn tiếng Việt; options: [{value,label}] */
export const opt = (items, valueKey = 'id', label = (i) => i.name) => items.map((i) => ({ value: i[valueKey], label: label(i) }));
export function Options({ options, placeholder }) {
  return (
    <>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </>
  );
}

/** Lỗi cấp form (errors.root) – hiện trên nút gửi (UI §6) */
export const FormError = ({ error }) => (error ? <p role="alert" className="text-sm text-red-700 break-words">{error}</p> : null);
