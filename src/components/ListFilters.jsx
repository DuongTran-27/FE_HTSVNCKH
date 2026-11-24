import { useEffect, useState } from 'react';
import { inputClass } from './FormField.jsx';
import { Options } from './ui.jsx';

/** Ô chọn có nhãn (aria-label giữ nhãn cho trình đọc màn hình) */
export function FilterSelect({ label, value, onChange, options, placeholder }) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      <select className={`${inputClass} mt-1 font-normal`} value={value} onChange={(e) => onChange(e.target.value)}>
        <Options placeholder={placeholder} options={options} />
      </select>
    </label>
  );
}

/** Ô nhập debounce 400 ms, cắt 200 ký tự (UI §1.3); đồng bộ lại khi URL đổi từ ngoài (ví dụ "Xóa bộ lọc") */
export function DebouncedInput({ label, value, onCommit, placeholder, maxLength = 200, delay = 400 }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText((t) => (t.trim() === value ? t : value)); }, [value]);
  useEffect(() => {
    const v = text.trim().slice(0, maxLength);
    if (v === value) return undefined;
    const id = setTimeout(() => onCommit(v), delay);
    return () => clearTimeout(id);
  }, [text, value, onCommit, maxLength, delay]);
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={maxLength} placeholder={placeholder} className={`${inputClass} mt-1 font-normal`} />
    </label>
  );
}
