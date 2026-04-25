// 自我迭代引擎类型定义

import type { SkillSource } from '../types.js';

// ==================== L2 主动优化类型 ====================

/**
 * 执行日志条目
 */
export interface ExecutionLogEntry {
  traceId: string;
  timestamp: number;
  workflowName: string;
  stepName: string;
  skillName: string;
  source: SkillSource;
  duration: number;           // 耗时 ms
  success: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  retryCount: number;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  totalExecutions: number;
  avgRetries: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
}

/**
 * 瓶颈信息
 */
export interface Bottleneck {
  stepName: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  id: string;
  type: 'performance' | 'reliability' | 'capability';
  priority: 'low' | 'medium' | 'high';
  target: string;
  description: string;
  expectedImprovement: string;
  implementationHint: string;
  autoApplicable: boolean;
  createdAt: number;
}

// ==================== L3 能力扩展类型 ====================

/**
 * 执行模式
 */
export interface Pattern {
  id: string;
  steps: string[];
  frequency: number;
  successRate: number;
  avgDuration: number;
}

/**
 * Skill 骨架
 */
export interface SkillSkeleton {
  name: string;
  description: string;
  steps: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/**
 * 生成的 Skill 元信息
 */
export interface GeneratedSkillMeta {
  name: string;
  description: string;
  pattern: string;
  triggerCount: number;
  generatedAt: number;
  author: 'SelfIterationEngine';
  version: string;
  parentSkills: string[];
}

// ==================== L4 工作流进化类型 ====================

/**
 * 执行路径
 */
export interface ExecutionPath {
  steps: string[];
  frequency: number;
  successRate: number;
  avgDuration: number;
}

/**
 * 优化点
 */
export interface OptimizationPoint {
  stepName: string;
  currentMetrics: PerformanceMetrics;
  optimizationType: 'merge' | 'parallel' | 'skip' | 'replace';
  estimatedImprovement: string;
}

/**
 * 工作流修改
 */
export interface WorkflowModification {
  type: 'add' | 'remove' | 'replace' | 'reorder';
  step: string;
  newStep?: string;
  position?: number;
}

/**
 * 进化结果
 */
export interface EvolveResult {
  original: string;
  evolved: string;
  modifications: WorkflowModification[];
  estimatedImprovement: string;
  requiresApproval: boolean;
}

// ==================== 迭代状态类型 ====================

/**
 * 迭代状态
 */
export interface IterationStatus {
  lastIteration: number | null;
  totalIterations: number;
  pendingSuggestions: number;
  appliedSuggestions: number;
  generatedSkills: number;
  evolvedWorkflows: number;
  errors: string[];
}

/**
 * 迭代结果
 */
export interface IterationResult {
  success: boolean;
  optimizations: OptimizationSuggestion[];
  generatedSkills: GeneratedSkillMeta[];
  evolvedWorkflows: string[];
  errors: string[];
  duration: number;
}
