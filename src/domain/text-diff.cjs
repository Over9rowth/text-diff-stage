// Copyright (C) 2026 Over9rowth
// SPDX-License-Identifier: GPL-3.0-only
/**
 * 文本差异显影台 (text-diff-stage) - 核心算法域
 * 100% 按照 SPEC.md 锁定的数学公式与规则实现
 */

const NUMERIC_REGEX = /[0-9]+(\.[0-9]+)?%?|[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+|[0-9]{4}[-/年][0-9]{1,2}[-/月][0-9]{1,2}日?/;
const NEGATION_REGEX = /不|没|未|无|非|免除|免于|除外|禁止|不得|无需/;

const MODALITY_PAIRS = [
  ['应当', '可以'],
  ['可以', '应当'],
  ['必须', '尽量'],
  ['尽量', '必须'],
  ['全部', '部分'],
  ['部分', '全部'],
  ['合格', '基本合格'],
  ['基本合格', '合格'],
  ['连带', '按份'],
  ['按份', '连带'],
  ['含税', '不含税'],
  ['不含税', '含税'],
  ['工作日', '自然日'],
  ['自然日', '工作日']
];

/**
 * 计算两个字符串的 Bigram Jaccard 相似度
 */
function calcJaccardSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const getBigrams = (s) => {
    const bigrams = new Set();
    const clean = s.replace(/\s+/g, '');
    for (let i = 0; i < clean.length - 1; i++) {
      bigrams.add(clean.slice(i, i + 2));
    }
    if (bigrams.size === 0 && clean.length > 0) {
      bigrams.add(clean);
    }
    return bigrams;
  };

  const bg1 = getBigrams(str1);
  const bg2 = getBigrams(str2);

  if (bg1.size === 0 && bg2.size === 0) return 1.0;
  if (bg1.size === 0 || bg2.size === 0) return 0.0;

  let intersection = 0;
  for (const b of bg1) {
    if (bg2.has(b)) intersection++;
  }
  const union = bg1.size + bg2.size - intersection;
  return union > 0 ? intersection / union : 0.0;
}

/**
 * 段落级 LCS 对齐器
 * 基于 bigram Jaccard 相似度 (阈值 >= 0.35) 与动态规划 LCS 对齐段落
 */
function alignParagraphs(oldText, newText) {
  const oldParas = (oldText || '').split(/\r?\n/).map(p => p.trim()).filter(Boolean);
  const newParas = (newText || '').split(/\r?\n/).map(p => p.trim()).filter(Boolean);

  const m = oldParas.length;
  const n = newParas.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) {
    return newParas.map((p, idx) => ({
      status: 'ADDED',
      oldIndex: null,
      newIndex: idx,
      oldParagraph: '',
      newParagraph: p,
      similarity: 0
    }));
  }
  if (n === 0) {
    return oldParas.map((p, idx) => ({
      status: 'REMOVED',
      oldIndex: idx,
      newIndex: null,
      oldParagraph: p,
      newParagraph: '',
      similarity: 0
    }));
  }

  // 相似度评分矩阵
  const sim = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      sim[i][j] = calcJaccardSimilarity(oldParas[i], newParas[j]);
    }
  }

  // 动态规划对齐
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const matchScore = sim[i - 1][j - 1] >= 0.35 ? sim[i - 1][j - 1] * 2 : -0.5;
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + matchScore,
        dp[i - 1][j] - 0.2,
        dp[i][j - 1] - 0.2
      );
    }
  }

  // 回溯生成对齐列表
  const aligned = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && sim[i - 1][j - 1] >= 0.35) {
      const s = sim[i - 1][j - 1];
      const status = oldParas[i - 1] === newParas[j - 1] ? 'UNCHANGED' : 'MODIFIED';
      aligned.unshift({
        status,
        oldIndex: i - 1,
        newIndex: j - 1,
        oldParagraph: oldParas[i - 1],
        newParagraph: newParas[j - 1],
        similarity: Number(s.toFixed(4))
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      aligned.unshift({
        status: 'ADDED',
        oldIndex: null,
        newIndex: j - 1,
        oldParagraph: '',
        newParagraph: newParas[j - 1],
        similarity: 0
      });
      j--;
    } else if (i > 0) {
      aligned.unshift({
        status: 'REMOVED',
        oldIndex: i - 1,
        newIndex: null,
        oldParagraph: oldParas[i - 1],
        newParagraph: '',
        similarity: 0
      });
      i--;
    }
  }

  return aligned;
}

/**
 * 字符级 Myers / DP 最短编辑路径差分
 */
function diffChars(oldStr, newStr) {
  if (oldStr === newStr) {
    return oldStr.length > 0 ? [{ type: 'equal', text: oldStr }] : [];
  }
  if (!oldStr) {
    return newStr.length > 0 ? [{ type: 'insert', text: newStr }] : [];
  }
  if (!newStr) {
    return oldStr.length > 0 ? [{ type: 'delete', text: oldStr }] : [];
  }

  const m = oldStr.length;
  const n = newStr.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldStr[i - 1] === newStr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldStr[i - 1] === newStr[j - 1]) {
      ops.unshift({ type: 'equal', char: oldStr[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', char: newStr[j - 1] });
      j--;
    } else if (i > 0) {
      ops.unshift({ type: 'delete', char: oldStr[i - 1] });
      i--;
    }
  }

  // 合并相邻同类型操作
  const merged = [];
  for (const op of ops) {
    if (merged.length > 0 && merged[merged.length - 1].type === op.type) {
      merged[merged.length - 1].text += op.char;
    } else {
      merged.push({ type: op.type, text: op.char });
    }
  }

  return merged;
}

/**
 * 高危改动语义探针
 */
function classifyRiskChanges(alignedParagraphs) {
  const findings = [];

  alignedParagraphs.forEach((item, pIdx) => {
    if (item.status === 'UNCHANGED') return;

    if (item.status === 'ADDED') {
      const hasNum = NUMERIC_REGEX.test(item.newParagraph);
      const hasNeg = NEGATION_REGEX.test(item.newParagraph);
      findings.push({
        paragraphIdx: pIdx,
        riskLevel: (hasNum || hasNeg) ? 'HIGH_RISK' : 'MEDIUM_RISK',
        category: hasNum ? 'NUMERIC_CHANGE' : (hasNeg ? 'NEGATION_FLIP' : 'CONTENT_EDIT'),
        beforeSnippet: '',
        afterSnippet: item.newParagraph.slice(0, 80),
        explanation: '新增整段内容' + (hasNum ? '（含数字/金额/日期）' : (hasNeg ? '（含否定词）' : ''))
      });
      return;
    }

    if (item.status === 'REMOVED') {
      const hasNum = NUMERIC_REGEX.test(item.oldParagraph);
      const hasNeg = NEGATION_REGEX.test(item.oldParagraph);
      findings.push({
        paragraphIdx: pIdx,
        riskLevel: (hasNum || hasNeg) ? 'HIGH_RISK' : 'MEDIUM_RISK',
        category: hasNum ? 'NUMERIC_CHANGE' : (hasNeg ? 'NEGATION_FLIP' : 'CONTENT_EDIT'),
        beforeSnippet: item.oldParagraph.slice(0, 80),
        afterSnippet: '',
        explanation: '整段删除' + (hasNum ? '（含关键数字/金额）' : (hasNeg ? '（含否定条款）' : ''))
      });
      return;
    }

    // MODIFIED 段落执行字符级探针
    const diffs = diffChars(item.oldParagraph, item.newParagraph);
    const deletedParts = diffs.filter(d => d.type === 'delete').map(d => d.text);
    const insertedParts = diffs.filter(d => d.type === 'insert').map(d => d.text);

    const oldModStr = deletedParts.join('');
    const newModStr = insertedParts.join('');

    // 1. 检查是否仅为空白/标点变动
    const isPunctOnly = /^[，。、；：！？\s.,;:!?'"“”‘’()（）\[\]【】]*$/.test(oldModStr + newModStr);
    if (isPunctOnly) {
      findings.push({
        paragraphIdx: pIdx,
        riskLevel: 'FORMAT_ONLY',
        category: 'PUNCTUATION_WHITESPACE',
        beforeSnippet: oldModStr,
        afterSnippet: newModStr,
        explanation: '纯标点或空白微调'
      });
      return;
    }

    // 2. 程度弱化与权利义务转移 (MODALITY_SHIFT)
    let modalityHit = false;
    for (const [fromWord, toWord] of MODALITY_PAIRS) {
      if (item.oldParagraph.includes(fromWord) && item.newParagraph.includes(toWord)) {
        findings.push({
          paragraphIdx: pIdx,
          riskLevel: 'HIGH_RISK',
          category: 'MODALITY_SHIFT',
          beforeSnippet: fromWord,
          afterSnippet: toWord,
          explanation: `权利义务/程度词变动：“${fromWord}” → “${toWord}”`
        });
        modalityHit = true;
        break;
      }
    }

    // 3. 否定词极性反转 (NEGATION_FLIP)
    const delNeg = NEGATION_REGEX.test(oldModStr);
    const insNeg = NEGATION_REGEX.test(newModStr);
    if (delNeg !== insNeg) {
      findings.push({
        paragraphIdx: pIdx,
        riskLevel: 'HIGH_RISK',
        category: 'NEGATION_FLIP',
        beforeSnippet: oldModStr,
        afterSnippet: newModStr,
        explanation: `否定词反转：${insNeg ? '新增否定限定' : '删除了原否定词'}`
      });
      return;
    }

    // 4. 数字/金额/百分比/日期变动 (NUMERIC_CHANGE)
    if (NUMERIC_REGEX.test(oldModStr) || NUMERIC_REGEX.test(newModStr)) {
      findings.push({
        paragraphIdx: pIdx,
        riskLevel: 'HIGH_RISK',
        category: 'NUMERIC_CHANGE',
        beforeSnippet: oldModStr,
        afterSnippet: newModStr,
        explanation: `关键数字/金额/日期变更：[${oldModStr}] → [${newModStr}]`
      });
      return;
    }

    // 5. 常规实质内容编辑 (若上面没命中 MODALITY_SHIFT)
    if (!modalityHit) {
      findings.push({
        paragraphIdx: pIdx,
        riskLevel: 'MEDIUM_RISK',
        category: 'CONTENT_EDIT',
        beforeSnippet: oldModStr.slice(0, 50),
        afterSnippet: newModStr.slice(0, 50),
        explanation: '实质文句修订'
      });
    }
  });

  return findings;
}

/**
 * 全量双文档差异分析报告生成
 */
function compareDocuments(oldText, newText) {
  const alignedParagraphs = alignParagraphs(oldText, newText);
  const detailedParagraphs = alignedParagraphs.map(p => {
    const charDiffs = (p.status === 'MODIFIED') ? diffChars(p.oldParagraph, p.newParagraph) : [];
    return {
      ...p,
      charDiffs
    };
  });

  const riskFindings = classifyRiskChanges(alignedParagraphs);

  const stats = {
    totalAligned: alignedParagraphs.length,
    unchangedCount: alignedParagraphs.filter(p => p.status === 'UNCHANGED').length,
    modifiedCount: alignedParagraphs.filter(p => p.status === 'MODIFIED').length,
    addedCount: alignedParagraphs.filter(p => p.status === 'ADDED').length,
    removedCount: alignedParagraphs.filter(p => p.status === 'REMOVED').length,
    highRiskCount: riskFindings.filter(r => r.riskLevel === 'HIGH_RISK').length,
    mediumRiskCount: riskFindings.filter(r => r.riskLevel === 'MEDIUM_RISK').length,
    formatOnlyCount: riskFindings.filter(r => r.riskLevel === 'FORMAT_ONLY').length
  };

  return {
    paragraphs: detailedParagraphs,
    riskFindings,
    stats
  };
}

module.exports = {
  calcJaccardSimilarity,
  alignParagraphs,
  diffChars,
  classifyRiskChanges,
  compareDocuments
};
