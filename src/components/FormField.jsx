import { cloneElement, useId } from 'react';
import { Label } from '@/components/ui/label';

// Class của Input shadcn/ui (dùng chung cho input/textarea/select gốc để giữ register() của RHF); ô ≥ 16 px, cao ≥ 44 px (UI §8)
export const inputClass = 'block w-full min-h-11 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs '
  + 'transition-[color,box-shadow] outline-none placeholder:text-muted-foreground hover:border-slate-400 '
  + 'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 '
  + 'aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20';

/**
 * Nhãn trên ô + ô (children, một phần tử) + lỗi ngay dưới ô (NFR07).
 * Ví dụ: <FormField label="Mật khẩu" error={errors.password?.message}><input type="password" {...register('password')} /></FormField>
 */
export function FormField({ label, error, hint, children, className = '' }) {
  const autoId = useId();
  const id = children.props.id ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{label}</Label>
      {cloneElement(children, {
        id,
        className: children.props.className ?? inputClass,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && <p id={hintId} className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-sm text-red-700 break-words">{error}</p>}
    </div>
  );
}
