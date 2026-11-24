import { z } from 'zod';

// CSP script-src 'self' (vercel.json): bỏ phép thử `new Function` của Zod, nếu không trình duyệt báo vi phạm CSP ở Console
z.config({ jitless: true });
