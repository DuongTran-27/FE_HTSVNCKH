/** Diff theo từ (LCS; token = từ + khoảng trắng theo sau, so sánh bỏ khoảng trắng). Trả [{type:'same'|'add'|'del', text}]. Không thêm thư viện (UI §4.11). */
export function wordDiff(a = '', b = '') {
  const x = a.match(/\S+\s*/g) ?? [];
  const y = b.match(/\S+\s*/g) ?? [];
  // shortcut: văn bản rất dài thì coi như thay toàn bộ, tránh bảng LCS quá lớn; nâng cấp nếu cần
  if (x.length * y.length > 4_000_000) return [...(a ? [{ type: 'del', text: a }] : []), ...(b ? [{ type: 'add', text: b }] : [])];
  const n = x.length;
  const m = y.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i].trim() === y[j].trim() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  // 'same' giữ thêm `old` (khoảng trắng của bản cũ) để bên Cũ hiển thị đúng; text là của bản mới
  const push = (type, text, old = text) => {
    const last = out[out.length - 1];
    if (last?.type === type) { last.text += text; last.old += old; } else out.push({ type, text, old });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i].trim() === y[j].trim()) { push('same', y[j], x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push('del', x[i++]); else push('add', y[j++]);
  }
  while (i < n) push('del', x[i++]);
  while (j < m) push('add', y[j++]);
  return out.map(({ old, ...p }) => (p.type === 'same' && old !== p.text ? { ...p, old } : p));
}
