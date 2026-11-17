import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Icon } from '@components/ui/Icon';
import { CALC_LIST, filterStatToolGroups, RESOURCE_LIST, type CalcKey, type Tab } from './stat-tools/catalog';
import '../../styles/stattools-workbench.css';

export { CALC_LIST, filterStatToolGroups, type CalcKey } from './stat-tools/catalog';

const CalculatorCanvas = lazy(() => import('./stat-tools/CalculatorCanvas').then((m) => ({ default: m.CalculatorCanvas })));
const CriticalTables = lazy(() => import('./stat-tools/StatReferenceGuides').then((m) => ({ default: m.CriticalTables })));
const FormulaLibrary = lazy(() => import('./stat-tools/StatReferenceGuides').then((m) => ({ default: m.FormulaLibrary })));
const MethodsGuide = lazy(() => import('./stat-tools/StatReferenceGuides').then((m) => ({ default: m.MethodsGuide })));

export function StatToolsView() {
  const [tab, setTab] = useState<Tab>('calculator');
  const [calcKey, setCalcKey] = useState<CalcKey>('pvalue');
  const [query, setQuery] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const catalogRef = useRef<HTMLElement>(null);
  const canvasHeadingRef = useRef<HTMLHeadingElement>(null);

  const filteredGroups = useMemo(() => filterStatToolGroups(query), [query]);
  const activeMeta = tab === 'calculator'
    ? CALC_LIST.find((item) => item.key === calcKey)!
    : RESOURCE_LIST.find((item) => item.tab === tab)!;
  const activeGroupLabel = tab === 'calculator'
    ? CALC_LIST.find((item) => item.key === calcKey)!.groupLabel
    : '参考资料';

  function openWorkspace() {
    setWorkspaceOpen(true);
    requestAnimationFrame(() => canvasHeadingRef.current?.focus());
  }

  function navigateToCalc(k: CalcKey) {
    setCalcKey(k);
    setTab('calculator');
    openWorkspace();
  }

  function navigateToResource(nextTab: Exclude<Tab, 'calculator'>) {
    setTab(nextTab);
    openWorkspace();
  }

  function returnToCatalog() {
    setWorkspaceOpen(false);
    requestAnimationFrame(() => catalogRef.current?.focus());
  }

  return (
    <div className={`stattools-view ${workspaceOpen ? 'is-workspace-open' : ''}`}>
      <header className="stattools-view-header">
        <div>
          <h1>统计与检验</h1>
          <p>选择一种方法，在独立画布中完成输入、计算与可视化判读；全部计算均在本机执行。</p>
        </div>
        <button type="button" className="stattools-formula-shortcut" onClick={() => navigateToResource('formula')}>
          <Icon name="references" size={15} /> 公式与方法依据
        </button>
      </header>

      <div className="stattools-shell">
        <aside ref={catalogRef} className="stattools-catalog" aria-label="统计工具目录" tabIndex={-1}>
          <label className="stattools-search">
            <span className="sr-only">搜索统计工具</span>
            <Icon name="search" size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索方法、用途或结果…" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="清空统计工具搜索"><Icon name="close" size={14} /></button>
            )}
          </label>

          <nav className="stattools-nav" aria-label="统计方法分类">
            {filteredGroups.map((group) => (
              <section key={group.id} className="stattools-nav-group" aria-labelledby={`stattools-group-${group.id}`}>
                <h2 id={`stattools-group-${group.id}`}>{group.label}</h2>
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={tab === 'calculator' && calcKey === item.key ? 'active' : ''}
                    onClick={() => navigateToCalc(item.key)}
                    aria-current={tab === 'calculator' && calcKey === item.key ? 'page' : undefined}
                  >
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </section>
            ))}

            {filteredGroups.length === 0 && <div className="stattools-no-results">没有匹配的统计工具。可尝试“诊断”“效应量”或“生存”。</div>}

            {!query && (
              <section className="stattools-nav-group" aria-labelledby="stattools-group-reference">
                <h2 id="stattools-group-reference">参考资料</h2>
                {RESOURCE_LIST.map((item) => (
                  <button
                    type="button"
                    key={item.tab}
                    className={tab === item.tab ? 'active' : ''}
                    onClick={() => navigateToResource(item.tab)}
                    aria-current={tab === item.tab ? 'page' : undefined}
                  >
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                ))}
              </section>
            )}
          </nav>
        </aside>

        <main className="stattools-canvas" aria-labelledby="stattools-active-title">
          <header className="stattools-canvas-header">
            <button type="button" className="stattools-mobile-back" onClick={returnToCatalog}>
              <Icon name="chevronLeft" size={17} /> 返回工具目录
            </button>
            <div>
              <span>{activeGroupLabel}</span>
              <h2 id="stattools-active-title" ref={canvasHeadingRef} tabIndex={-1}>{activeMeta.label}</h2>
              <p>{activeMeta.description}</p>
            </div>
          </header>
          <div className="stattools-canvas-scroll">
            <Suspense fallback={<div className="view-loading-skeleton" role="status">正在装载计算器…</div>}>
              {tab === 'calculator' && <CalculatorCanvas calc={calcKey} />}
              {tab === 'tables' && <CriticalTables />}
              {tab === 'formula' && <FormulaLibrary onNavigate={navigateToCalc} />}
              {tab === 'methods' && <MethodsGuide />}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
