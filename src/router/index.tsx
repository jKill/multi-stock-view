/**
 * 路由配置
 */

import { Suspense, lazy, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { Dashboard } from '@/pages/Dashboard';
import { Loading } from '@/components/common';

const Heatmap = lazy(() => import('@/pages/Heatmap').then((mod) => ({ default: mod.Heatmap })));
const HotStocks = lazy(() => import('@/pages/HotStocks').then((mod) => ({ default: mod.HotStocks })));
const Watchlist = lazy(() => import('@/pages/Watchlist').then((mod) => ({ default: mod.Watchlist })));
const Settings = lazy(() => import('@/pages/Settings').then((mod) => ({ default: mod.Settings })));
const Rankings = lazy(() => import('@/pages/Rankings').then((mod) => ({ default: mod.Rankings })));
const Boards = lazy(() => import('@/pages/Boards').then((mod) => ({ default: mod.Boards })));
const BoardDetail = lazy(() =>
  import('@/pages/Boards').then((mod) => ({ default: mod.BoardDetail }))
);
const Scanner = lazy(() => import('@/pages/Scanner').then((mod) => ({ default: mod.Scanner })));
const StockDetail = lazy(() =>
  import('@/pages/StockDetail').then((mod) => ({ default: mod.StockDetail }))
);
const EndOfDayPicker = lazy(() =>
  import('@/pages/EndOfDayPicker').then((mod) => ({ default: mod.EndOfDayPicker }))
);

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
        {
          path: 'hot-stocks',
          element: withSuspense(<HotStocks />),
        },
        {
          path: 'watchlist',
          element: withSuspense(<Watchlist />),
        },
        {
          path: 'settings',
          element: withSuspense(<Settings />),
        },
        {
          path: 'rankings',
          element: withSuspense(<Rankings />),
        },
        {
          path: 'boards',
          element: withSuspense(<Boards />),
        },
        {
          path: 'boards/:type/:code',
          element: withSuspense(<BoardDetail />),
        },
        {
          path: 's/:code',
          element: withSuspense(<StockDetail />),
        },
        {
          path: 'scanner',
          element: withSuspense(<Scanner />),
        },
        {
          path: 'eod-picker',
          element: withSuspense(<EndOfDayPicker />),
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL }
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
