export type ParagraphStatus = "UNCHANGED" | "MODIFIED" | "ADDED" | "REMOVED";

export interface CharDiffOp {
  type: "equal" | "insert" | "delete";
  text: string;
}

export interface AlignedParagraphItem {
  status: ParagraphStatus;
  oldIndex: number | null;
  newIndex: number | null;
  oldParagraph: string;
  newParagraph: string;
  similarity: number;
  charDiffs?: CharDiffOp[];
}

export type RiskLevel = "HIGH_RISK" | "MEDIUM_RISK" | "FORMAT_ONLY";
export type RiskCategory = "NUMERIC_CHANGE" | "NEGATION_FLIP" | "MODALITY_SHIFT" | "CONTENT_EDIT" | "PUNCTUATION_WHITESPACE";

export interface RiskFinding {
  paragraphIdx: number;
  riskLevel: RiskLevel;
  category: RiskCategory;
  beforeSnippet: string;
  afterSnippet: string;
  explanation: string;
}

export interface DocumentDiffStats {
  totalAligned: number;
  unchangedCount: number;
  modifiedCount: number;
  addedCount: number;
  removedCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  formatOnlyCount: number;
}

export interface DocumentDiffReport {
  paragraphs: AlignedParagraphItem[];
  riskFindings: RiskFinding[];
  stats: DocumentDiffStats;
}

export declare function calcJaccardSimilarity(str1: string, str2: string): number;
export declare function alignParagraphs(oldText: string, newText: string): AlignedParagraphItem[];
export declare function diffChars(oldStr: string, newStr: string): CharDiffOp[];
export declare function classifyRiskChanges(alignedParagraphs: AlignedParagraphItem[]): RiskFinding[];
export declare function compareDocuments(oldText: string, newText: string): DocumentDiffReport;
