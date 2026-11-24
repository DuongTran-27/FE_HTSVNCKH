import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChartColumn, ChartPie, Download, FileStack, FilterX, Layers, Trophy } from 'lucide-react';
import { FINAL_RESULT_LABEL, STATS_DIMENSION_LABEL, STATS_GROUP_BY, TOPIC_STATUS_LABEL } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { downloadBlob, downloadCsv, qs } from '../../lib/format.js';
import { toast } from '../../lib/toast.js';
import { useCatalog } from '../../lib/queries.js';
import { pickEnum, pickYear, useUrlParams } from '../../lib/urlParams.js';
import { DebouncedInput, FilterSelect } from '../../components/ListFilters.jsx';
import { StatsChart } from '../../components/StatsChart.jsx';
import { StuckTopics } from '../../components/StuckTopics.jsx';
import { QueryBox, btnGhost, btnPrimary, card } from '../../components/ui.jsx';

const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const STATUS_NO_DRAFT = Object.fromEntries(Object.entries(TOPIC_STATUS_LABEL).filter(([k]) => k !== 'DRAFT')); // API_GD45 §9.1
const CHARTS = { bar: ['Biểu đồ cột', ChartColumn], pie: ['Biểu đồ tròn', ChartPie] };
const pct = (n, total) => (total ? `${Math.round((n / total) * 1000) / 10}%` : '—');

function Tile({ label, value, note, icon: Icon, tone }) {
  return (
    <div className={`${card} flex items-start justify-between gap-4`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-blue-900 tabular-nums">{value}</p>
        {note && <p className="mt-1 break-words text-sm text-muted-foreground">{note}</p>}
      </div>
      <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
    </div>
  );
}

// /thong-ke – API_GD45 §9. Biểu đồ, bảng và CSV dùng cùng một chuỗi query (FR14)
export function StatsPage() {
  const { user } = useAuth();
  const u = useUrlParams();
  const isStaff = user?.role === 'STAFF';
  const [chart, setChart] = useState('bar');
  const [csvError, setCsvError] = useState('');
  const [busy, setBusy] = useState(''); // '' | 'csv' | 'xlsx'
  const params = {
    groupBy: pickEnum(u.get('groupBy'), STATS_GROUP_BY) || 'status',
    roundId: u.get('roundId'), academicYear: pickYear(u.get('academicYear')), fieldId: u.get('fieldId'),
    lecturerId: isStaff ? u.get('lecturerId') : '',
    status: pickEnum(u.get('status'), Object.keys(STATUS_NO_DRAFT)), result: pickEnum(u.get('result'), Object.keys(FINAL_RESULT_LABEL)),
  };
  const query = qs(params);
  const rounds = useQuery({ queryKey: ['rounds', 'all'], queryFn: async () => (await api('/rounds?pageSize=100')).items });
  const fields = useCatalog('fields');
  const lecturers = useQuery({ queryKey: ['users', 'lecturers-filter'], enabled: isStaff, queryFn: async () => (await api('/users?role=LECTURER&pageSize=100')).items });
  const stats = useQuery({ queryKey: ['stats', query], queryFn: () => api(`/stats${query}`), placeholderData: keepPreviousData });
  const yearBad = u.get('academicYear') && !params.academicYear;

  // CSV và Excel (FR39, UI §12.11) cùng chuỗi query; tải qua api (Bearer) dạng blob. Lỗi CSV hiện tại chỗ, lỗi Excel là toast
  const exportFile = async (ext) => {
    setBusy(ext);
    setCsvError('');
    try {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()).replaceAll('-', '');
      const save = ext === 'csv' ? downloadCsv : downloadBlob; // Blob xlsx giữ MIME của server
      save(await api(`/stats/export.${ext}${query}`, { as: 'blob' }), `thong-ke-${params.groupBy}-${day}.${ext}`);
    } catch (err) {
      if (ext === 'csv') setCsvError(err.message);
      else if (!err.sessionExpired) toast(err.message, { type: 'error' });
    } finally {
      setBusy('');
    }
  };

  const dim = STATS_DIMENSION_LABEL[params.groupBy];
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Thống kê</h1>
          <p className="mt-1 text-sm text-slate-600">Số đề tài theo {dim.toLowerCase()}; biểu đồ, bảng và file CSV/Excel dùng cùng bộ lọc.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => exportFile('csv')}><Download aria-hidden="true" className="size-4" />{busy === 'csv' ? 'Đang tải…' : 'Xuất CSV'}</button>
          <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => exportFile('xlsx')}><Download aria-hidden="true" className="size-4" />{busy === 'xlsx' ? 'Đang xuất…' : 'Xuất Excel'}</button>
        </div>
      </div>
      {csvError && <p role="alert" className="mt-2 text-sm text-red-700">{csvError}</p>}
      <div className={`${card} mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <FilterSelect label="Thống kê theo" value={params.groupBy} onChange={(v) => u.set('groupBy', v)} options={toOptions(STATS_DIMENSION_LABEL)} />
        <FilterSelect label="Đợt" value={params.roundId} onChange={(v) => u.set('roundId', v)} placeholder="Mọi đợt"
          options={(rounds.data ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.academicYear})` }))} />
        <div>
          <DebouncedInput label="Năm học" value={u.get('academicYear')} onCommit={(v) => u.set('academicYear', v)} placeholder="2026-2027" maxLength={9} />
          {yearBad && <p className="mt-1 text-sm text-red-700">Năm học dạng 2026-2027</p>}
        </div>
        <FilterSelect label="Lĩnh vực" value={params.fieldId} onChange={(v) => u.set('fieldId', v)} placeholder="Mọi lĩnh vực"
          options={(fields.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
        {isStaff && (
          <FilterSelect label="Giảng viên hướng dẫn" value={params.lecturerId} onChange={(v) => u.set('lecturerId', v)} placeholder="Mọi giảng viên"
            options={(lecturers.data ?? []).map((l) => ({ value: l.id, label: `${l.code} – ${l.fullName}` }))} />
        )}
        <FilterSelect label="Trạng thái" value={params.status} onChange={(v) => u.set('status', v)} placeholder="Mọi trạng thái" options={toOptions(STATUS_NO_DRAFT)} />
        <FilterSelect label="Kết quả" value={params.result} onChange={(v) => u.set('result', v)} placeholder="Mọi kết quả" options={toOptions(FINAL_RESULT_LABEL)} />
        {u.any && <div className="flex items-end"><button type="button" className={btnGhost} onClick={u.clear}><FilterX aria-hidden="true" className="size-4" />Xóa bộ lọc</button></div>}
      </div>
      <div className="mt-4">
        <QueryBox query={stats} empty="Không có đề tài nào khớp bộ lọc." isEmpty={(d) => d.rows.length === 0}>
          {(d) => {
            const top = d.rows.reduce((a, r) => (r.count > a.count ? r : a), d.rows[0]);
            return (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Tile label="Tổng số đề tài" value={d.total} icon={FileStack} tone="bg-blue-50 text-blue-700" />
                  <Tile label={`Số nhóm theo ${dim.toLowerCase()}`} value={d.rows.length} icon={Layers} tone="bg-amber-50 text-amber-700" />
                  <Tile label="Nhóm nhiều đề tài nhất" value={top.count} note={`${top.label} · ${pct(top.count, d.total)}`} icon={Trophy} tone="bg-red-50 text-vlu-red" />
                </div>
                <div className={card}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">Phân bố theo {dim.toLowerCase()}</h2>
                    <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Kiểu biểu đồ">
                      {Object.entries(CHARTS).map(([k, [l, Icon]]) => (
                        <button key={k} type="button" aria-pressed={chart === k} onClick={() => setChart(k)}
                          className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${chart === k ? 'bg-card text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                          <Icon aria-hidden="true" className="size-4" />{l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <StatsChart rows={d.rows} type={chart} label={dim} />
                </div>
                <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                  <table className="text-left">
                    <caption className="px-4 pt-4 pb-3 text-left font-semibold sm:px-5">Số đề tài theo {dim.toLowerCase()} (tổng {d.total})</caption>
                    <thead><tr><th scope="col" className="px-4 py-2 sm:px-5">{dim}</th><th scope="col" className="px-4 py-2 text-right">Số đề tài</th><th scope="col" className="px-4 py-2 text-right sm:px-5">Tỉ lệ</th></tr></thead>
                    <tbody>
                      {d.rows.map((r) => (
                        <tr key={String(r.key)}>
                          <td className="break-words px-4 py-2.5 sm:px-5">{r.label}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums sm:px-5">{pct(r.count, d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="bg-slate-50"><th scope="row" className="px-4 py-2.5 text-left sm:px-5">Tổng</th><td className="px-4 py-2.5 text-right font-semibold tabular-nums">{d.total}</td><td className="px-4 py-2.5 text-right sm:px-5">100%</td></tr></tfoot>
                  </table>
                </div>
              </div>
            );
          }}
        </QueryBox>
      </div>
      {isStaff && <StuckTopics key={params.roundId} roundId={params.roundId} />}
    </section>
  );
}
