// Xuất CSV cho Excel: UTF-8 có BOM + chống CSV injection (FR14).
const BOM = '\uFEFF';
// Kể cả khoảng trắng đầu ô và dạng toàn chiều rộng (＝＋－＠) mà Excel/LibreOffice có thể chuẩn hóa thành công thức
const DANGEROUS = /^(?:[\t\r]|\s*[=+\-@＝＋－＠])/;

export const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (DANGEROUS.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** columns: [{key, header}] */
export const toCsv = (rows, columns) => {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(','));
  return BOM + [head, ...body].join('\r\n');
};

/**
 * Đọc CSV (RFC 4180 rút gọn): dấu phẩy, ô trong ngoặc kép có thể chứa dấu phẩy/xuống dòng, "" là một ngoặc kép.
 * Trả mảng bản ghi (mảng ô); dòng trống hoàn toàn bị bỏ. Ném Error nếu ngoặc kép không đóng.
 * Không chống CSV injection: giá trị được lưu nguyên, `escapeCell` xử lý khi xuất.
 */
export const parseCsv = (text) => {
  const records = [];
  let rec = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const endRecord = () => {
    rec.push(cell);
    if (!(rec.length === 1 && rec[0] === '')) records.push(rec);
    rec = [];
    cell = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { rec.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else cell += ch;
    i++;
  }
  if (quoted) throw new Error('Ngoặc kép không được đóng');
  if (cell !== '' || rec.length) endRecord();
  return records;
};

// yyyyMMdd theo giờ Việt Nam cho tên file CSV (API_GD45 §11); en-CA định dạng sẵn yyyy-MM-dd
const vnDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
export const formatVnDate = (date) => vnDay.format(date).replaceAll('-', '');
