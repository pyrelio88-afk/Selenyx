import { useState } from 'react';

export function ClinicalDataView() {
  const [activeTab, setActiveTab] = useState<'nanda' | 'labs' | 'glossary'>('nanda');

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">临床数据</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['nanda', 'labs', 'glossary'] as const).map((tab) => (
          <button key={tab} className={`btn ${activeTab === tab ? 'btn-primary' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab === 'nanda' ? 'NANDA 诊断' : tab === 'labs' ? '检验值' : '术语表'}
          </button>
        ))}
      </div>

      {activeTab === 'nanda' && (
        <div className="empty-state">
          <div className="icon">⚕️</div>
          <p>NANDA-I 护理诊断（254 条 × 13 领域，含定义/特征/因素/措施）—— 后端 Python 服务提供</p>
        </div>
      )}

      {activeTab === 'labs' && (
        <div className="empty-state">
          <div className="icon">🧪</div>
          <p>实验室检验值参考范围（110+ 项 × 15 分类，含危急值/护理要点/干扰因素）—— 后端 Python 服务提供</p>
        </div>
      )}

      {activeTab === 'glossary' && (
        <div className="empty-state">
          <div className="icon">📖</div>
          <p>护理科研术语表（383 条，中英对照）—— 后端 Python 服务提供</p>
        </div>
      )}
    </div>
  );
}
