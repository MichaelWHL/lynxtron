import { useState, useCallback } from '@lynx-js/react';

import HomePage from './../components/HomePage';
import ApiList from './../components/ApiList';
import ApiDetail from './../components/ApiDetail';
import type { ApiItem } from './../components/ApiList';

export const routeConfig = [
  { path: '/',            element: 'HomePage' },
  { path: '/api',         element: 'ApiList' },
  { path: '/api/:name',   element: 'ApiDetail' },
];

export default function AppRouter() {
  const [page, setPage] = useState<string>('/');
  const [selectedApiName, setSelectedApiName] = useState<string>('');

  const navigate = useCallback((path: string) => {
    console.log('[Router] navigate called, path:', path);
    setSelectedApiName(path.startsWith('/api/') ? path.replace('/api/', '') : '');
    setPage(path);
  }, []);

  const goBack = useCallback(() => {
    console.log('[Router] goBack called, current page:', page);
    if (page.startsWith('/api/')) {
      setPage('/api');
    } else if (page === '/api') {
      setPage('/');
    }
  }, [page]);

  console.log('[Router] rendering, current page:', page);

  if (page === '/api') {
    return <ApiList onBack={() => setPage('/')} onNavigate={navigate} />;
  }

  if (page.startsWith('/api/') && selectedApiName) {
    return <ApiDetail apiName={selectedApiName} onBack={goBack} />;
  }

  return <HomePage onStart={() => { console.log('[Router] onStart called'); navigate('/api'); }} />;
}
