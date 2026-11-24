import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

// T202 (NFR09): flat config. ESLint 10 tự theo dõi biến dùng trong JSX nên không cần eslint-plugin-react.
export default [
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/', '**/playwright-report/', '**/test-results/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    // Quy ước sẵn có: tham số bắt buộc nhưng không dùng đặt tiền tố "_".
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  // middleware.js chạy ở Vercel (process.env), không phải trình duyệt
  {
    files: ['shared/**', 'eslint.config.js', 'vite.config.js', 'middleware.js'],
    languageOptions: { globals: globals.node },
  },
  prettier, // tắt mọi luật định dạng trùng Prettier – đặt cuối
];
