# multi-stock-view (A股看板)

## 技术栈
- React 19 + TypeScript + Vite 7
- React Router DOM 7 (createBrowserRouter)
- ECharts 6 + echarts-for-react 3
- Framer Motion 12 (动画)
- Lucide React 0.5 (图标)
- stock-sdk 1.9 (A股数据SDK)
- CSS Modules + CSS 自定义属性（暗色/亮色主题）

## 目录结构
```
src/
├── main.tsx                    # 入口
├── App.tsx                     # Provider 层级 (Theme > AppSettings > BoardData > Toast > Router)
├── index.css                   # 全局样式、CSS 变量、主题
├── components/
│   ├── layout/
│   │   ├── Layout.tsx          # 页面框架（Sidebar + Header + <Outlet/> + footer）
│   │   ├── Header.tsx          # 顶部搜索栏 + 主题切换 + GitHub/SDK 链接
│   │   └── Sidebar.tsx         # 左侧导航（仅：总览、热力图）
│   ├── common/                 # 通用组件 (Button, Card, Tabs, Loading, Empty, Logo, Toast)
│   └── charts/
│       └── LazyEChart.tsx      # 懒加载 ECharts 包装器
├── contexts/                   # React Context
│   ├── ThemeProvider.tsx       # 暗/亮主题 + 红涨绿跌/绿涨红跌
│   ├── AppSettingsProvider.tsx # 刷新间隔等设置
│   └── BoardDataContext.tsx    # 全局板块数据（行业/概念）
├── hooks/                      # 自定义 hooks (usePolling, useLocalStorage, useTheme)
├── pages/
│   ├── Dashboard/              # 总览（指数卡片、涨跌统计、自选快照、市场榜单、板块列表、资金流）
│   └── Heatmap/                # 股票热力图
├── router/
│   └── index.tsx               # 路由配置（仅 / 和 /heatmap）
├── services/
│   ├── sdk.ts                  # stock-sdk 封装（行情、搜索、资金流等 API）
│   ├── storage.ts              # localStorage（自选、搜索历史、设置）
│   └── analysis.ts             # 技术分析服务
├── types/
│   └── index.ts                # 类型定义
└── utils/
    └── format.ts               # 格式化工具（价格、百分比、金额、涨跌色）
```

## 路由
| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Dashboard | 总览，直接渲染（非懒加载） |
| `/heatmap` | Heatmap | 热力图，懒加载 |

## CSS 变量
- `--sidebar-width: 220px`
- `--header-height: 56px`
- 主题色通过 `:root`（暗色）和 `[data-theme="light"]`（亮色）切换

## 构建
- 开发：`npm run dev`（base path 为 `/`）
- 生产：通过 vite.config.ts 注入 `BASE_URL`（github pages 下为 `/stock-dashboard/`）
- 部署：`.github/workflows/deploy-pages.yml`
