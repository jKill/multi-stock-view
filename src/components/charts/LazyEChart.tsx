import { lazy, Suspense } from 'react';
import { Loading } from '@/components/common';

const ReactECharts = lazy(() => import('echarts-for-react'));

type ReactEChartsProps = React.ComponentProps<typeof ReactECharts>;

export function LazyEChart(props: ReactEChartsProps) {
  return (
    <Suspense fallback={<Loading size="md" />}>
      <ReactECharts {...props} />
    </Suspense>
  );
}
