import { useSyncExternalStore } from 'react';
import { dismissToast, toastStore } from '../lib/toast.js';

const STYLES = {
  info: 'bg-slate-800 text-white',
  success: 'bg-green-700 text-white',
  error: 'bg-red-700 text-white',
};

// Đặt một lần ở gốc app; gọi toast() từ lib/toast.js để hiện
export function ToastViewport() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.get);
  return (
    <div aria-live="polite" className="fixed inset-x-2 bottom-2 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((t) => (
        <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
          className={`flex w-full max-w-sm items-start gap-2 rounded-lg px-4 py-3 shadow-xl ring-1 ring-black/5 break-words ${STYLES[t.type] ?? STYLES.info}`}>
          <p className="flex-1 text-sm">{t.message}</p>
          {t.action && (
            <button type="button" onClick={() => { dismissToast(t.id); t.action.onClick(); }}
              className="-my-2 min-h-11 shrink-0 rounded px-2 text-sm font-semibold underline">{t.action.label}</button>
          )}
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Đóng thông báo"
            className="-my-2 -mr-2 min-h-11 min-w-11 text-lg leading-none">×</button>
        </div>
      ))}
    </div>
  );
}
