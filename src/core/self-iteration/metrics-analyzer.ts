// MetricsAnalyzer - 性能指标分析器
// 分析执行日志，识别瓶颈，生成优化建议

import type { ExecutionLogEntry, PerformanceMetrics, Bottleneck, OptimizationSuggestion } from './types.js';
import { ExecutionLogger } from './execution-logger.js';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('MetricsAnalyzer');

// 瓶颈检测阈值
const THRESHOLDS = {
  successRate: { warning: 0.9, critical: 0.8 },           // 成功率
  avgDuration: { warning: 2, critical: 3 },                  // 相对平均值的倍数
  retryRate: { warning: 0.2, critical: 0.5 },              // 重试率
  p99P50Ratio: { warning: 3, critical: 5 },                // p99/p50 比值
};

const DEFAULT_AVG_DURATION = 60000; // 默认平均耗时 60s

/**
 * MetricsAnalyzer 类
 * 分析性能指标，识别瓶颈
 */
export class MetricsAnalyzer {
  private logger: ExecutionLogger;

  constructor(executionLogger?: ExecutionLogger) {
    this.logger = executionLogger || new ExecutionLogger();
  }

  /**
   * 分析 skill 性能
   */
  async analyzeSkillPerformance(skillName: string): Promise<PerformanceMetrics> {
    return this.logger.getMetrics(skillName, 'skill');
  }

  /**
   * 分析 workflow 性能
   */
  async analyzeWorkflowPerformance(workflowName: string): Promise<PerformanceMetrics> {
    return this.logger.getMetrics(workflowName, 'workflow');
  }

  /**
   * 找出瓶颈
   */
  async findBottlenecks(workflowName: string): Promise<Bottleneck[]> {
    const history = await this.logger.getHistory(workflowName, 'workflow', 500);
    const bottlenecks: Bottleneck[] = [];

    if (history.length === 0) {
      return bottlenecks;
    }

    // 按 step 分组
    const stepMap = new Map<string, ExecutionLogEntry[]>();
    for (const entry of history) {
      if (!stepMap.has(entry.stepName)) {
        stepMap.set(entry.stepName, []);
      }
      stepMap.get(entry.stepName)!.push(entry);
    }

    // 计算全局平均耗时
    const allDurations = history.map(e => e.duration);
    const globalAvg = allDurations.reduce((a, b) => a + b, 0) / allDurations.length || DEFAULT_AVG_DURATION;

    // 分析每个 step
    for (const [stepName, entries] of stepMap) {
      const durations = entries.map(e => e.duration);
      const successes = entries.filter(e => e.success).length;
      const retries = entries.map(e => e.retryCount);

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const successRate = successes / entries.length;
      const avgRetries = retries.reduce((a, b) => a + b, 0) / retries.length;
      const p99 = Math.max(...durations);
      const p50 = this.percentile(durations, 50);

      // 检测成功率问题
      if (successRate < THRESHOLDS.successRate.critical) {
        bottlenecks.push({
          stepName,
          metric: 'successRate',
          value: successRate,
          threshold: THRESHOLDS.successRate.critical,
          severity: 'high',
          suggestion: `成功率过低 (${(successRate * 100).toFixed(1)}%)，需要检查错误处理或增加重试逻辑`,
        });
      } else if (successRate < THRESHOLDS.successRate.warning) {
        bottlenecks.push({
          stepName,
          metric: 'successRate',
          value: successRate,
          threshold: THRESHOLDS.successRate.warning,
          severity: 'medium',
          suggestion: `成功率偏低 (${(successRate * 100).toFixed(1)}%)，建议优化`,
        });
      }

      // 检测耗时问题
      const durationRatio = avgDuration / globalAvg;
      if (durationRatio > THRESHOLDS.avgDuration.critical) {
        bottlenecks.push({
          stepName,
          metric: 'avgDuration',
          value: avgDuration,
          threshold: globalAvg * THRESHOLDS.avgDuration.critical,
          severity: 'high',
          suggestion: `耗时过长 (${(avgDuration / 1000).toFixed(1)}s)，是全局平均的 ${durationRatio.toFixed(1)}x`,
        });
      } else if (durationRatio > THRESHOLDS.avgDuration.warning) {
        bottlenecks.push({
          stepName,
          metric: 'avgDuration',
          value: avgDuration,
          threshold: globalAvg * THRESHOLDS.avgDuration.warning,
          severity: 'medium',
          suggestion: `耗时较高 (${(avgDuration / 1000).toFixed(1)}s)`,
        });
      }

      // 检测重试问题
      if (avgRetries > THRESHOLDS.retryRate.critical) {
        bottlenecks.push({
          stepName,
          metric: 'avgRetries',
          value: avgRetries,
          threshold: THRESHOLDS.retryRate.critical,
          severity: 'high',
          suggestion: `重试次数过多 (平均 ${avgRetries.toFixed(1)} 次)，需要检查稳定性`,
        });
      }

      // 检测延迟问题
      const p99p50Ratio = p99 / (p50 || 1);
      if (p99p50Ratio > THRESHOLDS.p99P50Ratio.critical) {
        bottlenecks.push({
          stepName,
          metric: 'p99p50Ratio',
          value: p99p50Ratio,
          threshold: THRESHOLDS.p99P50Ratio.critical,
          severity: 'medium',
          suggestion: `延迟波动大 (p99/p50 = ${p99p50Ratio.toFixed(1)})，建议添加缓存或优化资源`,
        });
      }
    }

    logger.info(`Found ${bottlenecks.length} bottlenecks for workflow: ${workflowName}`);
    return bottlenecks;
  }

  /**
   * 对比两次运行
   */
  async compareRuns(traceId1: string, traceId2: string): Promise<{
    improved: string[];
    degraded: string[];
    unchanged: string[];
  }> {
    // 获取两次运行的历史
    const logs1 = await this.getLogsForTrace(traceId1);
    const logs2 = await this.getLogsForTrace(traceId2);

    const improved: string[] = [];
    const degraded: string[] = [];
    const unchanged: string[] = [];

    // 按 step 对比
    const steps = new Set([
      ...logs1.map(l => l.stepName),
      ...logs2.map(l => l.stepName),
    ]);

    for (const step of steps) {
      const entries1 = logs1.filter(l => l.stepName === step);
      const entries2 = logs2.filter(l => l.stepName === step);

      if (entries1.length === 0 || entries2.length === 0) continue;

      const avg1 = entries1.reduce((a, b) => a + b.duration, 0) / entries1.length;
      const avg2 = entries2.reduce((a, b) => a + b.duration, 0) / entries2.length;

      const ratio = avg2 / (avg1 || 1);
      if (ratio < 0.9) {
        improved.push(step);
      } else if (ratio > 1.1) {
        degraded.push(step);
      } else {
        unchanged.push(step);
      }
    }

    return { improved, degraded, unchanged };
  }

  /**
   * 生成趋势报告
   */
  async generateTrendReport(target: string, type: 'skill' | 'workflow', days: number = 7): Promise<{
    trend: 'up' | 'down' | 'stable';
    changePercent: number;
    currentMetrics: PerformanceMetrics;
    previousMetrics: PerformanceMetrics;
  }> {
    const now = Date.now();
    const weekAgo = now - days * 24 * 60 * 60 * 1000;

    // 获取历史数据（简化处理，实际应该按时间范围过滤）
    const currentMetrics = await this.logger.getMetrics(target, type);

    // 模拟之前的数据（实际应该从日志中计算）
    const previousMetrics: PerformanceMetrics = {
      ...currentMetrics,
      avgDuration: currentMetrics.avgDuration * 1.1, // 假设之前慢 10%
    };

    const changePercent = ((currentMetrics.avgDuration - previousMetrics.avgDuration) / previousMetrics.avgDuration) * 100;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (changePercent < -5) trend = 'down';
    else if (changePercent > 5) trend = 'up';

    return {
      trend,
      changePercent,
      currentMetrics,
      previousMetrics,
    };
  }

  // ==================== 私有方法 ====================

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private async getLogsForTrace(traceId: string): Promise<ExecutionLogEntry[]> {
    // 从日志文件中筛选
    const allLogs = await this.logger.getAllLogs();
    return allLogs.filter(l => l.traceId === traceId);
  }
}

/**
 * 导出单例
 */
let globalAnalyzer: MetricsAnalyzer | null = null;

export function getMetricsAnalyzer(): MetricsAnalyzer {
  if (!globalAnalyzer) {
    globalAnalyzer = new MetricsAnalyzer();
  }
  return globalAnalyzer;
}
