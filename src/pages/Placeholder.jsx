// Trang tạm cho màn nghiệp vụ chưa làm (T304–T308); nằm trong layout, đã qua guard vai trò
export function Placeholder({ title }) {
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-slate-700">Màn hình đang được xây dựng.</p>
    </section>
  );
}
