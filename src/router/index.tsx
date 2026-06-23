/**
 * 路由配置
 */

import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Dashboard } from '@/pages/Dashboard';
import { Loading } from '@/components/common';

const Heatmap = lazy(() => import('@/pages/Heatmap').then((mod) => ({ default: mod.Heatmap })));

function withSuspense(element: ReactNode) {
  return (
    <Suspense fallback={<Loading fullScreen text="加载页面..." />}>
      {element}
    </Suspense>
  );
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        {
          index: true,
          element: <Dashboard />,
        },
        {
          path: 'heatmap',
          element: withSuspense(<Heatmap />),
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL }
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
