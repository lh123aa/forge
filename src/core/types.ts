// Forge 核心类型定义
// 扩展现有 AIOS 类型系统，添加三系统整合相关类型

import type { Workflow, SkillInput, SkillOutput, KnowledgeEntry } from '../types/index.js';

// ==================== 技能来源枚举 ====================

export enum SkillSource {
  AIOS = 'aios',
  GSTACK = 'gstack',
  MINIMAX = 'minimax',
}

// ==================== 路由相关类型 ====================

/**
 * 工作流阶段
 */
export type WorkflowPhase = 'demand' | 'architecture' | 'implement' | 'review' | 'qa' | 'ship';

/**
 * 技术领域
 */
export type TechDomain = 'frontend' | 'backend' | 'mobile' | 'fullstack' | 'document' | 'media' | 'unknown';

/**
 * 复杂度等级
 */
export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * 技能路由决策上下文
 */
export interface RoutingContext {
  phase: WorkflowPhase;
  techStack?: string;
  domain?: TechDomain;
  complexity?: ComplexityLevel;
  hasBrowser?: boolean;
  /** 原始用户输入 */
  originalInput?: string;
  /** 是否有明确技术栈 */
  hasExplicitTechStack?: boolean;
}

/**
 * 路由决策结果
 */
export interface RoutingResult {
  source: SkillSource;
  skill: string;
  invokeType: 'llm' | 'mcp' | 'direct';
  args?: Record<string, unknown>;
  confidence: number;  // 0-1，置信度
  reason?: string;
}

/**
 * 路由规则条件
 */
export type RoutingCondition = (ctx: RoutingContext) => boolean;

/**
 * 路由规则
 */
export interface RoutingRule {
  phase: WorkflowPhase;
  condition: RoutingCondition;
  result: Omit<RoutingResult, 'confidence' | 'reason'>;
  priority: number;  // 优先级，数字越大优先级越高
}

// ==================== 外部技能相关类型 ====================

/**
 * 外部技能调用结果
 */
export interface ExternalSkillResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 外部技能元信息
 */
export interface ExternalSkillMeta {
  name: string;
  source: SkillSource;
  path: string;
  description: string;
  skills: string[];  // 该模块包含的技能列表
}

// ==================== Forge 工作流类型 ====================

/**
 * Forge 工作流步骤（带来源信息）
 */
export interface ForgeWorkflowStep {
  skill: string;
  source: SkillSource;
  invokeType: 'llm' | 'mcp' | 'direct';
  onSuccess?: string | null;
  onFail?: string | null;
  retry?: number;
  params?: Record<string, unknown>;
  required?: boolean;  // 是否必需
}

/**
 * Forge 工作流定义
 */
export interface ForgeWorkflow extends Omit<Workflow, 'steps'> {
  type: WorkflowPhase;
  skills: Array<{
    name: string;
    source: SkillSource;
    invokeType: 'llm' | 'mcp' | 'direct';
    required?: boolean;
  }>;
  steps: ForgeWorkflowStep[];
}

/**
 * 工作流上下文
 */
export interface WorkflowContext {
  routingContext: RoutingContext;
  currentPhase: WorkflowPhase;
  previousResults: Map<string, SkillOutput>;
  sharedData: Record<string, unknown>;
}

// ==================== 自我迭代相关类型 ====================

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
  target: string;           // skill 名或 workflow 名
  description: string;
  expectedImprovement: string;
  implementationHint: string;
  autoApplicable: boolean;  // 是否可自动应用
  createdAt: number;
}

/**
 * 生成的 Skill 元信息
 */
export interface GeneratedSkillMeta {
  name: string;
  description: string;
  pattern: string;         // 识别到的模式
  triggerCount: number;    // 触发次数
  generatedAt: number;
  author: 'SelfIterationEngine';
  version: string;
  parentSkills: string[];  // 组成该技能的父技能列表
}

/**
 * 执行路径
 */
export interface ExecutionPath {
  steps: string[];
  frequency: number;  // 出现频率
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

// ==================== MCP 工具相关类型 ====================

/**
 * Forge MCP 工具参数
 */
export interface ForgeRouteParams {
  phase: WorkflowPhase;
  techStack?: string;
  domain?: TechDomain;
  complexity?: ComplexityLevel;
  hasBrowser?: boolean;
}

export interface ForgeInvokeSkillParams {
  source: 'aios' | 'gstack' | 'minimax';
  skill: string;
  args?: Record<string, unknown>;
}

// ==================== 知识桥接相关类型 ====================

/**
 * 知识同步结果
 */
export interface KnowledgeSyncResult {
  synced: number;
  skipped: number;
  failed: number;
  errors: string[];
}

// ==================== 工具函数 ====================

/**
 * 判断是否为空
 */
export function isSkillSource(val: unknown): val is SkillSource {
  return Object.values(SkillSource).includes(val as SkillSource);
}

/**
 * 获取技能来源标签
 */
export function getSourceTag(source: SkillSource): string {
  const tags: Record<SkillSource, string> = {
    [SkillSource.AIOS]: 'AIOS',
    [SkillSource.GSTACK]: 'GStack',
    [SkillSource.MINIMAX]: 'MiniMax',
  };
  return tags[source];
}
