import { lazy, Suspense, useMemo, useState } from 'react';
import { Icon, type IconName } from '@components/ui/Icon';
import { useIsMobile } from '@lib/useIsMobile';
import './tools-workbench.css';

const ChartTool = lazy(() => import('@components/views/ChartView').then((m) => ({ default: m.ChartTool })));
const ResearchMiniTools = lazy(() => import('./tools/ResearchMiniTools').then((m) => ({
  default: function ActiveMiniTool({ tab }: { tab: Exclude<ToolTab, 'chart'> }) {
    switch (tab) {
      case 'browser': return <m.WebBrowser />;
      case 'doi': return <m.DOILookup />;
      case 'cite': return <m.CiteFormatter />;
      case 'pico': return <m.PICOBuilder />;
      case 'design': return <m.DesignChecker />;
      case 'ethics': return <m.EthicsChecklist />;
      case 'matrix': return <m.LiteratureMatrix />;
      case 'grant': return <m.GrantOutline />;
      case 'count': return <m.WordCounter />;
      case 'models': return <m.LocalModels />;
    }
  },
})));

export type ToolTab = 'chart' | 'doi' | 'cite' | 'count' | 'models' | 'browser' | 'pico' | 'design' | 'ethics' | 'matrix' | 'grant';
export type ToolCategory = 'visual' | 'literature' | 'planning' | 'utility';
export type ToolRuntime = 'local' | 'network' | 'ollama';

export interface ToolDefinition {
  key: ToolTab;
  label: string;
  icon: IconName;
  desc: string;
  category: ToolCategory;
  runtime: ToolRuntime;
  constraint: string;
  keywords: string[];
}

export const TOOL_CATEGORIES: { key: ToolCategory | 'all'; label: string }[] = [
  { key: 'all', label: '全部工具' },
  { key: 'literature', label: '文献与检索' },
  { key: 'planning', label: '研究规划' },
  { key: 'visual', label: '数据与呈现' },
  { key: 'utility', label: '本机实用工具' },
];

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { key: 'chart', label: '科研图表', icon: 'chart', desc: '用 ECharts 绘制科研图', category: 'visual', runtime: 'local', constraint: '图表在本机生成；不会上传数据。', keywords: ['图表', 'echarts', '可视化', '数据'] },
  { key: 'matrix', label: '文献矩阵', icon: 'tables', desc: '多文献对比与 CSV 导出', category: 'visual', runtime: 'local', constraint: '编辑与 CSV 导出均在本机完成。', keywords: ['矩阵', '综述', 'csv', '提取'] },
  { key: 'doi', label: 'DOI 查询', icon: 'tag', desc: '抓取 Crossref / arXiv 元数据', category: 'literature', runtime: 'network', constraint: '查询依赖 Crossref 或 arXiv 网络服务。', keywords: ['doi', 'crossref', 'arxiv', '元数据'] },
  { key: 'cite', label: '引用格式化', icon: 'quote', desc: '生成 GB/T 7714 引用', category: 'literature', runtime: 'local', constraint: '规则在本机执行；结果仍需人工核对。', keywords: ['引用', 'gbt', '7714', '格式'] },
  { key: 'browser', label: '网页浏览', icon: 'globe', desc: '应用内打开科研网站', category: 'literature', runtime: 'network', constraint: '需要联网；部分网站会拒绝应用内嵌入。', keywords: ['网页', 'pubmed', 'cnki', '浏览器'] },
  { key: 'pico', label: 'PICO 构建', icon: 'target', desc: '结构化循证研究问题', category: 'planning', runtime: 'local', constraint: '问题构建在本机完成；跳转 PubMed 时需联网。', keywords: ['pico', '循证', '问题', '检索式'] },
  { key: 'design', label: '研究设计', icon: 'blueprint', desc: '开题前设计要点核查', category: 'planning', runtime: 'local', constraint: '自检清单在本机运行，不替代统计或伦理审查。', keywords: ['研究设计', '开题', '检查', '偏倚'] },
  { key: 'ethics', label: '伦理审查', icon: 'shield', desc: '伦理材料准备清单', category: 'planning', runtime: 'local', constraint: '清单可离线使用，不代表已获得伦理批准。', keywords: ['伦理', 'irb', '知情同意', '清单'] },
  { key: 'grant', label: '基金申请', icon: 'grant', desc: '科研基金标书大纲', category: 'planning', runtime: 'local', constraint: '模板可离线查看，需按申报机构要求核验。', keywords: ['基金', '标书', '申请', '大纲'] },
  { key: 'count', label: '字数统计', icon: 'count', desc: '中英文字符与阅读时间', category: 'utility', runtime: 'local', constraint: '全部文本只在当前设备计算。', keywords: ['字数', '字符', '单词', '统计'] },
  { key: 'models', label: '本地模型', icon: 'chip', desc: '查看小模型与 Ollama 命令', category: 'utility', runtime: 'ollama', constraint: '说明可离线查看；下载需联网，运行模型需安装 Ollama。', keywords: ['ollama', '模型', 'qwen', 'gemma', 'llama'] },
];

export const TOOL_RUNTIME_LABELS: Record<ToolRuntime, string> = {
  local: '本地可用',
  network: '需要联网',
  ollama: '需要 Ollama',
};

export function filterTools(search: string, category: ToolCategory | 'all'): ToolDefinition[] {
  const normalized = search.trim().toLocaleLowerCase();
  return TOOL_DEFINITIONS.filter((tool) => {
    if (category !== 'all' && tool.category !== category) return false;
    if (!normalized) return true;
    return [tool.label, tool.desc, tool.constraint, ...tool.keywords].some((value) => value.toLocaleLowerCase().includes(normalized));
  });
}

function ToolList({ tools, activeKey, onOpen }: { tools: ToolDefinition[]; activeKey: ToolTab; onOpen: (key: ToolTab) => void }) {
  if (tools.length === 0) {
    return <div className="tools-empty-result"><Icon name="search" size={20} /><span>没有匹配的工具</span></div>;
  }

  const grouped = TOOL_CATEGORIES.slice(1).map((category) => ({
    ...category,
    tools: tools.filter((tool) => tool.category === category.key),
  })).filter((group) => group.tools.length > 0);

  return (
    <div className="tools-directory" aria-label="工具列表">
      {grouped.map((group) => (
        <section key={group.key} className="tools-directory-group" aria-labelledby={`tools-group-${group.key}`}>
          <h2 id={`tools-group-${group.key}`}>{group.label}</h2>
          <div>
            {group.tools.map((tool) => (
              <button
                key={tool.key}
                type="button"
                className={`tools-directory-item ${activeKey === tool.key ? 'is-active' : ''}`}
                aria-current={activeKey === tool.key ? 'page' : undefined}
                onClick={() => onOpen(tool.key)}
              >
                <span className="tools-directory-icon"><Icon name={tool.icon} size={19} strokeWidth={1.7} /></span>
                <span className="tools-directory-copy"><strong>{tool.label}</strong><small>{tool.desc}</small></span>
                <span className="tools-item-runtime"><i className={`tools-runtime-dot is-${tool.runtime}`} aria-hidden="true" />{TOOL_RUNTIME_LABELS[tool.runtime]}</span>
                <Icon name="chevronRight" size={14} className="tools-directory-arrow" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ToolsView() {
  const [tab, setTab] = useState<ToolTab>('chart');
  const isMobile = useIsMobile();
  const [pickerOpen, setPickerOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ToolCategory | 'all'>('all');
  const visibleTools = useMemo(() => filterTools(search, category), [search, category]);

  function openTool(key: ToolTab) {
    setTab(key);
    setPickerOpen(false);
  }

  const active = TOOL_DEFINITIONS.find((tool) => tool.key === tab)!;

  if (isMobile && pickerOpen) {
    return (
      <div className="tools-workbench tools-workbench-picker">
        <div className="view-header tools-view-header">
          <div><h1 className="view-title">工具箱</h1><p>选择一个工具进入独立工作页。</p></div>
        </div>
        <div className="tools-mobile-filter">
          <label className="tools-search"><Icon name="search" size={17} /><span className="sr-only">搜索工具</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索工具或用途" /></label>
          <div className="tools-category-scroll" role="group" aria-label="工具分类">
            {TOOL_CATEGORIES.map((item) => <button key={item.key} aria-pressed={category === item.key} className={category === item.key ? 'is-active' : ''} onClick={() => setCategory(item.key)}>{item.label}</button>)}
          </div>
        </div>
        <ToolList tools={visibleTools} activeKey={tab} onOpen={openTool} />
      </div>
    );
  }

  return (
      <div className="tools-workbench">
        {!isMobile && <div className="view-header tools-view-header"><div><h1 className="view-title">工具箱</h1><p>按任务找到工具；运行条件在使用前明确说明。</p></div><span className="tools-count">{TOOL_DEFINITIONS.length} 个工具 · 4 类任务</span></div>}

        {isMobile ? (
          <div className="tools-mobile-detail-header">
            <button className="tools-mobile-back" onClick={() => setPickerOpen(true)} aria-label="返回工具列表"><Icon name="chevronLeft" size={19} /> 返回工具列表</button>
            <span>{active.label}</span>
          </div>
        ) : null}

        <div className="tools-workbench-layout">
          {!isMobile && (
            <aside className="tools-workbench-sidebar" aria-label="工具导航">
              <label className="tools-search"><Icon name="search" size={17} /><span className="sr-only">搜索工具</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索工具或用途" /></label>
              <nav className="tools-category-nav" aria-label="工具分类">
                {TOOL_CATEGORIES.map((item) => (
                  <button key={item.key} aria-pressed={category === item.key} className={category === item.key ? 'is-active' : ''} onClick={() => setCategory(item.key)}>
                    <span>{item.label}</span><small>{item.key === 'all' ? TOOL_DEFINITIONS.length : TOOL_DEFINITIONS.filter((tool) => tool.category === item.key).length}</small>
                  </button>
                ))}
              </nav>
              <ToolList tools={visibleTools} activeKey={tab} onOpen={openTool} />
              <div className="tools-runtime-legend" aria-label="运行条件图例">
                {(Object.keys(TOOL_RUNTIME_LABELS) as ToolRuntime[]).map((runtime) => <span key={runtime}><i className={`tools-runtime-dot is-${runtime}`} />{TOOL_RUNTIME_LABELS[runtime]}</span>)}
              </div>
            </aside>
          )}

          <main className="tools-canvas" id={`tool-panel-${active.key}`} aria-label={`${active.label}工作区`}>
            <header className="tools-canvas-header">
              <div className="tools-canvas-icon"><Icon name={active.icon} size={23} strokeWidth={1.8} /></div>
              <div className="tools-canvas-title"><span className="tools-canvas-category">{TOOL_CATEGORIES.find((item) => item.key === active.category)?.label}</span><h2>{active.label}</h2><p>{active.desc}</p></div>
              <div className={`tools-runtime-badge is-${active.runtime}`}><span className={`tools-runtime-dot is-${active.runtime}`} />{TOOL_RUNTIME_LABELS[active.runtime]}</div>
            </header>
            <div className="tools-constraint"><Icon name={active.runtime === 'local' ? 'shield' : active.runtime === 'network' ? 'globe' : 'chip'} size={16} /><span>{active.constraint}</span></div>
            <div className="tools-canvas-body">
              <Suspense fallback={<div className="view-loading-skeleton" role="status">正在加载工具模块…</div>}>
                {tab === 'chart' ? <ChartTool /> : <ResearchMiniTools tab={tab} />}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    );
  }
