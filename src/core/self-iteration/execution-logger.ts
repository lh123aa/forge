// ExecutionLogger - 执行日志采集器
// 记录每次 workflow 执行的详细日志

import { promises as fs } from 'fs';
import path from 'path';
import type { ExecutionLogEntry, PerformanceMetrics } from './types.js';
import type { SkillSource } from '../types.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ExecutionLogger');

/**
 * ExecutionLogger 类
 * 负责记录和查询执行日志
 */
export class ExecutionLogger {
  private logDir: string;
  private cache: Map<string, ExecutionLogEntry[]>;

  constructor(logDir?: string) {
    this.logDir = logDir || this.getDefaultLogDir();
    this.cache = new Map();
  }

  /**
   * 记录单个执行步骤
   */
  async logStep(entry: ExecutionLogEntry): Promise<void> {
    // 更新缓存
    const key = entry.workflowName;
    if (!this.cache.has(key)) {
      this.cache.set(key, []);
    }
    this.cache.get(key)!.push(entry);

    // 保存到文件
    const monthKey = this.getMonthKey(entry.timestamp);
    const filePath = path.join(this.logDir, `${monthKey}.json`);

    // 追加到文件
    await this.appendToFile(filePath, entry);

    logger.debug(`Logged step: ${entry.workflowName}/${entry.stepName}`, {
      duration: entry.duration,
      success: entry.success,
    });
  }

  /**
   * 获取指定 skill/workflow 的执行历史
   */
  async getHistory(
    target: string,
    type: 'skill' | 'workflow',
    limit: number = 100
  ): Promise<ExecutionLogEntry[]> {
    const entries: ExecutionLogEntry[] = [];

    if (type === 'skill') {
      // 从缓存和文件中查找
      for (const cached of this.cache.values()) {
        for (const entry of cached) {
          if (entry.skillName === target) {
            entries.push(entry);
          }
        }
      }
    } else {
      // 按 workflow 查找
      const cached = this.cache.get(target);
      if (cached) {
        entries.push(...cached);
      }
    }

    // 按时间排序，返回最新的
    entries.sort((a, b) => b.timestamp - a.timestamp);
    return entries.slice(0, limit);
  }

  /**
   * 获取性能统计
   */
  async getMetrics(
    target: string,
    type: 'skill' | 'workflow'
  ): Promise<PerformanceMetrics> {
    const history = await this.getHistory(target, type, 1000);

    if (history.length === 0) {
      return {
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        successRate: 0,
        totalExecutions: 0,
        avgRetries: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
      };
    }

    const durations = history.map(e => e.duration);
    const successes = history.filter(e => e.success).length;
    const retries = history.map(e => e.retryCount);

    return {
      avgDuration: this.average(durations),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successes / history.length,
      totalExecutions: history.length,
      avgRetries: this.average(retries),
      p50Duration: this.percentile(durations, 50),
      p95Duration: this.percentile(durations, 95),
      p99Duration: this.percentile(durations, 99),
    };
  }

  /**
   * 获取所有记录
   */
  async getAllLogs(monthKey?: string): Promise<ExecutionLogEntry[]> {
    const targetKey = monthKey || this.getMonthKey(Date.now());
    const filePath = path.join(this.logDir, `${targetKey}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      return lines.map(line => JSON.parse(line) as ExecutionLogEntry);
    } catch {
      return [];
    }
  }

  /**
   * 清除旧日志
   */
  async cleanup(daysToKeep: number = 30): Promise<number> {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const files = await fs.readdir(this.logDir);
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.logDir, file);
      const stats = await fs.stat(filePath);

      if (stats.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        deleted++;
      }
    }

    logger.info(`Cleaned up ${deleted} old log files`);
    return deleted;
  }

  // ==================== 私有方法 ====================

  private getDefaultLogDir(): string {
    return path.join(process.cwd(), 'data', 'self-iteration', 'logs');
  }

  private getMonthKey(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private async appendToFile(filePath: string, entry: ExecutionLogEntry): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * 导出单例
 */
let globalLogger: ExecutionLogger | null = null;

export function getExecutionLogger(): ExecutionLogger {
  if (!globalLogger) {
    globalLogger = new ExecutionLogger();
  }
  return globalLogger;
}
