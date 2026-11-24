// T706 (NFR01, T703c mục 3): Vercel Routing Middleware – proxy /api/* sang Render, gắn header bí mật x-nckh-origin
// để API từ chối request gọi thẳng *.onrender.com. Rewrite thuần trong vercel.json không thêm được header lên upstream.
// Không dùng thư viện: x-middleware-rewrite / x-middleware-override-headers / x-middleware-request-* là đúng giao thức
// mà rewrite() của @vercel/functions tạo ra (shortcut: phụ thuộc giao thức nội bộ Vercel, xác nhận trên preview – VAN_HANH §6).
// Biến môi trường (Vercel > Settings > Environment Variables, KHÔNG đặt tiền tố VITE_): API_ORIGIN, ORIGIN_SECRET.

export const config = { matcher: '/api/:path*' };

export const ORIGIN_HEADER = 'x-nckh-origin';
// Header không chuyển lên upstream: host phải là host của Render (Render định tuyến theo Host); header hop-by-hop.
const DROP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', ORIGIN_HEADER]);

const fail = () =>
  new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Máy chủ chưa được cấu hình' } }), {
    status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default function middleware(request) {
  const { API_ORIGIN: origin, ORIGIN_SECRET: secret } = process.env;
  // Thiếu cấu hình thì đóng: không proxy request thiếu header (API sẽ trả 404, khó chẩn đoán hơn 503 này).
  if (!origin || !/^https:\/\/[^/]+$/.test(origin) || !secret || secret.length < 32) return fail();

  const url = new URL(request.url);
  const destination = `${origin}${url.pathname}${url.search}`;

  const headers = new Headers({ 'x-middleware-rewrite': destination });
  const keep = [];
  for (const [name, value] of request.headers) {
    if (DROP.has(name) || name.startsWith('x-middleware-')) continue; // bỏ cả x-middleware-* do client gửi; client tự gửi x-nckh-origin thì bỏ, chỉ giá trị của middleware được đi tiếp
    headers.set(`x-middleware-request-${name}`, value);
    keep.push(name);
  }
  headers.set(`x-middleware-request-${ORIGIN_HEADER}`, secret);
  keep.push(ORIGIN_HEADER);
  headers.set('x-middleware-override-headers', keep.join(','));
  return new Response(null, { headers });
}
