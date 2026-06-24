/**
 * 热门股页面 - 成交量 Top10 + K线 + 板块 + 成交额
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Calendar } from 'lucide-react';
import { Loading } from '@/components/common';
import { usePolling } from '@/hooks';
import { useBoardData, useAppSettings } from '@/contexts';
import {
  getAllAShareQuotes,
  getHistoryKline,
  getTodayTimeline,
  getMinuteKline,
} from '@/services/sdk';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  getChangeColorClass,
  normalizeStockCode as normalizeCode,
} from '@/utils/format';
import { LazyEChart } from '@/components/charts/LazyEChart';
import type { FullQuote, HistoryKline, TodayTimeline, IndustryBoard } from 'stock-sdk';
import styles from './HotStocks.module.css';

type KlinePeriod = 'timeline' | '5day' | 'daily' | 'weekly' | 'monthly';

const PERIOD_OPTIONS: { key: KlinePeriod; label: string }[] = [
  { key: 'timeline', label: '分时' },
  { key: '5day', label: '5日' },
  { key: 'daily', label: '日K' },
  { key: 'weekly', label: '周K' },
  { key: 'monthly', label: '月K' },
];

const TOP_K = 10;
const MA_PERIODS = [5, 10, 20];
const MA_COLORS: Record<number, string> = { 5: '#f59e0b', 10: '#3b82f6', 20: '#ec4899' };

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toApiDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function todayStr(): string {
  return formatDateStr(new Date());
}

interface StockSector {
  name: string;
  type: 'industry' | 'concept';
  changePercent: number | null;
}

function computeMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      result.push(sum / period);
    }
  }
  return result;
}

function buildCandlestickOption(
  klineData: HistoryKline[],
  stockName: string,
): unknown {
  if (!klineData.length) return {};

  const dates = klineData.map((d) => d.date);
  const ohlc = klineData.map((d) => [d.open, d.close, d.low, d.high]);
  const volumes = klineData.map((d) => d.volume ?? 0);
  const closes = klineData.map((d) => d.close ?? 0);

  const maSeries: unknown[] = MA_PERIODS.map((p) => {
    const maValues = computeMA(closes, p);
    return {
      name: `MA${p}`,
      type: 'line',
      data: maValues,
      smooth: true,
      lineStyle: { width: 1, color: MA_COLORS[p], opacity: 0.7 },
      itemStyle: { color: MA_COLORS[p] },
      symbol: 'none',
      xAxisIndex: 0,
      yAxisIndex: 0,
    };
  });

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      borderWidth: 0,
      backgroundColor: 'rgba(16,28,49,0.95)',
      textStyle: { color: '#eef5ff', fontSize: 11 },
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
    },
    grid: [
      { left: 8, right: 8, top: 8, height: '62%' },
      { left: 8, right: 8, top: '78%', height: '18%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        gridIndex: 0,
        axisLine: { lineStyle: { color: 'rgba(140,167,205,0.16)' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3', show: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        data: dates,
        gridIndex: 1,
        axisLine: { lineStyle: { color: 'rgba(140,167,205,0.16)' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3' },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        gridIndex: 0,
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3' },
        splitLine: { lineStyle: { color: 'rgba(140,167,205,0.08)' } },
      },
      {
        type: 'value',
        gridIndex: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: stockName,
        type: 'candlestick',
        data: ohlc,
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: {
          color: '#ef4444',
          color0: '#22c55e',
          borderColor: '#ef4444',
          borderColor0: '#22c55e',
        },
      },
      ...maSeries,
      {
        name: '成交量',
        type: 'bar',
        data: volumes,
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: {
          color: 'rgba(99,102,241,0.35)',
        },
      },
    ],
  };
}

function buildTimelineOption(
  timelineData: TodayTimeline[],
  prevClose: number,
  stockName: string,
): unknown {
  if (!timelineData.length) return {};

  const times = timelineData.map((d) => d.time);
  const prices = timelineData.map((d) => d.price);
  const volumes = timelineData.map((d) => d.volume);
  const avgPrices = timelineData.map((d) => d.avgPrice);

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      borderWidth: 0,
      backgroundColor: 'rgba(16,28,49,0.95)',
      textStyle: { color: '#eef5ff', fontSize: 11 },
    },
    grid: [
      { left: 8, right: 8, top: 8, height: '62%' },
      { left: 8, right: 8, top: '78%', height: '18%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: times,
        gridIndex: 0,
        axisLine: { lineStyle: { color: 'rgba(140,167,205,0.16)' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3', show: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        data: times,
        gridIndex: 1,
        axisLine: { lineStyle: { color: 'rgba(140,167,205,0.16)' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3' },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        gridIndex: 0,
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3' },
        splitLine: { lineStyle: { color: 'rgba(140,167,205,0.08)' } },
      },
      {
        type: 'value',
        gridIndex: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 9, color: '#7286a3' },
        splitLine: { show: false },
      },
    ],
    visualMap: {
      show: false,
      seriesIndex: 2,
      dimension: 1,
    },
    series: [
      {
        name: `${stockName} 均价`,
        type: 'line',
        data: avgPrices,
        smooth: false,
        lineStyle: { width: 1, color: '#f59e0b', type: 'dashed' },
        itemStyle: { color: '#f59e0b' },
        symbol: 'none',
        xAxisIndex: 0,
        yAxisIndex: 0,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#7286a3', type: 'dashed' },
          data: [{ yAxis: prevClose, label: { formatter: '昨收', fontSize: 9, color: '#7286a3' } }],
        },
      },
      {
        name: stockName,
        type: 'line',
        data: prices,
        smooth: false,
        lineStyle: { width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(105,178,255,0.15)' },
              { offset: 1, color: 'rgba(105,178,255,0.02)' },
            ],
          },
        },
        itemStyle: { color: '#69b2ff' },
        symbol: 'none',
        xAxisIndex: 0,
        yAxisIndex: 0,
      },
      {
        name: '成交量',
        type: 'bar',
        data: volumes,
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: { color: 'rgba(99,102,241,0.3)' },
      },
    ],
  };
}

interface MinuteKlineItem {
  time: string;
  close: number;
  avgPrice: number;
  volume: number;
}

function minuteToTimeline(items: MinuteKlineItem[]): TodayTimeline[] {
  return items.map((item) => {
    const time = item.time.length > 5 ? item.time.slice(-5) : item.time;
    return {
      time,
      timestamp: 0,
      tz: '',
      price: item.close,
      volume: item.volume,
      avgPrice: item.avgPrice,
    };
  });
}

function findStockSectors(
  stockName: string,
  industryList: IndustryBoard[],
  conceptList: IndustryBoard[],
): StockSector[] {
  const normalize = (s: string) => s.replace(/\s+/g, '').replace(/\*ST/g, 'ST');
  const target = normalize(stockName);
  const sectors: StockSector[] = [];

  const match = (board: IndustryBoard, type: 'industry' | 'concept') => {
    if (!board.leadingStock) return;
    const leader = normalize(board.leadingStock);
    if (leader === target || leader.includes(target) || target.includes(leader)) {
      sectors.push({ name: board.name, type, changePercent: board.changePercent });
    }
  };

  for (const board of industryList) match(board, 'industry');
  for (const board of conceptList) match(board, 'concept');

  sectors.sort((a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity));
  return sectors.slice(0, 3);
}

export function HotStocks() {
  const { getRefreshInterval } = useAppSettings();
  const { industryList, conceptList, loading: boardLoading } = useBoardData();

  const [topStocks, setTopStocks] = useState<FullQuote[]>([]);
  const [klineData, setKlineData] = useState<Record<string, HistoryKline[]>>({});
  const [timelineData, setTimelineData] = useState<Record<string, { data: TodayTimeline[]; prevClose: number }>>({});
  const [sectors, setSectors] = useState<Record<string, StockSector[]>>({});
  const [period, setPeriod] = useState<KlinePeriod>('daily');
  const [date, setDate] = useState<string>(todayStr());
  const [initialLoading, setInitialLoading] = useState(true);
  const [klineLoading, setKlineLoading] = useState(false);

  const periodRef = useRef(period);
  periodRef.current = period;

  const refreshInterval = getRefreshInterval('list');

  const fetchTopStocks = useCallback(async () => {
    try {
      const quotes = await getAllAShareQuotes({ batchSize: 500, concurrency: 4 });
      const sorted = [...quotes]
        .filter((q) => q.amount != null && q.amount > 0)
        .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
        .slice(0, TOP_K);
      setTopStocks(sorted);
      return sorted;
    } catch (error) {
      console.error('fetchTopStocks error:', error);
      return [];
    }
  }, []);

  const fetchKlines = useCallback(async (stocks: FullQuote[]) => {
    if (!stocks.length) return;
    setKlineLoading(true);

    const currentPeriod = periodRef.current;
    const newKlines: Record<string, HistoryKline[]> = {};
    const newTimelines: Record<string, { data: TodayTimeline[]; prevClose: number }> = {};

    try {
      if (currentPeriod === 'timeline') {
        const isToday = date === todayStr();
        if (isToday) {
          const timelineResults = await Promise.allSettled(
            stocks.map(async (stock) => {
              const response = await getTodayTimeline(normalizeCode(stock.code));
              return { code: stock.code, data: response.data, prevClose: response.preClose ?? stock.prevClose };
            })
          );
          for (const result of timelineResults) {
            if (result.status === 'fulfilled') {
              newTimelines[result.value.code] = {
                data: result.value.data,
                prevClose: result.value.prevClose,
              };
            }
          }
        } else {
          const minuteResults = await Promise.allSettled(
            stocks.map(async (stock) => {
              const data = await getMinuteKline(normalizeCode(stock.code), {
                startDate: date,
                endDate: date,
              });
              return { code: stock.code, data, prevClose: stock.prevClose };
            })
          );
          for (const result of minuteResults) {
            if (result.status === 'fulfilled' && result.value.data.length > 0) {
              newTimelines[result.value.code] = {
                data: minuteToTimeline(result.value.data),
                prevClose: result.value.prevClose,
              };
            }
          }
        }
      } else {
        const apiPeriod = currentPeriod === '5day' ? 'daily' : currentPeriod;
        const endDate = toApiDate(date);
        // 逐只获取，避免并发触发 SDK 频率限制
        for (const stock of stocks) {
          try {
            const data = await getHistoryKline(normalizeCode(stock.code), {
              period: apiPeriod,
              adjust: 'qfq',
              endDate,
            });
            const sliced = currentPeriod === '5day' ? data.slice(-5) : data;
            newKlines[stock.code] = sliced;
          } catch (err) {
            console.warn(`Kline fetch failed for ${stock.code}:`, err);
          }
        }
      }

      if (currentPeriod === 'timeline') {
        setTimelineData((prev) => ({ ...prev, ...newTimelines }));
      } else {
        setKlineData((prev) => ({ ...prev, ...newKlines }));
      }
    } catch (error) {
      console.error('fetchKlines error:', error);
    } finally {
      setKlineLoading(false);
    }
  }, [date]);

  const computeSectors = useCallback((stocks: FullQuote[]) => {
    const s: Record<string, StockSector[]> = {};
    for (const stock of stocks) {
      s[stock.code] = findStockSectors(stock.name, industryList, conceptList);
    }
    setSectors(s);
  }, [industryList, conceptList]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const stocks = await fetchTopStocks();
      if (cancelled) return;
      setInitialLoading(false);
      computeSectors(stocks);
      fetchKlines(stocks);
    };
    init();
    return () => { cancelled = true; };
  }, [fetchTopStocks, fetchKlines, computeSectors]);

  useEffect(() => {
    if (!initialLoading && topStocks.length > 0) {
      fetchKlines(topStocks);
    }
  }, [period, date]);

  usePolling(fetchTopStocks, {
    interval: refreshInterval || 0,
    enabled: !initialLoading,
    immediate: false,
  });

  useEffect(() => {
    if (topStocks.length > 0 && (!boardLoading)) {
      computeSectors(topStocks);
    }
  }, [industryList, conceptList, topStocks, boardLoading, computeSectors]);

  const periodChange = (p: KlinePeriod) => {
    setPeriod(p);
  };

  if (initialLoading && boardLoading) {
    return <Loading fullScreen text="加载热门股..." />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.controls}>
        <div className={styles.controlLeft}>
          <TrendingUp size={18} className={styles.controlIcon} />
          <span className={styles.controlTitle}>热门股</span>
          <span className={styles.controlDesc}>成交量 TOP{TOP_K}</span>
        </div>

        <div className={styles.controlCenter}>
          <div className={styles.periodGroup}>
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`${styles.periodBtn} ${period === opt.key ? styles.periodActive : ''}`}
                onClick={() => periodChange(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.controlRight}>
          <Calendar size={14} />
          <input
            type="date"
            className={styles.dateInput}
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {klineLoading && (
        <div className={styles.klineLoading}>
          <Loading size="sm" text="加载K线..." />
        </div>
      )}

      <div className={styles.grid}>
        {topStocks.map((stock, index) => (
          <motion.div
            key={stock.code}
            className={styles.card}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <div className={styles.cardUpper}>
              <div className={styles.stockMain}>
                <span className={styles.rank}>#{index + 1}</span>
                <span className={styles.stockName}>{stock.name}</span>
                <span className={styles.stockCode}>{stock.code}</span>
              </div>
              <div className={styles.stockPrice}>
                <span className={`${styles.price} ${getChangeColorClass(stock.changePercent)}`}>
                  {formatPrice(stock.price)}
                </span>
                <span className={`${styles.change} ${getChangeColorClass(stock.changePercent)}`}>
                  {formatPercent(stock.changePercent)}
                </span>
              </div>
              <div className={styles.stockAmount}>
                成交额 {formatAmount(stock.amount)}
              </div>
              {sectors[stock.code]?.length > 0 && (
                <div className={styles.sectors}>
                  {sectors[stock.code].map((s, si) => (
                    <span
                      key={`${s.name}-${si}`}
                      className={`${styles.sectorTag} ${
                        s.type === 'concept' ? styles.sectorConcept : styles.sectorIndustry
                      }`}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.chartWrap}>
              {period === 'timeline' && timelineData[stock.code]?.data?.length ? (
                <LazyEChart
                  option={buildTimelineOption(
                    timelineData[stock.code]!.data,
                    timelineData[stock.code]!.prevClose,
                    stock.name,
                  )}
                  style={{ height: '100%', width: '100%' }}
                  notMerge
                />
              ) : klineData[stock.code]?.length ? (
                <LazyEChart
                  option={buildCandlestickOption(klineData[stock.code], stock.name)}
                  style={{ height: '100%', width: '100%' }}
                  notMerge
                />
              ) : (
                <div className={styles.noData}>暂无K线数据</div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
