/**
 * 热门股页面 - 成交量 Top10 + K线 + 板块 + 成交额
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { Loading } from '@/components/common';
import { usePolling } from '@/hooks';
import { useBoardData, useAppSettings } from '@/contexts';
import {
  getAllAShareQuotes,
  getBoardChanges,
  getConceptConstituents,
  getHistoryKline,
  getSectorFundFlowRank,
  getTodayTimeline,
} from '@/services/sdk';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  getChangeColorClass,
  normalizeStockCode as normalizeCode,
} from '@/utils/format';
import { LazyEChart } from '@/components/charts/LazyEChart';
import type {
  BoardChangeItem,
  FullQuote,
  HistoryKline,
  IndustryBoard,
  IndustryBoardConstituent,
  SectorFundFlowItem,
  TodayTimeline,
} from 'stock-sdk';
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
const CONCEPT_CANDIDATE_LIMIT = 180;
const CONCEPT_FETCH_CONCURRENCY = 6;
const MIN_CONCEPTS_PER_STOCK = 3;

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toApiDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
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

  const DEFAULT_VISIBLE = 60;
  const startPercent = klineData.length > DEFAULT_VISIBLE
    ? ((klineData.length - DEFAULT_VISIBLE) / klineData.length) * 100
    : 0;

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
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: startPercent,
        end: 100,
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        start: startPercent,
        end: 100,
        height: 18,
        bottom: 2,
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

function normalizeText(s: string): string {
  return s.replace(/\s+/g, '').replace(/\*ST/g, 'ST');
}

function stockCodeKey(code: string): string {
  return normalizeCode(code).replace(/^(sh|sz|bj)/i, '');
}

function isSameStockName(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const left = normalizeText(a);
  const right = normalizeText(b);
  return left === right || left.includes(right) || right.includes(left);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function addCandidate(
  map: Map<string, IndustryBoard>,
  boardByName: Map<string, IndustryBoard>,
  board: IndustryBoard | undefined,
) {
  if (!board || map.has(board.code)) return;
  map.set(board.code, board);
  boardByName.set(board.name, board);
}

function pushUniqueBoard(list: IndustryBoard[], seen: Set<string>, board: IndustryBoard | undefined) {
  if (!board || seen.has(board.code)) return;
  seen.add(board.code);
  list.push(board);
}

function buildConceptCandidates(
  stocks: FullQuote[],
  conceptList: IndustryBoard[],
  fundFlowRanks: SectorFundFlowItem[],
  boardChanges: BoardChangeItem[],
): IndustryBoard[] {
  const candidates = new Map<string, IndustryBoard>();
  const boardByName = new Map(conceptList.map((board) => [board.name, board]));
  const boardByCode = new Map(conceptList.map((board) => [board.code, board]));

  for (const stock of stocks) {
    for (const board of conceptList) {
      if (isSameStockName(board.leadingStock, stock.name)) {
        addCandidate(candidates, boardByName, board);
      }
    }
  }

  for (const item of boardChanges) {
    addCandidate(candidates, boardByName, boardByName.get(item.name));
  }

  for (const item of fundFlowRanks) {
    addCandidate(candidates, boardByName, boardByCode.get(item.code) ?? boardByName.get(item.name));
  }

  const strongest = [...conceptList]
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, CONCEPT_CANDIDATE_LIMIT);
  for (const board of strongest) {
    addCandidate(candidates, boardByName, board);
  }

  return [...candidates.values()].slice(0, CONCEPT_CANDIDATE_LIMIT);
}

function buildConceptScanOrder(
  conceptList: IndustryBoard[],
  candidates: IndustryBoard[],
): IndustryBoard[] {
  const ordered: IndustryBoard[] = [];
  const seen = new Set<string>();

  for (const board of candidates) {
    pushUniqueBoard(ordered, seen, board);
  }

  const remainder = conceptList
    .filter((board) => !seen.has(board.code))
    .sort((a, b) => {
      const aMove = Math.abs(a.changePercent ?? 0);
      const bMove = Math.abs(b.changePercent ?? 0);
      if (bMove !== aMove) return bMove - aMove;
      return (b.turnoverRate ?? 0) - (a.turnoverRate ?? 0);
    });

  for (const board of remainder) {
    pushUniqueBoard(ordered, seen, board);
  }

  return ordered;
}

function scoreConceptForStock(
  stock: FullQuote,
  board: IndustryBoard,
  constituent: IndustryBoardConstituent,
  fundFlow: SectorFundFlowItem | undefined,
  boardChange: BoardChangeItem | undefined,
): number {
  const stockChg = stock.changePercent ?? 0;
  const boardChg = boardChange?.changePercent ?? fundFlow?.changePercent ?? board.changePercent ?? 0;
  const constituentChg = constituent.changePercent ?? stockChg;
  const sameDirection = Math.sign(stockChg) === Math.sign(boardChg) || Math.abs(stockChg) < 0.1 || Math.abs(boardChg) < 0.1;
  const stockMag = Math.max(Math.abs(stockChg), 0.1);
  const boardMag = Math.max(Math.abs(boardChg), 0.1);
  const chgSimilarity = Math.min(stockMag / boardMag, boardMag / stockMag);

  let score = 20 + Math.abs(boardChg) * 3 + Math.abs(constituentChg) * 1.5;
  score += sameDirection ? 35 + chgSimilarity * 20 : -25;

  if (isSameStockName(board.leadingStock, stock.name)) score += 60;
  if (isSameStockName(fundFlow?.topStockName, stock.name) || stockCodeKey(fundFlow?.topStockCode ?? '') === stockCodeKey(stock.code)) {
    score += 50;
  }
  if (isSameStockName(boardChange?.topStockName, stock.name) || stockCodeKey(boardChange?.topStockCode ?? '') === stockCodeKey(stock.code)) {
    score += 45;
  }

  const netInflow = fundFlow?.mainNetInflow ?? boardChange?.mainNetInflow ?? 0;
  if (netInflow !== 0) {
    const flowBoost = Math.log10(Math.abs(netInflow) + 10_000) - 4;
    score += Math.sign(stockChg || boardChg || netInflow) === Math.sign(netInflow) ? flowBoost * 4 : -flowBoost * 2;
  }

  if (boardChange?.totalChangeCount) score += Math.min(boardChange.totalChangeCount, 20);
  if (boardChange?.topStockDirection?.includes(stockChg >= 0 ? '买入' : '卖出')) score += 12;

  return score;
}

async function findStockSectors(
  stocks: FullQuote[],
  conceptList: IndustryBoard[],
  onPartial?: (sectors: Record<string, StockSector[]>) => void,
): Promise<Record<string, StockSector[]>> {
  if (!stocks.length || !conceptList.length) return {};

  const [fundFlowResult, boardChangeResult] = await Promise.allSettled([
    getSectorFundFlowRank({ indicator: 'today', sectorType: 'concept' }),
    getBoardChanges(),
  ]);

  const fundFlowRanks = fundFlowResult.status === 'fulfilled' ? fundFlowResult.value : [];
  const boardChanges = boardChangeResult.status === 'fulfilled' ? boardChangeResult.value : [];
  const candidates = buildConceptCandidates(stocks, conceptList, fundFlowRanks, boardChanges);
  const scanOrder = buildConceptScanOrder(conceptList, candidates);
  const fallbackBoards = scanOrder.slice(candidates.length);
  const stockByCode = new Map(stocks.map((stock) => [stockCodeKey(stock.code), stock]));
  const fundFlowByCode = new Map(fundFlowRanks.map((item) => [item.code, item]));
  const fundFlowByName = new Map(fundFlowRanks.map((item) => [item.name, item]));
  const boardChangeByName = new Map(boardChanges.map((item) => [item.name, item]));
  const scored: Record<string, (StockSector & { _score: number })[]> = {};
  const pendingStockCodes = new Set(stocks.map((stock) => stock.code));

  for (const stock of stocks) {
    scored[stock.code] = [];
  }

  const toResult = (): Record<string, StockSector[]> => {
    const result: Record<string, StockSector[]> = {};
    for (const stock of stocks) {
      result[stock.code] = (scored[stock.code] ?? [])
        .sort((a, b) => b._score - a._score)
        .slice(0, 3)
        .map((sector) => ({
          name: sector.name,
          type: sector.type,
          changePercent: sector.changePercent,
        }));
    }
    return result;
  };

  let lastPartialAt = 0;
  const emitPartial = () => {
    if (!onPartial) return;
    const now = Date.now();
    if (now - lastPartialAt < 600) return;
    lastPartialAt = now;
    onPartial(toResult());
  };

  const scanBoards = async (boards: IndustryBoard[], stopWhenFilled: boolean) => {
    await mapLimit(boards, CONCEPT_FETCH_CONCURRENCY, async (board) => {
      if (stopWhenFilled && pendingStockCodes.size === 0) return;

      try {
        const constituents = await getConceptConstituents(board.code);
        const fundFlow = fundFlowByCode.get(board.code) ?? fundFlowByName.get(board.name);
        const boardChange = boardChangeByName.get(board.name);

        for (const item of constituents) {
          const stock = stockByCode.get(stockCodeKey(item.code));
          if (!stock) continue;

          scored[stock.code].push({
            name: board.name,
            type: 'concept',
            changePercent: boardChange?.changePercent ?? fundFlow?.changePercent ?? board.changePercent,
            _score: scoreConceptForStock(stock, board, item, fundFlow, boardChange),
          });

          if (scored[stock.code].length >= MIN_CONCEPTS_PER_STOCK) {
            pendingStockCodes.delete(stock.code);
          }

          emitPartial();
        }
      } catch (err) {
        console.warn(`Concept constituents fetch failed for ${board.code}:`, err);
      }
    });
  };

  await scanBoards(candidates, false);
  onPartial?.(toResult());

  for (const stock of stocks) {
    if (scored[stock.code].length >= MIN_CONCEPTS_PER_STOCK) {
      pendingStockCodes.delete(stock.code);
    }
  }

  if (pendingStockCodes.size > 0) {
    await scanBoards(fallbackBoards, true);
  }

  return toResult();
}

export function HotStocks() {
  const { getRefreshInterval } = useAppSettings();
  const { conceptList, loading: boardLoading } = useBoardData();

  const [topStocks, setTopStocks] = useState<FullQuote[]>([]);
  const [klineData, setKlineData] = useState<Record<string, HistoryKline[]>>({});
  const [timelineData, setTimelineData] = useState<Record<string, { data: TodayTimeline[]; prevClose: number }>>({});
  const [sectors, setSectors] = useState<Record<string, StockSector[]>>({});
  const [period, setPeriod] = useState<KlinePeriod>('daily');
  const [initialLoading, setInitialLoading] = useState(true);
  const [klineLoading, setKlineLoading] = useState(false);
  const [sectorLoading, setSectorLoading] = useState(false);

  const periodRef = useRef(period);
  periodRef.current = period;
  const sectorRequestRef = useRef(0);

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

    const now = new Date();
    const endDate = toApiDate(formatDateStr(now));

    try {
      if (currentPeriod === 'timeline') {
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
        const apiPeriod = currentPeriod === '5day' ? 'daily' : currentPeriod;
        const daysBack = apiPeriod === 'monthly'
          ? 3650
          : apiPeriod === 'weekly'
            ? 2555
            : currentPeriod === '5day'
              ? 30
              : 730;
        const startDate = toApiDate(formatDateStr(new Date(now.getTime() - daysBack * 86400000)));
        for (const stock of stocks) {
          try {
            const data = await getHistoryKline(normalizeCode(stock.code), {
              period: apiPeriod,
              adjust: 'qfq',
              startDate,
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
  }, []);

  const computeSectors = useCallback(async (stocks: FullQuote[]) => {
    const requestId = sectorRequestRef.current + 1;
    sectorRequestRef.current = requestId;

    if (!stocks.length) {
      setSectors({});
      setSectorLoading(false);
      return;
    }

    if (!conceptList.length) {
      setSectorLoading(false);
      return;
    }

    setSectorLoading(true);

    try {
      const applySectors = (nextSectors: Record<string, StockSector[]>) => {
        if (sectorRequestRef.current === requestId) {
          setSectors(nextSectors);
        }
      };
      const nextSectors = await findStockSectors(stocks, conceptList, applySectors);
      if (sectorRequestRef.current === requestId) {
        setSectors(nextSectors);
      }
    } catch (error) {
      console.error('computeSectors error:', error);
    } finally {
      if (sectorRequestRef.current === requestId) {
        setSectorLoading(false);
      }
    }
  }, [conceptList]);

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
  }, [period, initialLoading, topStocks, fetchKlines]);

  usePolling(fetchTopStocks, {
    interval: refreshInterval || 0,
    enabled: !initialLoading,
    immediate: false,
  });

  useEffect(() => {
    if (topStocks.length > 0 && (!boardLoading)) {
      computeSectors(topStocks);
    }
  }, [conceptList, topStocks, boardLoading, computeSectors]);

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
              <div className={styles.cardInfoRow}>
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
              </div>
              {(sectors[stock.code]?.length > 0 || sectorLoading) && (
                <div className={styles.sectors}>
                  {sectors[stock.code]?.length > 0 ? (
                    sectors[stock.code].map((s, si) => (
                      <span
                        key={`${s.name}-${si}`}
                        className={`${styles.sectorTag} ${
                          s.type === 'concept' ? styles.sectorConcept : styles.sectorIndustry
                        }`}
                      >
                        {s.name}
                      </span>
                    ))
                  ) : (
                    <span className={`${styles.sectorTag} ${styles.sectorLoading}`}>
                      题材匹配中
                    </span>
                  )}
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
