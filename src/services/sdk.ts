/**
 * Stock SDK 服务层
 * 封装 SDK 调用，提供缓存与错误处理
 */

import { StockSDK, jsonpRequest } from 'stock-sdk';
import type { CacheItem } from '@/types';
import type { DividendDetail, IndustryBoard, IndustryBoardConstituent, SearchResult as SDKSearchResult } from 'stock-sdk';
import { normalizeStockCode } from '@/utils/format';

export type SearchEntityType = 'stock' | 'industry' | 'concept' | 'unsupported';

export interface AppSearchResult extends SDKSearchResult {
  entityType: SearchEntityType;
  isSupported: boolean;
  route: string | null;
}

// SDK 单例
export const sdk = new StockSDK({
  timeout: 30000,
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  rateLimit: {
    requestsPerSecond: 4,
    maxBurst: 8,
  },
  circuitBreaker: {
    failureThreshold: 8,
    resetTimeout: 30000,
    halfOpenRequests: 1,
  },
});

// 内存缓存
const cache = new Map<string, CacheItem<unknown>>();

// 默认 TTL 配置（毫秒）
// 优化：增加缓存时间以减少 API 请求频率
const DEFAULT_TTL = {
  boardList: 60000, // 板块列表 60s（从 30s 增加）
  constituents: 180000, // 成分股 3min（从 2min 增加）
  historyKline: 600000, // 历史 K 线 10min
  indicatorKline: 600000, // 指标 K 线 10min
  quotes: 5000, // 实时行情 5s（从 3s 增加）
  fundFlow: 30000, // 资金流 30s（从 10s 增加）
  timeline: 5000, // 分时 5s（从 3s 增加）
  dividends: 21600000, // 分红数据 6h
  capitalHistory: 30000, // 资金流历史 30s
  northbound: 30000, // 北向资金 30s
  stockChanges: 15000, // 异动池 15s
  boardChanges: 30000, // 板块异动 30s
  dragonTiger: 3600000, // 龙虎榜 1h
  blockTrade: 3600000, // 大宗交易 1h
  margin: 21600000, // 融资融券 6h
};

function normalizeSearchResult(item: SDKSearchResult): AppSearchResult {
  const normalizedCode = normalizeStockCode(item.code);
  const normalizedType = item.type.trim();

  if (normalizedType === '行业板块') {
    return {
      ...item,
      entityType: 'industry',
      isSupported: true,
      route: `/boards/industry/${item.code}`,
    };
  }

  if (normalizedType === '概念板块') {
    return {
      ...item,
      entityType: 'concept',
      isSupported: true,
      route: `/boards/concept/${item.code}`,
    };
  }

  if (
    ['sh', 'sz', 'bj'].includes(item.market.toLowerCase()) &&
    /^(sh|sz|bj)\d{6}$/i.test(normalizedCode)
  ) {
    return {
      ...item,
      code: normalizedCode,
      entityType: 'stock',
      isSupported: true,
      route: `/s/${normalizedCode}`,
    };
  }

  return {
    ...item,
    entityType: 'unsupported',
    isSupported: false,
    route: null,
  };
}

/**
 * 生成缓存键
 */
function getCacheKey(method: string, ...args: unknown[]): string {
  return `${method}:${JSON.stringify(args)}`;
}

/**
 * 从缓存获取数据
 */
function getFromCache<T>(key: string): T | null {
  const item = cache.get(key) as CacheItem<T> | undefined;
  if (!item) return null;

  const now = Date.now();
  if (now - item.timestamp > item.ttl) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

/**
 * 设置缓存
 */
function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * 带缓存的 SDK 调用包装器
 */
async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = getFromCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const data = await fetcher();
  setCache(key, data, ttl);
  return data;
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * 清除指定前缀的缓存
 */
export function clearCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

// ========== 实时行情 API ==========

/**
 * 获取完整行情（A股/指数）
 */
export async function getFullQuotes(codes: string[], useCache = true) {
  const key = getCacheKey('getFullQuotes', codes);
  if (useCache) {
    return withCache(key, DEFAULT_TTL.quotes, () => sdk.getFullQuotes(codes));
  }
  return sdk.getFullQuotes(codes);
}

/**
 * 批量获取行情
 */
export async function getAllQuotesByCodes(
  codes: string[],
  options?: {
    batchSize?: number;
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  }
) {
  return sdk.getAllQuotesByCodes(codes, options);
}

/**
 * 获取全部 A 股行情
 */
export async function getAllAShareQuotes(options?: {
  batchSize?: number;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}) {
  return sdk.getAllAShareQuotes(options);
}

// ========== K 线数据 API ==========

/**
 * 获取历史 K 线
 */
export async function getHistoryKline(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getHistoryKline', symbol, options);
  return withCache(key, DEFAULT_TTL.historyKline, () =>
    sdk.getHistoryKline(symbol, options)
  );
}

/**
 * 获取带指标的 K 线
 */
export async function getKlineWithIndicators(
  symbol: string,
  options?: {
    market?: 'A' | 'HK' | 'US';
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
    indicators?: {
      ma?: { periods?: number[] } | boolean;
      macd?: { short?: number; long?: number; signal?: number } | boolean;
      boll?: { period?: number; stdDev?: number } | boolean;
      kdj?: { period?: number; kPeriod?: number; dPeriod?: number } | boolean;
      rsi?: { periods?: number[] } | boolean;
      wr?: { periods?: number[] } | boolean;
      bias?: { periods?: number[] } | boolean;
      cci?: { period?: number } | boolean;
      atr?: { period?: number } | boolean;
    };
  }
) {
  const key = getCacheKey('getKlineWithIndicators', symbol, options);
  return withCache(key, DEFAULT_TTL.indicatorKline, () =>
    sdk.getKlineWithIndicators(symbol, options)
  );
}

/**
 * 获取分钟 K 线
 */
export async function getMinuteKline(
  symbol: string,
  options?: {
    period?: '1' | '5' | '15' | '30' | '60';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  return sdk.getMinuteKline(symbol, options);
}

/**
 * 获取当日分时
 */
export async function getTodayTimeline(code: string) {
  return sdk.getTodayTimeline(code);
}

// ========== 板块 API ==========

// 板块列表 API：开发环境通过 Vite 代理转发，生产环境直接访问
const BOARD_LIST_BASE = import.meta.env.DEV
  ? '/api/board/qt/clist/get'
  : 'https://push2.eastmoney.com/api/qt/clist/get';

function parseBoardNum(val: unknown): number | null {
  if (val === '-' || val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

async function fetchBoardListJson(params: URLSearchParams): Promise<IndustryBoard[]> {
  const url = `${BOARD_LIST_BASE}?${params.toString()}`;

  if (import.meta.env.DEV) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Board list API returned ${response.status}`);
    }
    const json = await response.json();
    const data = json?.data;
    if (!data || !Array.isArray(data.diff)) return [];
    return parseBoardDiff(data.diff);
  }

  const json = await jsonpRequest<{ rc: number; data: { total: number; diff: Record<string, unknown>[] } }>(
    url,
    { callbackParam: 'cb', timeout: 15000 },
  );
  const data = json?.data;
  if (!data || !Array.isArray(data.diff)) return [];
  return parseBoardDiff(data.diff);
}

function parseBoardDiff(diff: Record<string, unknown>[]): IndustryBoard[] {
  const boards: IndustryBoard[] = diff.map((item, idx) => ({
    rank: idx + 1,
    name: String(item.f14 ?? ''),
    code: String(item.f12 ?? ''),
    price: parseBoardNum(item.f2),
    change: parseBoardNum(item.f4),
    changePercent: parseBoardNum(item.f3),
    totalMarketCap: parseBoardNum(item.f20),
    turnoverRate: parseBoardNum(item.f8),
    riseCount: parseBoardNum(item.f104),
    fallCount: parseBoardNum(item.f105),
    leadingStock: item.f128 ? String(item.f128) : null,
    leadingStockChangePercent: parseBoardNum(item.f136),
  }));
  boards.sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  boards.forEach((b, i) => { b.rank = i + 1; });
  return boards;
}

async function fetchBoardList(fsFilter: string, fid: string, fields: string): Promise<IndustryBoard[]> {
  const pageSize = 2000;
  const params = new URLSearchParams({
    po: '1',
    np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2',
    invt: '2',
    fid,
    fs: fsFilter,
    pz: String(pageSize),
    fields,
  });

  return fetchBoardListJson(params);
}

/**
 * 获取行业板块列表
 */
export async function getIndustryList() {
  const key = getCacheKey('getIndustryList');
  return withCache(key, DEFAULT_TTL.boardList, () =>
    fetchBoardList(
      'm:90 t:2 f:!50',
      'f3',
      'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f26,f22,f33,f11,f62,f128,f136,f115,f152,f124,f107,f104,f105,f140,f141,f207,f208,f209,f222',
    ),
  );
}

/**
 * 获取概念板块列表
 */
export async function getConceptList() {
  const key = getCacheKey('getConceptList');
  return withCache(key, DEFAULT_TTL.boardList, () =>
    fetchBoardList(
      'm:90 t:3 f:!50',
      'f12',
      'f2,f3,f4,f8,f12,f14,f15,f16,f17,f18,f20,f21,f24,f25,f22,f33,f11,f62,f128,f124,f107,f104,f105,f136',
    ),
  );
}

/**
 * 获取板块成分股（行业/概念通用）
 * 开发环境通过 Vite 代理转发，与 getConceptList 保持一致的网络通路
 *
 * 返回结构兼容 stock-sdk 的 IndustryBoardConstituent / ConceptBoardConstituent 类型
 */
async function fetchBoardConstituents(symbol: string): Promise<IndustryBoardConstituent[]> {
  const pageSize = 800;
  const fields = 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f11,f62,f115,f128,f136,f152,f45';
  const params = new URLSearchParams({
    po: '1',
    np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2',
    invt: '2',
    fid: 'f3',
    fs: `b:${symbol} f:!50`,
    pz: String(pageSize),
    fields,
  });

  const url = `${BOARD_LIST_BASE}?${params.toString()}`;

  const parseItem = (item: Record<string, unknown>, idx: number): IndustryBoardConstituent => ({
    rank: idx + 1,
    code: String(item.f12 ?? ''),
    name: String(item.f14 ?? ''),
    price: parseBoardNum(item.f2),
    changePercent: parseBoardNum(item.f3),
    change: parseBoardNum(item.f4),
    volume: parseBoardNum(item.f5),
    amount: parseBoardNum(item.f6),
    amplitude: parseBoardNum(item.f7),
    high: parseBoardNum(item.f15),
    low: parseBoardNum(item.f16),
    open: parseBoardNum(item.f17),
    prevClose: parseBoardNum(item.f18),
    turnoverRate: parseBoardNum(item.f8),
    pe: parseBoardNum(item.f9),
    pb: parseBoardNum(item.f23),
  });

  if (import.meta.env.DEV) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Board constituent API returned ${response.status}`);
    }
    const json = await response.json();
    const data = json?.data;
    if (!data || !Array.isArray(data.diff)) return [];
    return data.diff.map((item: Record<string, unknown>, idx: number) => parseItem(item, idx));
  }

  const json = await jsonpRequest<{ rc: number; data: { total: number; diff: Record<string, unknown>[] } }>(
    url,
    { callbackParam: 'cb', timeout: 15000 },
  );
  const data = json?.data;
  if (!data || !Array.isArray(data.diff)) return [];
  return data.diff.map((item: Record<string, unknown>, idx: number) => parseItem(item, idx));
}

/**
 * 获取行业成分股
 */
export async function getIndustryConstituents(symbol: string) {
  const key = getCacheKey('getIndustryConstituents', symbol);
  return withCache(key, DEFAULT_TTL.constituents, () =>
    fetchBoardConstituents(symbol)
  );
}

/**
 * 获取概念成分股
 */
export async function getConceptConstituents(symbol: string) {
  const key = getCacheKey('getConceptConstituents', symbol);
  return withCache(key, DEFAULT_TTL.constituents, () =>
    fetchBoardConstituents(symbol)
  );
}

/**
 * 获取行业 K 线
 */
export async function getIndustryKline(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getIndustryKline', symbol, options);
  return withCache(key, DEFAULT_TTL.historyKline, () =>
    sdk.getIndustryKline(symbol, options)
  );
}

/**
 * 获取概念 K 线
 */
export async function getConceptKline(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getConceptKline', symbol, options);
  return withCache(key, DEFAULT_TTL.historyKline, () =>
    sdk.getConceptKline(symbol, options)
  );
}

/**
 * 获取行业分钟 K 线
 */
export async function getIndustryMinuteKline(
  symbol: string,
  options?: { period?: '1' | '5' | '15' | '30' | '60' }
) {
  return sdk.getIndustryMinuteKline(symbol, options);
}

/**
 * 获取概念分钟 K 线
 */
export async function getConceptMinuteKline(
  symbol: string,
  options?: { period?: '1' | '5' | '15' | '30' | '60' }
) {
  return sdk.getConceptMinuteKline(symbol, options);
}

/**
 * 获取行业 Spot 指标
 */
export async function getIndustrySpot(symbol: string) {
  return sdk.getIndustrySpot(symbol);
}

/**
 * 获取概念 Spot 指标
 */
export async function getConceptSpot(symbol: string) {
  return sdk.getConceptSpot(symbol);
}

// ========== 资金与大单 API ==========

/**
 * 获取资金流向
 */
export async function getFundFlow(codes: string[]) {
  const key = getCacheKey('getFundFlow', codes);
  return withCache(key, DEFAULT_TTL.fundFlow, () => sdk.getFundFlow(codes));
}

/**
 * 获取盘口大单
 */
export async function getPanelLargeOrder(codes: string[]) {
  const key = getCacheKey('getPanelLargeOrder', codes);
  return withCache(key, DEFAULT_TTL.fundFlow, () =>
    sdk.getPanelLargeOrder(codes)
  );
}

/**
 * 获取个股历史资金流
 */
export async function getIndividualFundFlow(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
  }
) {
  const key = getCacheKey('getIndividualFundFlow', symbol, options);
  return withCache(key, DEFAULT_TTL.capitalHistory, () =>
    sdk.getIndividualFundFlow(symbol, options)
  );
}

/**
 * 获取大盘资金流
 */
export async function getMarketFundFlow() {
  const key = getCacheKey('getMarketFundFlow');
  return withCache(key, DEFAULT_TTL.capitalHistory, () => sdk.getMarketFundFlow());
}

/**
 * 获取个股资金流排行
 */
export async function getFundFlowRank(options?: {
  indicator?: 'today' | '3day' | '5day' | '10day';
}) {
  const key = getCacheKey('getFundFlowRank', options);
  return withCache(key, DEFAULT_TTL.fundFlow, () => sdk.getFundFlowRank(options));
}

/**
 * 获取板块资金流排行
 */
export async function getSectorFundFlowRank(options?: {
  indicator?: 'today' | '3day' | '5day' | '10day';
  sectorType?: 'industry' | 'concept' | 'region';
}) {
  const key = getCacheKey('getSectorFundFlowRank', options);
  return withCache(key, DEFAULT_TTL.fundFlow, () =>
    sdk.getSectorFundFlowRank(options)
  );
}

/**
 * 获取单个板块历史资金流
 */
export async function getSectorFundFlowHistory(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
  }
) {
  const key = getCacheKey('getSectorFundFlowHistory', symbol, options);
  return withCache(key, DEFAULT_TTL.capitalHistory, () =>
    sdk.getSectorFundFlowHistory(symbol, options)
  );
}

/**
 * 获取北向/南向分时资金
 */
export async function getNorthboundMinute(direction: 'north' | 'south' = 'north') {
  const key = getCacheKey('getNorthboundMinute', direction);
  return withCache(key, DEFAULT_TTL.northbound, () => sdk.getNorthboundMinute(direction));
}

/**
 * 获取北向/南向资金汇总
 */
export async function getNorthboundFlowSummary() {
  const key = getCacheKey('getNorthboundFlowSummary');
  return withCache(key, DEFAULT_TTL.northbound, () => sdk.getNorthboundFlowSummary());
}

/**
 * 获取北向持股排行
 */
export async function getNorthboundHoldingRank(options?: {
  market?: 'all' | 'shanghai' | 'shenzhen';
  period?: 'today' | '3day' | '5day' | '10day' | 'month' | 'quarter' | 'year';
  date?: string;
}) {
  const key = getCacheKey('getNorthboundHoldingRank', options);
  return withCache(key, DEFAULT_TTL.northbound, () => sdk.getNorthboundHoldingRank(options));
}

/**
 * 获取北向/南向资金历史
 */
export async function getNorthboundHistory(
  direction: 'north' | 'south' = 'north',
  options?: {
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getNorthboundHistory', direction, options);
  return withCache(key, DEFAULT_TTL.northbound, () =>
    sdk.getNorthboundHistory(direction, options)
  );
}

/**
 * 获取个股北向持仓历史
 */
export async function getNorthboundIndividual(
  symbol: string,
  options?: {
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getNorthboundIndividual', symbol, options);
  return withCache(key, DEFAULT_TTL.northbound, () =>
    sdk.getNorthboundIndividual(symbol, options)
  );
}

/**
 * 获取涨停股池
 */
export async function getZTPool(
  type: 'zt' | 'yesterday' | 'strong' | 'sub_new' | 'broken' | 'dt' = 'zt',
  date?: string
) {
  const key = getCacheKey('getZTPool', type, date);
  return withCache(key, DEFAULT_TTL.stockChanges, () => sdk.getZTPool(type, date));
}

/**
 * 获取盘口异动
 */
export async function getStockChanges(
  type:
    | 'rocket_launch'
    | 'quick_rebound'
    | 'large_buy'
    | 'limit_up_seal'
    | 'limit_down_open'
    | 'big_buy_order'
    | 'auction_up'
    | 'high_open_5d'
    | 'gap_up'
    | 'high_60d'
    | 'surge_60d'
    | 'accelerate_down'
    | 'high_dive'
    | 'large_sell'
    | 'limit_down_seal'
    | 'limit_up_open'
    | 'big_sell_order'
    | 'auction_down'
    | 'low_open_5d'
    | 'gap_down'
    | 'low_60d'
    | 'drop_60d' = 'large_buy'
) {
  const key = getCacheKey('getStockChanges', type);
  return withCache(key, DEFAULT_TTL.stockChanges, () => sdk.getStockChanges(type));
}

/**
 * 获取板块异动
 */
export async function getBoardChanges() {
  const key = getCacheKey('getBoardChanges');
  return withCache(key, DEFAULT_TTL.boardChanges, () => sdk.getBoardChanges());
}

/**
 * 获取龙虎榜详情
 */
export async function getDragonTigerDetail(options: {
  startDate: string;
  endDate: string;
}) {
  const key = getCacheKey('getDragonTigerDetail', options);
  return withCache(key, DEFAULT_TTL.dragonTiger, () => sdk.getDragonTigerDetail(options));
}

/**
 * 获取大宗交易明细
 */
export async function getBlockTradeDetail(options?: {
  startDate?: string;
  endDate?: string;
}) {
  const key = getCacheKey('getBlockTradeDetail', options);
  return withCache(key, DEFAULT_TTL.blockTrade, () => sdk.getBlockTradeDetail(options));
}

/**
 * 获取融资融券账户统计
 */
export async function getMarginAccountInfo() {
  const key = getCacheKey('getMarginAccountInfo');
  return withCache(key, DEFAULT_TTL.margin, () => sdk.getMarginAccountInfo());
}

// ========== 搜索 API ==========

/**
 * 搜索股票/板块
 * @param keyword - 搜索关键词
 * @returns 搜索结果列表
 */
export async function search(keyword: string) {
  const results = await sdk.search(keyword);
  return results.map(normalizeSearchResult);
}

// ========== 其他 API ==========

/**
 * 获取分红派息详情
 */
export async function getDividendDetail(symbol: string): Promise<DividendDetail[]> {
  const key = getCacheKey('getDividendDetail', symbol);
  return withCache(key, DEFAULT_TTL.dividends, () => sdk.getDividendDetail(symbol));
}

/**
 * 获取交易日历
 */
export async function getTradingCalendar() {
  const key = getCacheKey('getTradingCalendar');
  return withCache(key, 3600000, () => sdk.getTradingCalendar()); // 1 小时缓存
}

// ========== 历史分钟 K 线（分时图历史日期查询） ==========

export interface HistoricalMinuteItem {
  time: string;
  price: number;
  volume: number;
  avgPrice: number;
}

export interface HistoricalMinuteResult {
  data: HistoricalMinuteItem[];
  prevClose: number;
}

/**
 * 获取历史分钟 K 线，用于分时图查看历史日期。
 * 复用 SDK 的 getHistoryKline（走 kline/get 接口，有重试 + 缓存），
 * 以 klt=5 获取 5 分钟粒度数据并转换为分时格式。
 */
export async function getHistoricalMinuteKline(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<HistoricalMinuteResult> {
  const key = getCacheKey('getHistoricalMinuteKline', symbol, startDate, endDate);
  return withCache(key, DEFAULT_TTL.historyKline, async () => {
    // period 传 '5' 走 5 分钟 K 线；SDK 类型仅声明 daily/weekly/monthly，
    // 但运行时 B() 对未知值直接透传为 klt 参数
    const data = await sdk.getHistoryKline(symbol, {
      period: '5' as 'daily',
      adjust: 'qfq',
      startDate,
      endDate,
    });

    if (!data.length) return { data: [], prevClose: 0 };

    const items: HistoricalMinuteItem[] = data.map((item) => {
      const dateStr = item.date;
      const time = dateStr.length >= 16 ? dateStr.slice(11, 16) : dateStr.slice(-5);
      const close = item.close ?? 0;
      const volume = item.volume ?? 0;
      const amount = item.amount ?? 0;
      const avgPrice = volume > 0 ? amount / (volume * 100) : close;
      return { time, price: close, volume, avgPrice };
    });

    const first = data[0];
    let prevClose = 0;
    if (first.close && first.changePercent != null && first.changePercent > -100) {
      prevClose = Math.round(first.close / (1 + first.changePercent / 100) * 100) / 100;
    }

    return { data: items, prevClose };
  });
}
