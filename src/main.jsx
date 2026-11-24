import './lib/zodConfig.js';
import './lib/theme.js'; // đặt lớp dark trước khi vẽ
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import './index.css';
import { useAuth } from './lib/auth.js';
import { bootstrapSession, configureSession, startCrossTabSync } from './lib/api.js';
import { queryClient } from './lib/queryClient.js';
import { router } from './router.jsx';
import { ToastViewport } from './components/Toast.jsx';
import { FullPageLoading, FullPageOffline } from './components/FullPageLoading.jsx';

configureSession({
  onExpired: () => {
    const { pathname, search } = router.state.location;
    const next = pathname === '/dang-nhap' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    router.navigate(`/dang-nhap${next}`, { replace: true });
  },
  onLogout: () => router.navigate('/dang-nhap', { replace: true }),
});

startCrossTabSync();

// Gọi ngoài effect, có chốt cấp module: StrictMode không sinh refresh thứ hai
bootstrapSession();

function App() {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageLoading />;
  if (status === 'offline') return <FullPageOffline onRetry={() => bootstrapSession({ retry: true })} />;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ToastViewport />
    </QueryClientProvider>
  </StrictMode>,
);
