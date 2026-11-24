# Hệ thống quản lý NCKH sinh viên – Khoa CNTT (Frontend)

React + Vite + React Router + Tailwind + TanStack Query. Chỉ chứa giao diện; mọi dữ liệu lấy qua API REST của repo backend
`BE_HTSVNCKH` (đặc tả, lộ trình, vận hành nằm ở `docs/` của repo đó).

| Thư mục | Nội dung |
|---|---|
| `src/` | Trang, component, gọi API |
| `shared/` | Enum, bảng chuyển trạng thái, schema Zod (workspace `@nckh/shared`) – **bản sao của `shared/` ở repo backend**, không sửa riêng ở đây |
| `tests/` | Unit test (Vitest + jsdom) |
| `e2e/` | Playwright, chạy cùng API thật của repo backend |

## Chạy cục bộ

Cần Node `>=22.22.0` (react-router 8.4). Cài bằng `npm ci` (không dùng `--omit=optional`: vite 8 cần binding rolldown/lightningcss).

```bash
npm ci
npm run dev        # http://localhost:5173, proxy /api → http://localhost:4000 (chạy API ở repo backend: npm run dev)
npm test           # unit test
npm run lint
npm run build      # → dist/
```

## E2E

E2E dựng DB `nckh_t309_test` và chạy API bằng code của repo backend. Mặc định repo backend nằm cạnh repo này
(`../BE_HTSVNCKH`); đặt `NCKH_BACKEND_DIR` nếu ở chỗ khác. Ở repo backend cần `npm ci`, `npx prisma generate`
và DB test đang chạy (`npm run db:test:up`).

```bash
npx playwright install chromium
npm run test:e2e
```

CI: `.github/workflows/ci.yml` chạy lint + format + test + build. Job E2E chỉ chạy khi đặt biến repo `BACKEND_REPOSITORY`
(`<owner>/<repo backend>`); repo backend private thì thêm secret `BACKEND_REPO_TOKEN` (PAT chỉ đọc).

## Deploy (Vercel)

Root Directory = gốc repo này. `vercel.json` đặt build `npm run build`, rewrite SPA và CSP; `middleware.js` chuyển `/api/*`
sang API trên Render (biến `API_ORIGIN`, `ORIGIN_SECRET` – xem `.env.example` và `docs/VAN_HANH.md` §6 ở repo backend).
