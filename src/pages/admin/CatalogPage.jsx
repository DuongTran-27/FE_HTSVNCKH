import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { NavLink } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogNameSchema, classCreateSchema, facultyCreateSchema, fieldCreateSchema, majorCreateSchema, synonymCreateSchema } from '@nckh/shared';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { applyServerErrors } from '../../lib/forms.js';
import { useCatalog } from '../../lib/queries.js';
import { toast } from '../../lib/toast.js';
import { FormField, inputClass } from '../../components/FormField.jsx';
import { Badge, ConfirmDialog, Options, QueryBox, btnGhost, btnPrimary, opt } from '../../components/ui.jsx';

const CODE = { name: 'code', label: 'Mã' };
const NAME = { name: 'name', label: 'Tên' };
// UI §4.19 – Lớp không có name nên không có form sửa; từ đồng nghĩa xóa cứng
export const KINDS = {
  khoa: { path: 'faculties', title: 'Khoa', noun: 'khoa', fields: [CODE, NAME], schema: facultyCreateSchema, rename: true },
  nganh: { path: 'majors', title: 'Ngành', noun: 'ngành', parent: { name: 'facultyId', source: 'faculties', label: 'Khoa' }, fields: [CODE, NAME], schema: majorCreateSchema, rename: true },
  lop: { path: 'classes', title: 'Lớp', noun: 'lớp', parent: { name: 'majorId', source: 'majors', label: 'Ngành' }, fields: [CODE], schema: classCreateSchema },
  'linh-vuc': { path: 'fields', title: 'Lĩnh vực', noun: 'lĩnh vực', fields: [CODE, NAME], schema: fieldCreateSchema, rename: true },
  'dong-nghia': { path: 'synonyms', title: 'Từ đồng nghĩa', noun: 'từ đồng nghĩa', fields: [{ name: 'term', label: 'Từ' }, { name: 'canonical', label: 'Từ chuẩn' }], schema: synonymCreateSchema, synonym: true },
};
const TABS = [['khoa', ['ADMIN']], ['nganh', ['ADMIN', 'STAFF']], ['lop', ['ADMIN', 'STAFF']], ['linh-vuc', ['ADMIN', 'STAFF']], ['dong-nghia', ['STAFF']]];

// R22 – API_GD2 §4.1, §4.2
export function CatalogPage({ kind }) {
  const cfg = KINDS[kind];
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // { id, name }
  const [confirm, setConfirm] = useState(null); // { item, kind: 'toggle' | 'delete' }
  const [rowError, setRowError] = useState('');
  const [formError, setFormError] = useState('');

  const filterKey = cfg.parent?.name === 'facultyId' ? 'facultyId' : cfg.parent?.name === 'majorId' ? 'majorId' : null;
  const params = { ...(cfg.synonym ? {} : { includeInactive: showInactive ? 'true' : 'false' }), ...(filterKey && filter ? { [filterKey]: filter } : {}) };
  const list = useCatalog(cfg.path, params, { staleTime: 0 });
  const parents = useCatalog(cfg.parent?.source ?? 'faculties', { includeInactive: 'false' }, { enabled: !!cfg.parent });
  const majorsAll = useCatalog('majors', { includeInactive: 'true' }, { enabled: kind === 'lop' });

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(cfg.schema),
    defaultValues: Object.fromEntries([...(cfg.parent ? [[cfg.parent.name, '']] : []), ...cfg.fields.map((f) => [f.name, ''])]),
  });
  const fieldNames = [...(cfg.parent ? [cfg.parent.name] : []), ...cfg.fields.map((f) => f.name)];
  const done = () => qc.invalidateQueries({ queryKey: ['catalog'] });

  const onCreate = async (values) => {
    setFormError('');
    try {
      await api(`/${cfg.path}`, { method: 'POST', body: values });
      reset();
      done();
      toast(`Đã thêm ${cfg.noun}`, { type: 'success' });
    } catch (err) {
      if (!err.sessionExpired) setFormError(applyServerErrors(err, setError, fieldNames).join(' '));
    }
  };
  const patch = useMutation({
    mutationFn: ({ id, body }) => api(`/${cfg.path}/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { setEditing(null); setConfirm(null); setRowError(''); done(); },
    onError: (err) => !err.sessionExpired && setRowError(err.message),
  });
  const remove = useMutation({
    mutationFn: (id) => api(`/${cfg.path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setConfirm(null); setRowError(''); done(); },
    onError: (err) => !err.sessionExpired && setRowError(err.message),
  });

  const facultyOfMajor = Object.fromEntries((majorsAll.data ?? []).map((m) => [m.id, m.facultyId]));
  const parentName = Object.fromEntries((parents.data ?? []).map((p) => [p.id, p.code ? `${p.code}${p.name ? ` – ${p.name}` : ''}` : p.name]));
  // Gợi ý hiển thị nút; backend kiểm quyền thật (FR25)
  const canWrite = (item) => {
    if (user.role === 'ADMIN' || cfg.synonym || !cfg.parent) return true;
    const faculty = kind === 'nganh' ? item.facultyId : facultyOfMajor[item.majorId];
    return !!faculty && user.staffFacultyIds?.includes(faculty);
  };
  const saveName = (item) => {
    const r = catalogNameSchema.safeParse(editing.name);
    if (!r.success) { setRowError('Tên không được để trống (tối đa 300 ký tự)'); return; }
    patch.mutate({ id: item.id, body: { name: r.data } });
  };
  const message = confirm && (confirm.kind === 'delete'
    ? 'Xóa vĩnh viễn từ đồng nghĩa này?'
    : confirm.item.isActive ? 'Bản ghi cũ vẫn giữ, không chọn được cho bản ghi mới.' : 'Cho phép chọn lại cho bản ghi mới?');

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Danh mục {cfg.noun}</h1>
      <nav aria-label="Loại danh mục" className="flex flex-wrap gap-1">
        {TABS.filter(([, roles]) => roles.includes(user.role)).map(([k]) => (
          <NavLink key={k} to={`/quan-ly/danh-muc/${k}`} className={({ isActive }) => `inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-700/15' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>{KINDS[k].title}</NavLink>
        ))}
      </nav>

      <form onSubmit={handleSubmit(onCreate)} noValidate className="grid max-w-3xl gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 sm:p-5" aria-label={`Thêm ${cfg.noun}`}>
        {cfg.parent && (
          <FormField label={cfg.parent.label} error={errors[cfg.parent.name]?.message}>
            <select {...register(cfg.parent.name)}><Options placeholder={`Chọn ${cfg.parent.label.toLowerCase()}`} options={opt(parents.data ?? [], 'id', (p) => parentName[p.id])} /></select>
          </FormField>
        )}
        {cfg.fields.map((f) => <FormField key={f.name} label={f.label} error={errors[f.name]?.message}><input autoComplete="off" {...register(f.name)} /></FormField>)}
        <div className="sm:col-span-2">
          {formError && <p role="alert" className="mb-2 text-sm text-red-700 break-words">{formError}</p>}
          <button type="submit" disabled={isSubmitting} className={btnPrimary}>{isSubmitting ? 'Đang thêm…' : `Thêm ${cfg.noun}`}</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-4">
        {filterKey && (
          <select aria-label={`Lọc theo ${cfg.parent.label.toLowerCase()}`} className={`${inputClass} !w-auto`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <Options placeholder={`Mọi ${cfg.parent.label.toLowerCase()}`} options={opt(parents.data ?? [], 'id', (p) => parentName[p.id])} />
          </select>
        )}
        {!cfg.synonym && (
          <label className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5 accent-blue-700" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Hiện cả mục ngừng dùng
          </label>
        )}
      </div>
      {rowError && !confirm && <p role="alert" className="text-sm text-red-700 break-words">{rowError}</p>}

      <QueryBox query={list} empty={`Chưa có ${cfg.noun} nào.`} isEmpty={(items) => items.length === 0}>
        {(items) => (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border bg-card shadow-sm">
            {items.map((item) => {
              const inactive = item.isActive === false;
              const isEditing = editing?.id === item.id;
              const write = canWrite(item);
              return (
                <li key={item.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 transition-colors hover:bg-slate-50 ${inactive ? 'text-slate-500' : ''}`}>
                  <div className="min-w-0 flex-1 break-words">
                    {cfg.synonym
                      ? <span>{item.term} → <strong>{item.canonical}</strong></span>
                      : isEditing
                        ? <input aria-label="Tên" className={inputClass} value={editing.name} onChange={(e) => setEditing({ id: item.id, name: e.target.value })} />
                        : <span><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm">{item.code}</span>{item.name ? ` – ${item.name}` : ''}{cfg.parent ? ` (${parentName[item.facultyId ?? item.majorId] ?? ''})` : ''}</span>}
                    {inactive && <> <Badge>Ngừng dùng</Badge></>}
                  </div>
                  {write && (
                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button type="button" className={btnPrimary} disabled={patch.isPending} onClick={() => saveName(item)}>Lưu</button>
                          <button type="button" className={btnGhost} onClick={() => { setEditing(null); setRowError(''); }}>Hủy</button>
                        </>
                      ) : (
                        <>
                          {cfg.rename && <button type="button" className={btnGhost} onClick={() => { setRowError(''); setEditing({ id: item.id, name: item.name }); }}>Sửa</button>}
                          {cfg.synonym
                            ? <button type="button" className={btnGhost} onClick={() => { setRowError(''); setConfirm({ item, kind: 'delete' }); }}>Xóa</button>
                            : <button type="button" className={btnGhost} onClick={() => { setRowError(''); setConfirm({ item, kind: 'toggle' }); }}>{inactive ? 'Dùng lại' : 'Ngừng dùng'}</button>}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </QueryBox>

      {confirm && (
        <ConfirmDialog title={confirm.kind === 'delete' ? 'Xóa từ đồng nghĩa' : confirm.item.isActive ? 'Ngừng dùng' : 'Dùng lại'} message={message}
          danger={confirm.kind === 'delete' || confirm.item.isActive} busy={patch.isPending || remove.isPending} error={rowError}
          onCancel={() => { setConfirm(null); setRowError(''); }}
          onConfirm={() => (confirm.kind === 'delete' ? remove.mutate(confirm.item.id) : patch.mutate({ id: confirm.item.id, body: { isActive: !confirm.item.isActive } }))} />
      )}
    </section>
  );
}
