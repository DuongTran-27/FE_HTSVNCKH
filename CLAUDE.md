# CLAUDE.md – Bộ nhớ dự án NCKH Khoa CNTT

Đọc file này đầu mỗi phiên. Mọi agent (kể cả phiên chính) phải tuân thủ.

## Dự án
Website quản lý NCKH sinh viên Khoa CNTT. Repo này là **frontend**. Tài liệu chung (đặc tả `docs/DAC_TA.md`, lộ trình `docs/LO_TRINH.md`, quy trình agent) nằm ở repo backend `../BE_HTSVNCKH/docs/`.
Mục tiêu M1–M5, FR01–FR27, NFR01–NFR10 trong đặc tả là **nguồn sự thật**. Code mâu thuẫn đặc tả = lỗi.

## Công nghệ (không tự ý đổi)
JavaScript ES modules + JSX (không TypeScript) · React + Vite + React Router · Tailwind · React Hook Form + Zod · TanStack Query ·
Node.js LTS + Express 5 REST · PostgreSQL (Supabase) · Prisma (JS) + Prisma Migrate, SQL thô cho index/trigger · JWT + refresh token + Argon2id ·
Cloudinary · pg_trgm + TF-IDF JS · Recharts + CSV · Vitest, Supertest, Playwright · OpenAPI/Swagger · Vercel + Render.
Muốn đổi/thêm thư viện → ghi đề xuất vào báo cáo task, chờ agent `kien-truc-su` duyệt.

## Cấu trúc
Frontend tách khỏi monorepo 2026-11-24; backend (API + DB) ở repo `../BE_HTSVNCKH`. Frontend chỉ gọi API, không truy cập DB.
`src/` · `tests/` · `e2e/` · `shared/` (workspace `@nckh/shared`, bản sao của `shared/` ở backend).
Bảng chuyển trạng thái định nghĩa ở `shared/src/transitions.js` của **backend**; ở đây chỉ là bản chép y hệt – sửa ở backend rồi chép sang.

## Lệnh
- `npm test` – unit test
- `npm run lint`
- `npm run build`
- `npm run test:e2e` – Playwright; cần repo backend cạnh bên (hoặc `NCKH_BACKEND_DIR`) và DB test của backend đang chạy

## Quy tắc bắt buộc
1. Không sửa/xóa/skip test để cho qua. Test sai đặc tả → ghi rõ lý do trong báo cáo và để reviewer quyết.
2. Không đánh dấu xong nếu chưa có **bằng chứng chạy lệnh** (lệnh + kết quả) trong báo cáo.
3. Kiểm tra quyền luôn ở backend (FR25). Admin không có quyền nghiệp vụ.
4. Mọi thao tác nhiều bước chạy trong transaction; mọi chuyển trạng thái ghi `StatusHistory`.
5. Lỗi kiểm tra tương tự không bao giờ được coi là "không trùng".
6. Được đọc/sửa `.env`, dùng khóa bí mật, deploy (Vercel, Render, Supabase), tạo/cấu hình repo và dịch vụ ngoài khi cần (xem mục Ủy quyền 2026-11-24). Riêng `.env` và khóa bí mật **không commit** vào git, không ghi vào code, tài liệu hay log.
7. Văn bản giao diện, thông báo lỗi: tiếng Việt. Tên biến, hàm: tiếng Anh.
8. Thời gian lưu `timestamptz`, hiển thị `Asia/Ho_Chi_Minh`; hạn tính theo giờ server.

## Phối hợp agent
Quy trình, bảng việc, báo cáo, review: thư mục `docs/agents/` ở repo backend.

## Ủy quyền của chủ dự án (2026-11-08, theo yêu cầu trực tiếp của người dùng)
- Mọi agent (kể cả vai kiểm thử, reviewer, devops) được sửa **bất kỳ file nào trong repo** để hoàn thành dự án: code sản phẩm, test, CI (`.github/workflows`), cấu hình, tài liệu. Các giới hạn thư mục ghi trong định nghĩa từng vai trò không còn áp dụng.
- Được tự chạy mọi lệnh cần thiết (test, lint, build, docker test DB, git commit trên nhánh làm việc) và tự giao/gộp việc, làm liên tục đến hết dự án mà không dừng hỏi.
- Vẫn giữ: quy tắc 1 (không skip/xóa test để cho qua), 2 (có bằng chứng chạy lệnh), 3, 4, 5. Mỗi thay đổi code sản phẩm phải có test và ghi vào báo cáo task.
- **2026-11-24, người dùng nói riêng: bỏ giới hạn quy tắc 6.** Agent được thao tác tất cả: đọc/ghi `.env`, dùng khóa bí mật, chạy migrate trên DB thật, deploy, tạo repo GitHub, push, cấu hình Vercel/Render/Supabase, không cần dừng hỏi. Chỉ giữ: không commit `.env`/khóa bí mật vào git.
