// SelfIterationEngine - 自我迭代引擎主类
// L2: 主动优化 | L3: 能力扩展 | L4: 工作流进化

import type {
  IterationStatus,
  IterationResult,
  OptimizationSuggestion,
  GeneratedSkillMeta,
  ExecutionLogEntry,
  Pattern,
  EvolveResult,
} from './types.js';
import type { Bottleneck } from './types.js';
import { ExecutionLogger } from './execution-logger.js';
import { MetricsAnalyzer } from './metrics-analyzer.js';
import { OptimizationGenerator } from './optimization-generator.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SelfIterationEngine');

/**
 * 触发模式
 */
type TriggerMode = 'manual' | 'auto' | 'scheduled';

/**
 * SelfIterationEngine 主类
 */
export class SelfIterationEngine {
  // L2 组件
  private executionLogger: ExecutionLogger;
  private metricsAnalyzer: MetricsAnalyzer;
  private optimizationGenerator: OptimizationGenerator;

  // L3 组件（简化版，不包含完整实现）
  private patternRecognizer: Map<string, Pattern>;

  // 状态
  private status: IterationStatus;
  private lastOptimizationTime: number = 0;

  // 配置
  private config: {
    autoOptimizeInterval: number;  // 自动优化间隔（ms）
    patternThreshold: number;      // 模式识别阈值
    maxSuggestions: number;        // 最大建议数
  };

  constructor() {
    this.executionLogger = new ExecutionLogger();
    this.metricsAnalyzer = new MetricsAnalyzer(this.executionLogger);
    this.optimizationGenerator = new OptimizationGenerator();
    this.patternRecognizer = new Map();

    this.status = {
      lastIteration: null,
      totalIterations: 0,
      pendingSuggestions: 0,
      appliedSuggestions: 0,
      generatedSkills: 0,
      evolvedWorkflows: 0,
      errors: [],
    };

    this.config = {
      autoOptimizeInterval: 60 * 60 * 1000,  // 1 小时
      patternThreshold: 3,                      // 3 次触发
      maxSuggestions: 10,
    };
  }

  // ==================== L2: 主动优化 ====================

  /**
   * 执行主动优化
   */
  async optimize(mode: TriggerMode = 'manual'): Promise<IterationResult> {
    const startTime = Date.now();
    logger.info(`Starting self-iteration (mode: ${mode})`);

    const optimizations: OptimizationSuggestion[] = [];
    const errors: string[] = [];
    let limitedOptimizations: OptimizationSuggestion[] = [];

    try {
      // 1. 收集最近的执行日志
      const recentLogs = await this.collectRecentLogs();

      if (recentLogs.length === 0) {
        logger.info('No execution logs found, skipping iteration');
        return {
          success: true,
          optimizations: [],
          generatedSkills: [],
          evolvedWorkflows: [],
          errors: [],
          duration: Date.now() - startTime,
        };
      }

      // 2. 按 workflow 分组分析
      const workflowMap = this.groupByWorkflow(recentLogs);

      for (const [workflowName, _entries] of workflowMap) {
        try {
          // 3. 找出瓶颈
          const bottlenecks = await this.metricsAnalyzer.findBottlenecks(workflowName);

          // 4. 生成优化建议
          const metrics = await this.metricsAnalyzer.analyzeWorkflowPerformance(workflowName);
          const suggestions = this.optimizationGenerator.generateSuggestions(metrics, bottlenecks);
          optimizations.push(...suggestions);

        } catch (error) {
          errors.push(`Failed to analyze ${workflowName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 5. 限制建议数量
      limitedOptimizations = optimizations.slice(0, this.config.maxSuggestions);

      // 6. 更新状态
      this.status.lastIteration = Date.now();
      this.status.totalIterations++;
      this.status.pendingSuggestions = limitedOptimizations.length;
      this.lastOptimizationTime = Date.now();

      logger.info(`Self-iteration complete: ${limitedOptimizations.length} suggestions generated`);

    } catch (error) {
      logger.error('Self-iteration failed', { error });
      errors.push(`Iteration failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      success: errors.length === 0,
      optimizations: limitedOptimizations,
      generatedSkills: [],
      evolvedWorkflows: [],
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 分析单次运行
   */
  async analyzeRun(traceId: string): Promise<{
    metrics: Record<string, unknown>;
    bottlenecks: unknown[];
    suggestions: OptimizationSuggestion[];
  }> {
    const logs = await this.getLogsForTrace(traceId);
    const workflowName = logs[0]?.workflowName || 'unknown';

    const [metrics, bottlenecks] = await Promise.all([
      this.metricsAnalyzer.analyzeWorkflowPerformance(workflowName),
      this.metricsAnalyzer.findBottlenecks(workflowName),
    ]);

    const suggestions = this.optimizationGenerator.generateSuggestions(
      metrics,
      bottlenecks as Bottleneck[]
    );

    return {
      metrics: metrics as unknown as Record<string, unknown>,
      bottlenecks,
      suggestions,
    };
  }

  // ==================== L3: 能力扩展 ====================

  /**
   * 生成新 Skill（基于识别的模式）
   */
  async generateSkill(patternId: string): Promise<GeneratedSkillMeta | null> {
    const pattern = this.patternRecognizer.get(patternId);
    if (!pattern) {
      logger.warn(`Pattern not found: ${patternId}`);
      return null;
    }

    if (pattern.frequency < this.config.patternThreshold) {
      logger.info(`Pattern frequency (${pattern.frequency}) below threshold`);
      return null;
    }

    // 生成 Skill 元信息
    const meta: GeneratedSkillMeta = {
      name: `auto-${pattern.steps.join('-')}`,
      description: `Auto-generated skill from pattern: ${pattern.steps.join(' -> ')}`,
      pattern: pattern.steps.join(' + '),
      triggerCount: pattern.frequency,
      generatedAt: Date.now(),
      author: 'SelfIterationEngine',
      version: '1.0.0',
      parentSkills: pattern.steps,
    };

    this.status.generatedSkills++;
    logger.info(`Generated skill: ${meta.name}`);

    return meta;
  }

  // ==================== L4: 工作流进化 ====================

  /**
   * 优化工作流
   */
  async evolveWorkflow(workflowName: string): Promise<EvolveResult | null> {
    await this.metricsAnalyzer.analyzeWorkflowPerformance(workflowName);
    const bottlenecks = await this.metricsAnalyzer.findBottlenecks(workflowName);

    if (bottlenecks.length === 0) {
      logger.info(`No bottlenecks found for workflow: ${workflowName}`);
      return null;
    }

    // 简单的工作流进化逻辑
    const modifications: Array<{ type: 'replace'; step: string; suggestion: string }> = [];

    for (const bottleneck of bottlenecks) {
      if (bottleneck.severity === 'high') {
        modifications.push({
          type: 'replace',
          step: bottleneck.stepName,
          suggestion: bottleneck.suggestion,
        });
      }
    }

    const result: EvolveResult = {
      original: workflowName,
      evolved: `${workflowName}-evolved`,
      modifications,
      estimatedImprovement: 'Reduce failure rate and improve performance',
      requiresApproval: true,
    };

    this.status.evolvedWorkflows++;
    logger.info(`Evolved workflow: ${workflowName} -> ${result.evolved}`);

    return result;
  }

  // ==================== 记录和状态 ====================

  /**
   * 记录执行步骤
   */
  async logExecution(entry: Omit<ExecutionLogEntry, 'timestamp'>): Promise<void> {
    await this.executionLogger.logStep({
      ...entry,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取迭代状态
   */
  getStatus(): IterationStatus {
    return { ...this.status };
  }

  /**
   * 检查是否应该自动优化
   */
  shouldAutoOptimize(): boolean {
    if (this.lastOptimizationTime === 0) return true;
    return Date.now() - this.lastOptimizationTime > this.config.autoOptimizeInterval;
  }

  /**
   * 应用优化建议
   */
  async applySuggestion(suggestionId: string): Promise<boolean> {
    // 简化实现，实际应该将建议应用到代码
    logger.info(`Applying suggestion: ${suggestionId}`);
    this.status.appliedSuggestions++;
    this.status.pendingSuggestions = Math.max(0, this.status.pendingSuggestions - 1);
    return true;
  }

  // ==================== 私有方法 ====================

  private async collectRecentLogs(): Promise<ExecutionLogEntry[]> {
    const logs = await this.executionLogger.getAllLogs();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return logs.filter(l => l.timestamp > weekAgo);
  }

  private groupByWorkflow(logs: ExecutionLogEntry[]): Map<string, ExecutionLogEntry[]> {
    const map = new Map<string, ExecutionLogEntry[]>();

    for (const log of logs) {
      if (!map.has(log.workflowName)) {
        map.set(log.workflowName, []);
      }
      map.get(log.workflowName)!.push(log);
    }

    return map;
  }

  private async getLogsForTrace(traceId: string): Promise<ExecutionLogEntry[]> {
    const allLogs = await this.executionLogger.getAllLogs();
    return allLogs.filter(l => l.traceId === traceId);
  }
}

/**
 * 导出单例
 */
let globalEngine: SelfIterationEngine | null = null;

export function getSelfIterationEngine(): SelfIterationEngine {
  if (!globalEngine) {
    globalEngine = new SelfIterationEngine();
  }
  return globalEngine;
}
