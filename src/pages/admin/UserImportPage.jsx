import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ROLE_LABEL, toCsv, USER_IMPORT_HEADERS, USER_IMPORT_MAX_BYTES, USER_IMPORT_MAX_ROWS } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { downloadCsv } from '../../lib/format.js';
import { useCooldown } from '../../lib/useCooldown.js';
import { useScopedFaculties } from '../../lib/queries.js';
import { FormField } from '../../components/FormField.jsx';
import { CircleCheck, CircleX, Eye, FileDown, Download } from 'lucide-react';
import { ConfirmDialog, Options, PageHeader, btnGhost, btnPrimary, card, opt, tableFrame } from '../../components/ui.jsx';

const CRED_COLUMNS = [
  { key: 'code', header: 'Mã' }, { key: 'email', header: 'Email' },
  { key: 'fullName', header: 'Họ tên' }, { key: 'temporaryPassword', header: 'Mật khẩu tạm' },
];
export const credentialsCsv = (credentials) => toCsv(credentials, CRED_COLUMNS);

// R21 – API_GD2 §3.2 nhập CSV 3 bước
export function UserImportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const cd = useCooldown();
  const faculties = useScopedFaculties(user);
  const [facultyId, setFacultyId] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null); // { validCount, errorCount, errors, preview }
  const [done, setDone] = useState(null); // { createdCount, credentials } – chỉ state cục bộ, không vào cache/storage

  // Chặn rời trang khi còn mật khẩu tạm chưa lưu
  const blocker = useBlocker(() => !!done);
  useEffect(() => {
    if (!done) return undefined;
    const h = (e) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [done]);

  const pick = (f) => {
    setReport(null);
    setFormError('');
    setFile(f ?? null);
    setFileError(f && f.size > USER_IMPORT_MAX_BYTES ? `File vượt quá ${USER_IMPORT_MAX_BYTES / 1024 / 1024} MB` : '');
  };

  const send = async (kind) => {
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    setFormError('');
    setFileError('');
    try {
      const res = await api(`/users/import/${kind}?facultyId=${encodeURIComponent(facultyId)}`, { method: 'POST', body });
      if (kind === 'preview') setReport(res);
      else {
        setDone(res);
        setReport(null);
        qc.invalidateQueries({ queryKey: ['users'] });
        downloadCsv(credentialsCsv(res.credentials), 'mat-khau-tam.csv');
      }
    } catch (err) {
      if (err.sessionExpired) return;
      if (err.status === 429) cd.start(err.retryAfter);
      if (err.code === 'IMPORT_HAS_ERRORS' && err.details?.errors) setReport(err.details);
      else if (err.details?.file) setFileError(err.details.file);
      else if (err.code === 'PAYLOAD_TOO_LARGE') setFileError(err.message);
      else if (err.code === 'DUPLICATE') { setFormError('Có tài khoản vừa được tạo trùng, hãy xem trước lại'); setReport(null); }
      else if (err.code === 'NETWORK_ERROR' && kind === 'confirm') setFormError('Không rõ kết quả. Kiểm tra danh sách tài khoản; nếu đã tạo, đặt lại mật khẩu từng người.');
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="max-w-2xl space-y-3">
        <PageHeader title="Nhập tài khoản từ CSV" />
        <p role="status" className="flex items-center gap-2 font-medium text-green-800"><CircleCheck aria-hidden="true" className="size-5" />Đã tạo {done.createdCount} tài khoản</p>
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 font-medium text-red-800">Mật khẩu tạm chỉ có ở đây. Rời trang là mất.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => downloadCsv(credentialsCsv(done.credentials), 'mat-khau-tam.csv')}><Download aria-hidden="true" className="size-4" />Tải lại file</button>
          <button type="button" className={btnPrimary} onClick={() => setDone(null)}>Tôi đã lưu file</button>
        </div>
        {blocker.state === 'blocked' && (
          <ConfirmDialog title="Rời trang?" message="Mật khẩu tạm sẽ mất, không lấy lại được." confirmLabel="Vẫn rời trang" danger
            onConfirm={() => blocker.proceed()} onCancel={() => blocker.reset()} />
        )}
      </section>
    );
  }

  const canPreview = facultyId && file && !fileError && !busy && !cd.active;
  return (
    <section className="max-w-3xl space-y-4">
      <PageHeader title="Nhập tài khoản từ CSV" description="Chọn khoa, tải file lên, xem trước rồi xác nhận. Mật khẩu tạm được tải về một lần duy nhất." />
      <div className={`${card} space-y-4`}>
        <FormField label="Khoa">
          <select value={facultyId} onChange={(e) => { setFacultyId(e.target.value); setReport(null); }}>
            <Options placeholder="Chọn khoa" options={opt(faculties.data ?? [])} />
          </select>
        </FormField>
        <FormField label="File CSV" error={fileError} hint={`Tối đa ${USER_IMPORT_MAX_ROWS} dòng, ${USER_IMPORT_MAX_BYTES / 1024 / 1024} MB. Cột: ${USER_IMPORT_HEADERS.join(', ')}`}>
          <input type="file" accept=".csv,text/csv" className="block w-full min-h-11 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-700 file:px-3 file:py-1.5 file:font-medium file:text-white" onChange={(e) => pick(e.target.files[0])} />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost}
            onClick={() => downloadCsv(toCsv([], USER_IMPORT_HEADERS.map((h) => ({ key: h, header: h }))), 'mau-nhap-tai-khoan.csv')}><FileDown aria-hidden="true" className="size-4" />Tải file mẫu</button>
          <button type="button" className={btnPrimary} disabled={!canPreview} onClick={() => send('preview')}><Eye aria-hidden="true" className="size-4" />{busy && !report ? 'Đang xử lý…' : 'Xem trước'}</button>
        </div>
        {cd.active && <p className="text-sm text-slate-700">{cd.message}</p>}
        {formError && <p role="alert" className="text-sm text-red-700 break-words">{formError}</p>}
      </div>

      {report && (
        <div className="space-y-3" aria-label="Kết quả xem trước">
          <p className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-900"><CircleCheck aria-hidden="true" className="size-4" />Hợp lệ: <strong>{report.validCount}</strong></span>
            <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 ${report.errorCount ? 'border-red-200 bg-red-50 text-red-900' : 'border-slate-200 bg-card text-slate-700'}`}><CircleX aria-hidden="true" className="size-4" />Lỗi: <strong>{report.errorCount}</strong></span>
          </p>
          {report.errorCount > 0 && (
            <>
              <p role="alert" className="text-red-800">Sửa file rồi tải lên lại{report.errorCount > report.errors.length ? ` (chỉ hiện ${report.errors.length} lỗi đầu)` : ''}.</p>
              <div className={tableFrame}><table className="w-full min-w-[24rem] text-left text-sm">
                <caption className="sr-only">Các dòng lỗi</caption>
                <thead><tr><th className="px-3 py-2.5">Dòng</th><th className="px-3 py-2.5">Trường</th><th className="px-3 py-2.5">Lỗi</th></tr></thead>
                <tbody>{report.errors.map((e, i) => (
                  <tr key={i}><td className="px-3 py-2.5">{e.row}</td><td className="px-3 py-2.5">{e.field ?? 'Cả dòng'}</td><td className="px-3 py-2.5 break-words">{e.message}</td></tr>
                ))}</tbody>
              </table></div>
            </>
          )}
          {report.preview?.length > 0 && (
            <>
              {report.validCount > report.preview.length && <p className="text-sm text-slate-700">Chỉ hiện {report.preview.length} dòng đầu.</p>}
              <div className={tableFrame}><table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">Các dòng hợp lệ</caption>
                <thead><tr>{['Dòng', 'Mã', 'Email', 'Họ tên', 'Vai trò', 'Lớp'].map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}</tr></thead>
                <tbody>{report.preview.map((r) => (
                  <tr key={r.row}><td className="px-3 py-2.5">{r.row}</td><td className="px-3 py-2.5">{r.code}</td><td className="px-3 py-2.5 break-all">{r.email}</td>
                    <td className="px-3 py-2.5 break-words">{r.fullName}</td><td className="px-3 py-2.5">{ROLE_LABEL[r.role]}</td><td className="px-3 py-2.5">{r.classCode}</td></tr>
                ))}</tbody>
              </table></div>
            </>
          )}
          <button type="button" className={btnPrimary} disabled={report.errorCount > 0 || report.validCount === 0 || busy || cd.active} onClick={() => send('confirm')}>
            {busy ? 'Đang tạo…' : `Xác nhận tạo ${report.validCount} tài khoản`}
          </button>
        </div>
      )}
    </section>
  );
}
