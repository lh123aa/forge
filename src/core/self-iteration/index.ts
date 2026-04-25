// 自我迭代引擎模块导出

// 类型 - 使用类型别名避免冲突
export type { ExecutionLogEntry as SIExecutionLogEntry } from './types.js';
export type { PerformanceMetrics as SIPerformanceMetrics } from './types.js';
export type { Bottleneck as SIBottleneck } from './types.js';
export type { OptimizationSuggestion as SIOptimizationSuggestion } from './types.js';
export type { GeneratedSkillMeta as SIGeneratedSkillMeta } from './types.js';
export type { Pattern as SIPattern } from './types.js';
export type { SkillSkeleton as SISkillSkeleton } from './types.js';
export type { ExecutionPath as SIExecutionPath } from './types.js';
export type { OptimizationPoint as SIOptimizationPoint } from './types.js';
export type { WorkflowModification as SIWorkflowModification } from './types.js';
export type { EvolveResult as SIEvolveResult } from './types.js';
export type { IterationStatus as SIIterationStatus } from './types.js';
export type { IterationResult as SIIterationResult } from './types.js';

export { ExecutionLogger, getExecutionLogger } from './execution-logger.js';
export { MetricsAnalyzer, getMetricsAnalyzer } from './metrics-analyzer.js';
export { OptimizationGenerator, getOptimizationGenerator } from './optimization-generator.js';
export { SelfIterationEngine, getSelfIterationEngine } from './engine.js';
