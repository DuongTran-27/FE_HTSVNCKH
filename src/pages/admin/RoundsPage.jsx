import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { fmtDateTime, qs } from '../../lib/format.js';
import { useScopedFaculties } from '../../lib/queries.js';
import { inputClass } from '../../components/FormField.jsx';
import { CalendarPlus } from 'lucide-react';
import { Badge, Options, PageHeader, Pager, QueryBox, btnGhost, btnPrimary, opt, tableFrame } from '../../components/ui.jsx';

// R23 – API_GD2 §4.3 GET /api/rounds
export function RoundsPage() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const facultyId = sp.get('facultyId') ?? '';
  const academicYear = sp.get('academicYear') ?? '';
  const page = Number(sp.get('page')) || 1;
  const faculties = useScopedFaculties(user);
  const set = (k, v) => setSp((old) => {
    const n = new URLSearchParams(old);
    if (v) n.set(k, v); else n.delete(k);
    if (k !== 'page') n.delete('page');
    return n;
  });
  // Năm học sai định dạng sẽ bị server từ chối (400) – chỉ gửi khi đủ dạng
  const yearOk = /^\d{4}-\d{4}$/.test(academicYear);
  const query = useQuery({
    queryKey: ['rounds', facultyId, yearOk ? academicYear : '', page],
    queryFn: () => api(`/rounds${qs({ facultyId, academicYear: yearOk ? academicYear : '', page, pageSize: 20 })}`),
  });
  const facName = Object.fromEntries((faculties.data ?? []).map((f) => [f.id, f.name]));
  const filtered = facultyId || academicYear;

  return (
    <section>
      <PageHeader title="Đợt" description="Đợt đăng ký đề tài: mốc thời gian và tham số kiểm tra hồ sơ của từng khoa.">
        <Link to="/quan-ly/dot/moi" className={btnPrimary}><CalendarPlus aria-hidden="true" className="size-4" />Tạo đợt mới</Link>
      </PageHeader>
      <form className="grid gap-2 sm:grid-cols-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5" onSubmit={(e) => e.preventDefault()} aria-label="Bộ lọc đợt">
        <select aria-label="Khoa" className={inputClass} value={facultyId} onChange={(e) => set('facultyId', e.target.value)}>
          <Options placeholder="Mọi khoa" options={opt(faculties.data ?? [])} />
        </select>
        <input aria-label="Năm học" placeholder="Năm học, ví dụ 2026-2027" className={inputClass} defaultValue={academicYear}
          onBlur={(e) => set('academicYear', e.target.value.trim())} onKeyDown={(e) => e.key === 'Enter' && set('academicYear', e.currentTarget.value.trim())} />
        {filtered && <button type="button" className={btnGhost} onClick={() => setSp({})}>Xóa bộ lọc</button>}
      </form>
      <div className="mt-3">
        <QueryBox query={query} empty="Chưa có đợt nào. Tạo đợt mới." isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <div className={tableFrame}>
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead><tr>
                    {['Tên', 'Khoa', 'Năm học', 'Mở đăng ký', 'Đóng đăng ký', 'Hạn xét duyệt', 'Kết thúc', ''].map((h) => <th key={h} scope="col" className="px-3 py-2.5">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {d.items.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2.5 break-words"><Link className="font-medium text-blue-700 underline-offset-4 hover:underline" to={`/quan-ly/dot/${r.id}`}>{r.name}</Link></td>
                        <td className="px-3 py-2.5">{facName[r.facultyId] ?? ''}</td>
                        <td className="px-3 py-2.5">{r.academicYear}</td>
                        <td className="px-3 py-2.5">{fmtDateTime(r.regOpenAt)}</td>
                        <td className="px-3 py-2.5">{fmtDateTime(r.regCloseAt)}</td>
                        <td className="px-3 py-2.5">{fmtDateTime(r.reviewDeadline)}</td>
                        <td className="px-3 py-2.5">{fmtDateTime(r.endAt)}</td>
                        <td className="px-3 py-2.5">{r.registrationOpen && <Badge tone="green">Đang mở đăng ký</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set('page', String(p))} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}
