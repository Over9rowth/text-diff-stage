// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { compareDocuments, DocumentDiffReport } from '../domain/text-diff.cjs';

const OLD_DOC_SAMPLE = `第一条 总则：为明确采购合同双方权责，特订立本条款。
第二条 违约赔偿：若供方延迟交货，按日支付合同总金额5%的违约金。
第三条 验收规范：设备送达指定现场后，经买方验收合格后付清全部尾款。
第四条 法律责任：因本协议发生纠纷，违约方应承担全部法律与赔偿责任。`;

const NEW_DOC_SAMPLE = `第一条 总则：为明确采购合同双方权责，特订立本条款。
第二条 违约赔偿：若供方延迟交货，按日支付合同总金额0.5%的违约金。
第三条 验收规范：设备送达指定现场后，经买方验收基本合格后付清全部尾款。
第四条 法律责任：因本协议发生纠纷，违约方不承担连带法律与赔偿责任。`;

declare global {
  interface Window {
    textdiff?: {
      exportReportJson: (json: string) => Promise<{ path: string; bytes: number } | null>;
      exportManualPdf: () => Promise<{ path: string; bytes: number } | null>;
      smokeReady: (p: { mounted: boolean; engineOk: boolean }) => void;
      onSmokeRun: (cb: () => void) => void;
      smokeResult: (payload: unknown) => Promise<void>;
    };
  }
}

export function App() {
  const [oldText, setOldText] = useState(OLD_DOC_SAMPLE);
  const [newText, setNewText] = useState(NEW_DOC_SAMPLE);
  const [report, setReport] = useState<DocumentDiffReport | null>(null);

  useEffect(() => {
    const r = compareDocuments(oldText, newText);
    setReport(r);

    if (window.textdiff) {
      window.textdiff.smokeReady({ mounted: true, engineOk: !!r });
      window.textdiff.onSmokeRun(() => {
        const fresh = compareDocuments(OLD_DOC_SAMPLE, NEW_DOC_SAMPLE);
        window.textdiff?.smokeResult({ report: fresh });
      });
    }
  }, []);

  const handleCompare = (o: string, n: string) => {
    setOldText(o);
    setNewText(n);
    setReport(compareDocuments(o, n));
  };

  const handleExportJson = async () => {
    if (!report || !window.textdiff) return;
    await window.textdiff.exportReportJson(JSON.stringify(report, null, 2));
  };

  const handleExportManual = async () => {
    if (!window.textdiff) return;
    await window.textdiff.exportManualPdf();
  };

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="brand-dot" />
          <h1 className="title">文本差异显影台 <span className="version">v0.1.0</span></h1>
          <span className="badge">100% 本机离线</span>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => handleCompare(OLD_DOC_SAMPLE, NEW_DOC_SAMPLE)}>
            重载合同对比样本
          </button>
          <button className="btn btn-secondary" onClick={handleExportManual}>
            导出说明书 (PDF)
          </button>
          <button className="btn btn-primary" onClick={handleExportJson}>
            导出显影报告 (JSON)
          </button>
        </div>
      </header>

      <div className="honest-banner">
        【仪器观测边界】本工具基于确定性 LCS 对齐与编辑距离算法高亮差异，不改写文本内容，高危规则专为合同/公文隐蔽篡改探针设计。
      </div>

      {report && (
        <section className="dashboard-grid">
          <div className="card">
            <div className="card-label">对齐段落总数</div>
            <div className="card-value">
              {report.stats.totalAligned} <span className="unit">段</span>
            </div>
            <div className="card-sub">未变 {report.stats.unchangedCount} / 修订 {report.stats.modifiedCount}</div>
          </div>

          <div className="card">
            <div className="card-label">高危语义改动警报</div>
            <div className="card-value highlight-alert">
              {report.stats.highRiskCount} <span className="unit">处</span>
            </div>
            <div className="card-sub">包含金额、否定词反转或程度弱化</div>
          </div>

          <div className="card">
            <div className="card-label">实质内容增改</div>
            <div className="card-value highlight-amber">
              {report.stats.mediumRiskCount} <span className="unit">处</span>
            </div>
            <div className="card-sub">普通语义文句修订</div>
          </div>

          <div className="card">
            <div className="card-label">纯格式/空白微调</div>
            <div className="card-value">
              {report.stats.formatOnlyCount} <span className="unit">处</span>
            </div>
            <div className="card-sub">不影响实体法律条款</div>
          </div>
        </section>
      )}

      {/* 隐蔽高危改动快报栏 */}
      {report && report.riskFindings.length > 0 && (
        <div className="risk-banner">
          <div className="risk-banner-title">🚨 检出 {report.riskFindings.length} 处合同/文句变动探针警报：</div>
          <div className="risk-tag-list">
            {report.riskFindings.map((rf, idx) => (
              <span key={idx} className={`risk-tag tag-${rf.riskLevel}`}>
                第 {rf.paragraphIdx + 1} 段：{rf.explanation}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="workspace-split">
        {/* 左侧：初稿文本 */}
        <div className="panel">
          <div className="panel-header">
            <span>基准版本（原版 / 初稿）</span>
            <span className="count-hint">{oldText.length} 字符</span>
          </div>
          <textarea
            className="text-input"
            value={oldText}
            onChange={(e) => handleCompare(e.target.value, newText)}
            placeholder="粘贴基准版本文本..."
          />
        </div>

        {/* 右侧：修订版本 */}
        <div className="panel">
          <div className="panel-header">
            <span>比对版本（修订 / 回传版）</span>
            <span className="count-hint">{newText.length} 字符</span>
          </div>
          <textarea
            className="text-input"
            value={newText}
            onChange={(e) => handleCompare(oldText, e.target.value)}
            placeholder="粘贴待比对版本文本..."
          />
        </div>
      </div>

      {/* 底部：逐段显影内联高亮区 */}
      <div className="diff-view-panel">
        <div className="panel-header">
          <span>逐段字符级内联显影透镜</span>
          <span className="count-hint">绿色为新增，红色下划线为删除</span>
        </div>
        <div className="diff-scroll">
          {report?.paragraphs.map((p, idx) => (
            <div key={idx} className={`diff-row status-${p.status}`}>
              <div className="diff-row-idx">段落 {idx + 1} ({p.status})</div>
              <div className="diff-row-content">
                {p.status === 'UNCHANGED' && <div className="unchanged-text">{p.oldParagraph}</div>}
                {p.status === 'ADDED' && <div className="added-text">+ {p.newParagraph}</div>}
                {p.status === 'REMOVED' && <div className="removed-text">- {p.oldParagraph}</div>}
                {p.status === 'MODIFIED' && (
                  <div className="inline-diff">
                    {p.charDiffs?.map((c, ci) => (
                      <span key={ci} className={`diff-chunk chunk-${c.type}`}>
                        {c.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
