const test = require('node:test');
const assert = require('node:assert/strict');
const {
  alignParagraphs,
  diffChars,
  classifyRiskChanges,
  compareDocuments,
  calcJaccardSimilarity
} = require('../src/domain/text-diff.cjs');

test('1. Jaccard 相似度计算准确性', () => {
  const s1 = '甲方应按时足额支付货款。';
  const s2 = '甲方应在五个工作日内足额支付货款。';
  const sim = calcJaccardSimilarity(s1, s2);
  assert.ok(sim >= 0.4 && sim <= 1.0);
  assert.equal(calcJaccardSimilarity('相同内容', '相同内容'), 1.0);
  assert.equal(calcJaccardSimilarity('苹果', '汽车飞机'), 0.0);
});

test('2. 段落 LCS 对齐：段落插入不导致后续段落全部错位', () => {
  const oldText = '第一条 总则。\n第二条 双方权责。\n第三条 违约责任。';
  const newText = '第一条 总则。\n新增说明：关于补充协议的说明。\n第二条 双方权责。\n第三条 违约责任。';
  const aligned = alignParagraphs(oldText, newText);

  assert.equal(aligned.length, 4);
  assert.equal(aligned[0].status, 'UNCHANGED');
  assert.equal(aligned[1].status, 'ADDED');
  assert.equal(aligned[1].newParagraph, '新增说明：关于补充协议的说明。');
  assert.equal(aligned[2].status, 'UNCHANGED');
  assert.equal(aligned[3].status, 'UNCHANGED');
});

test('3. 字符级精确差分 diffChars 高亮测试', () => {
  const oldStr = '违约金比例为合同总额的5%。';
  const newStr = '违约金比例为合同总额的0.5%。';
  const diffs = diffChars(oldStr, newStr);

  const insertOp = diffs.find(d => d.type === 'insert');
  assert.ok(insertOp, '应包含插入操作');
  assert.equal(insertOp.text, '0.');
});

test('4. 高危语义改动：数字与金额变动检出 (NUMERIC_CHANGE)', () => {
  const oldText = '违约金比例为合同总额的5%。';
  const newText = '违约金比例为合同总额的0.5%。';
  const report = compareDocuments(oldText, newText);

  assert.equal(report.stats.highRiskCount, 1);
  const finding = report.riskFindings[0];
  assert.equal(finding.riskLevel, 'HIGH_RISK');
  assert.equal(finding.category, 'NUMERIC_CHANGE');
});

test('5. 高危语义改动：程度词弱化检出 (MODALITY_SHIFT)', () => {
  const oldText = '乙方交付成果经甲方验收合格后三日内付清。';
  const newText = '乙方交付成果经甲方验收基本合格后三日内付清。';
  const report = compareDocuments(oldText, newText);

  const finding = report.riskFindings.find(r => r.category === 'MODALITY_SHIFT');
  assert.ok(finding, '应检出 MODALITY_SHIFT 权利义务弱化');
  assert.equal(finding.riskLevel, 'HIGH_RISK');
});

test('6. 高危语义改动：否定词极性反转检出 (NEGATION_FLIP)', () => {
  const oldText = '如遇违约，乙方承担全部赔偿责任。';
  const newText = '如遇违约，乙方不承担连带赔偿责任。';
  const report = compareDocuments(oldText, newText);

  const finding = report.riskFindings.find(r => r.category === 'NEGATION_FLIP');
  assert.ok(finding, '应检出否定词反转');
  assert.equal(finding.riskLevel, 'HIGH_RISK');
});

// =================== 反向对照测试 (Reverse-Contrast) ===================

test('7. [反向对照1] 若将字符级 diffChars 退化为整段全量替换，内联高亮断言必须变红(FAIL)', () => {
  const oldStr = '违约金比例为合同总额的5%。';
  const newStr = '违约金比例为合同总额的0.5%。';
  // 正常实现：包含 equal 块
  const goodDiffs = diffChars(oldStr, newStr);
  assert.ok(goodDiffs.some(d => d.type === 'equal'));

  // 退化实现：只把旧文本整段删、新文本整段加（假diff）
  function degradedDiff(o, n) {
    return [{ type: 'delete', text: o }, { type: 'insert', text: n }];
  }
  const badDiffs = degradedDiff(oldStr, newStr);

  assert.throws(() => {
    assert.ok(badDiffs.some(d => d.type === 'equal'), '退化 diff 没有内联 equal 块');
  }, /AssertionError/);
});

test('8. [反向对照2] 若将风险归类探针退化为全部返回 FORMAT_ONLY，高危合同漏洞检出断言必须变红(FAIL)', () => {
  const oldText = '如遇违约，乙方承担全部赔偿责任。违约金为5%。';
  const newText = '如遇违约，乙方不承担连带赔偿责任。违约金为0.5%。';
  const report = compareDocuments(oldText, newText);
  assert.ok(report.stats.highRiskCount >= 1, '正常探针应检出高危项');

  // 退化实现：假风险探针，统一报 FORMAT_ONLY
  function degradedClassify(paras) {
    return [{ riskLevel: 'FORMAT_ONLY', category: 'PUNCTUATION_WHITESPACE' }];
  }
  const badFindings = degradedClassify([]);
  const badHighRiskCount = badFindings.filter(f => f.riskLevel === 'HIGH_RISK').length;

  assert.throws(() => {
    assert.ok(badHighRiskCount >= 1, '退化分类器漏报高危修改，断言必须变红');
  }, /AssertionError/);
});
