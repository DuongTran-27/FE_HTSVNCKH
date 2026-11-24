import { Link, useParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FINAL_RESULT_LABEL, REPOSITORY_RESULTS } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { qs, searchTerm } from '../../lib/format.js';
import { useCatalog } from '../../lib/queries.js';
import { pickEnum, pickPage, pickYear, useUrlParams } from '../../lib/urlParams.js';
import { DebouncedInput, FilterSelect } from '../../components/ListFilters.jsx';
import { Badge, Pager, QueryBox, btnGhost } from '../../components/ui.jsx';

// R25 – API_GD2 §9.2. Chỉ hiện đúng các trường API trả (không thành viên, GVHD, file)
export function RepositoryPage() {
  const u = useUrlParams();
  const fields = useCatalog('fields');
  const params = {
    academicYear: pickYear(u.get('academicYear')), fieldId: u.get('fieldId'),
    result: pickEnum(u.get('result'), REPOSITORY_RESULTS), q: u.get('q').slice(0, 200), page: pickPage(u.get('page')),
  };
  const query = useQuery({ queryKey: ['repository', params], queryFn: () => api(`/repository${qs({ ...params, q: searchTerm(params.q), pageSize: 20 })}`), placeholderData: keepPreviousData });
  const yearBad = u.get('academicYear') && !params.academicYear;
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Kho đề tài</h1>
      <div className="mt-4 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <DebouncedInput label="Tìm kiếm" value={params.q} onCommit={(v) => u.set('q', v)} placeholder="Mã, tên, từ khóa" />
        <div>
          <DebouncedInput label="Năm học" value={u.get('academicYear')} onCommit={(v) => u.set('academicYear', v)} placeholder="2026-2027" maxLength={9} />
          {yearBad && <p className="mt-1 text-sm text-red-700">Năm học dạng 2026-2027</p>}
        </div>
        <FilterSelect label="Lĩnh vực" value={params.fieldId} onChange={(v) => u.set('fieldId', v)} placeholder="Mọi lĩnh vực"
          options={(fields.data ?? []).map((f) => ({ value: f.id, label: f.name }))} />
        <FilterSelect label="Kết quả" value={params.result} onChange={(v) => u.set('result', v)} placeholder="Mọi kết quả"
          options={REPOSITORY_RESULTS.map((r) => ({ value: r, label: FINAL_RESULT_LABEL[r] }))} />
      </div>
      {u.any && <button type="button" className={`${btnGhost} mt-2`} onClick={u.clear}>Xóa bộ lọc</button>}
      <div className="mt-3">
        <QueryBox query={query} empty={u.any ? 'Không có đề tài nào khớp bộ lọc.' : 'Kho chưa có đề tài nào đã đóng đạt.'} isEmpty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <ul className="space-y-2">
                {d.items.map((t) => (
                  <li key={t.code} className="rounded-xl border bg-card p-4 shadow-sm">
                    <Link to={`/kho/${encodeURIComponent(t.code)}`} className="break-words font-medium text-blue-700 underline-offset-4 hover:underline">{t.code} – {t.title}</Link>
                    <p className="mt-1 break-words text-sm text-slate-800">{t.summaryExcerpt}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                      {t.field?.name} · {t.academicYear} <Badge tone="green">{FINAL_RESULT_LABEL[t.result] ?? t.result}</Badge>
                    </p>
                  </li>
                ))}
              </ul>
              <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => u.set('page', p > 1 ? String(p) : '')} />
            </>
          )}
        </QueryBox>
      </div>
    </section>
  );
}

export function RepositoryDetailPage() {
  const { code } = useParams();
  const query = useQuery({ queryKey: ['repository', 'item', code], queryFn: async () => (await api(`/repository/${encodeURIComponent(code)}`)).topic });
  return (
    <section>
      {query.error?.status === 404 ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>Đề tài không có trong kho</p>
          <Link to="/kho" className={`${btnGhost} mt-2`}>Về kho đề tài</Link>
        </div>
      ) : (
        <QueryBox query={query}>
          {(t) => (
            <div className="space-y-3">
              <Link to="/kho" className="text-blue-700 underline-offset-4 hover:underline">Về kho đề tài</Link>
              <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{t.code} – {t.title}</h1>
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">{t.field?.name} · {t.academicYear} <Badge tone="green">{FINAL_RESULT_LABEL[t.result] ?? t.result}</Badge></p>
              <div><h2 className="font-bold">Tóm tắt</h2><p className="whitespace-pre-wrap break-words">{t.summary}</p></div>
            </div>
          )}
        </QueryBox>
      )}
    </section>
  );
}
