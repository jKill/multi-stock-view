import ReactECharts from 'echarts-for-react';

export function LazyEChart(props: React.ComponentProps<typeof ReactECharts>) {
  return <ReactECharts {...props} />;
}
