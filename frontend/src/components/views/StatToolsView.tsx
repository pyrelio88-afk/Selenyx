import { useState } from 'react';

export function StatToolsView() {
  const [activeTab, setActiveTab] = useState<'tables' | 'methods' | 'calculator'>('tables');
  const [zScore, setZScore] = useState('1.96');
  const [pValue, setPValue] = useState('');

  function calcP() {
    const z = parseFloat(zScore);
    if (isNaN(z)) { setPValue('请输入有效数值'); return; }
    // 双尾 p 值: 2 * (1 - Φ(|z|))
    const p = 2 * (1 - normalCDF(Math.abs(z)));
    setPValue(p < 0.0001 ? p.toExponential(4) : p.toFixed(4));
  }

  function normalCDF(x: number): number {
    // Abramowitz-Stegun 近似
    const t = 1 / (1 + 0.2316419 * x);
    const d = 0.3989423 * Math.exp(-x * x / 2);
    return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">统计工具</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['tables', 'methods', 'calculator'] as const).map((tab) => (
          <button key={tab} className={`btn ${activeTab === tab ? 'btn-primary' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'tables' ? '统计表' : tab === 'methods' ? '方法库' : '计算器'}
          </button>
        ))}
      </div>

      {activeTab === 'tables' && (
        <div className="grid grid-3">
          {[
            { name: 'Z 分布表', range: 'z = 0.00 ~ 3.99', desc: '标准正态分布临界值与 p 值' },
            { name: 't 分布表', range: 'df = 1 ~ 170', desc: 't 分布临界值（α = 0.10/0.05/0.01）' },
            { name: 'χ² 分布表', range: 'df = 1 ~ 85', desc: '卡方分布临界值' },
            { name: 'F 分布表', range: 'df1×df2', desc: 'F 分布临界值（α = 0.05/0.01）' },
            { name: 'GRADE 分级', range: '4 级', desc: '证据质量分级标准' },
            { name: 'PRISMA 2020', range: '26 项', desc: '系统综述报告条目清单' },
          ].map((item) => (
            <div key={item.name} className="card">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>{item.name}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{item.desc}</p>
              <p style={{ fontSize: 12, color: 'var(--accent)' }}>{item.range}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'methods' && (
        <div className="empty-state">
          <div className="icon">📊</div>
          <p>统计方法库（70+ 方法，含 R/Python/SPSS 代码示例）—— 后端 Python 服务提供</p>
        </div>
      )}

      {activeTab === 'calculator' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>p 值计算器</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <label style={{ fontSize: 14 }}>Z 值:</label>
            <input className="input" value={zScore} onChange={(e) => setZScore(e.target.value)} style={{ width: 120 }} />
            <button className="btn btn-primary" onClick={calcP}>计算</button>
          </div>
          {pValue && (
            <div style={{ padding: 16, background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', fontSize: 16 }}>
              双尾 p 值 = <strong>{pValue}</strong>
              <span style={{ marginLeft: 12, fontSize: 13, color: parseFloat(pValue) < 0.05 ? 'var(--danger)' : 'var(--text-muted)' }}>
                {parseFloat(pValue) < 0.05 ? '显著 (p < 0.05)' : '不显著 (p ≥ 0.05)'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
