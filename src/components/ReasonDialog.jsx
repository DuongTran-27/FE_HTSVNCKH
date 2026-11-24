import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { reasonSchema } from '@nckh/shared';
import { applyServerErrors } from '../lib/forms.js';
import { FormField } from './FormField.jsx';
import { btnDanger, btnGhost, keepOpenOnEscIf, keepOpenOnOutside, useReturnFocus } from './ui.jsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

/**
 * Hộp nhập lý do bắt buộc (reasonSchema 5–2000). onSubmit(reason) ném ApiError → hiện lỗi dưới ô hoặc ở hộp.
 * schema (khóa `reason`) và confirmClassName cho phép dùng lại làm hộp nhận xét bắt buộc (Kanban DC-17).
 */
export function ReasonDialog({ title, message, label = 'Lý do', confirmLabel, onSubmit, onCancel, schema = reasonSchema, confirmClassName = btnDanger }) {
  const { register, handleSubmit, setError, formState: { errors, isDirty, isSubmitting } } = useForm({
    resolver: zodResolver(schema), defaultValues: { reason: '' },
  });
  const returnFocus = useReturnFocus();
  const submit = async ({ reason }) => {
    try {
      await onSubmit(reason);
    } catch (err) {
      if (!err.sessionExpired) setError('root', { message: applyServerErrors(err, setError, ['reason']).join(' ') || undefined });
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} {...(!message && { 'aria-describedby': undefined })} {...keepOpenOnOutside} {...keepOpenOnEscIf(isDirty)} {...returnFocus} className="sm:max-w-md">
      <form noValidate onSubmit={handleSubmit(submit)} className="space-y-3">
        <DialogTitle>{title}</DialogTitle>
        {message && <DialogDescription>{message}</DialogDescription>}
        <FormField label={label} error={errors.reason?.message}><textarea rows={4} {...register('reason')} /></FormField>
        {errors.root?.message && <p role="alert" className="text-sm text-red-700 break-words">{errors.root.message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnGhost}>Hủy</button>
          <button type="submit" disabled={isSubmitting} className={confirmClassName}>{isSubmitting ? 'Đang xử lý…' : confirmLabel}</button>
        </div>
      </form>
      </DialogContent>
    </Dialog>
  );
}
