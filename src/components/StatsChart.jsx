import { useTheme } from '../lib/theme.js';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Bảng màu phân loại đã kiểm định (skill dataviz, palette.md), dùng theo thứ tự cố định, không xoay vòng
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
// SVG fill không đọc được biến CSS nên giữ mã màu theo chế độ sáng/tối; cột = navy Văn Lang (tối: navy nhạt)
const INK = {
  light: { accent: '#1f2251', axis: '#64748b', grid: '#e2e8f0', line: '#cbd5e1', cursor: '#f1f5f9', legend: '#334155', slice: '#fff' },
  dark: { accent: '#aab1ee', axis: '#a6abc8', grid: '#2b2f5a', line: '#3a3e6e', cursor: '#1d2046', legend: '#c0c4da', slice: '#15183a' },
};

// Biểu đồ tròn quá 8 lát không phân biệt được: gộp phần đuôi thành "Khác" (bảng bên dưới vẫn đủ từng dòng)
const forPie = (rows) => (rows.length <= COLORS.length ? rows
  : [...rows.slice(0, COLORS.length - 1), { key: '__other', label: 'Khác', count: rows.slice(COLORS.length - 1).reduce((s, r) => s + r.count, 0) }]);

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { label, count } = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-slate-900">{label}</p>
      <p className="text-slate-600">{count} đề tài</p>
    </div>
  );
}

/** Biểu đồ từ đúng `rows` của API (cùng số với bảng và CSV). Bảng bên dưới là bản đọc được bằng trình đọc màn hình */
export function StatsChart({ rows, type, label }) {
  const c = INK[useTheme()];
  const axis = { fontSize: 12, fill: c.axis };
  return (
    <div role="img" aria-label={`Biểu đồ ${label}: ${rows.map((r) => `${r.label} ${r.count}`).join(', ')}`} className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === 'pie' ? (
          <PieChart>
            <Pie data={forPie(rows)} dataKey="count" nameKey="label" innerRadius="55%" outerRadius="85%" startAngle={90} endAngle={-270} stroke={c.slice} strokeWidth={2} paddingAngle={1}>
              {forPie(rows).map((r, i) => <Cell key={String(r.key)} fill={COLORS[i]} />)}
            </Pie>
            <Tooltip content={<Tip />} />
            <Legend itemSorter={null} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: c.legend }}>{v}</span>} />
          </PieChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, left: 0, right: 8 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="label" interval={0} tick={axis} axisLine={{ stroke: c.line }} tickLine={false}
              tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
            <YAxis allowDecimals={false} width={32} tick={axis} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} cursor={{ fill: c.cursor }} />
            <Bar dataKey="count" name="Số đề tài" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
