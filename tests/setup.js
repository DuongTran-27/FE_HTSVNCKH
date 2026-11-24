import { configure } from '@testing-library/react';

// findBy*/waitFor chờ tối đa 3 s (mặc định 1 s): cả bộ chạy song song, trang lazy tải lần đầu có lúc vượt 1 s và test chập chờn
configure({ asyncUtilTimeout: 3000 });
