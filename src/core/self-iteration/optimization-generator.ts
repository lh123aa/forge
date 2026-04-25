// OptimizationGenerator - 优化建议生成器
// 基于瓶颈分析生成优化建议

import type { Bottleneck, OptimizationSuggestion, PerformanceMetrics } from './types.js';
import { KnowledgeBase } from '../../knowledge/base.js';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('OptimizationGenerator');

/**
 * OptimizationGenerator 类
 * 将瓶颈分析结果转换为优化建议
 */
export class OptimizationGenerator {
  private knowledgeBase: KnowledgeBase | null;

  constructor(knowledgeBase?: KnowledgeBase) {
    this.knowledgeBase = knowledgeBase || null;
  }

  /**
   * 生成优化建议
   */
  generateSuggestions(
    metrics: PerformanceMetrics,
    bottlenecks: Bottleneck[]
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    for (const bottleneck of bottlenecks) {
      const suggestion = this.createSuggestion(metrics, bottleneck);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    // 按优先级排序
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return suggestions;
  }

  /**
   * 将建议转换为知识库格式
   */
  toKnowledgeEntry(suggestion: OptimizationSuggestion): {
    topic: string;
    content: string;
    summary: string;
    keywords: string[];
    source: 'learned';
  } {
    return {
      topic: `[优化建议] ${suggestion.target}: ${suggestion.type}`,
      summary: `${suggestion.type}: ${suggestion.description}`,
      content: `
# 优化建议

## 目标
${suggestion.target}

## 类型
${suggestion.type}

## 优先级
${suggestion.priority}

## 问题描述
${suggestion.description}

## 期望改进
${suggestion.expectedImprovement}

## 实现提示
${suggestion.implementationHint}

---
ID: ${suggestion.id}
创建时间: ${new Date(suggestion.createdAt).toISOString()}
`,
      keywords: ['optimization', suggestion.type, suggestion.target, 'auto-generated'],
      source: 'learned' as const,
    };
  }

  /**
   * 检查建议是否已存在
   */
  async isDuplicate(suggestion: OptimizationSuggestion): Promise<boolean> {
    if (!this.knowledgeBase) return false;

    const existing = await this.knowledgeBase.search(suggestion.target);
    if (!existing) return false;

    // 检查内容相似度
    const similarity = this.calculateSimilarity(
      existing.content,
      suggestion.description
    );

    return similarity > 0.8;
  }

  /**
   * 保存建议到知识库
   */
  async saveToKnowledgeBase(suggestion: OptimizationSuggestion): Promise<void> {
    if (!this.knowledgeBase) {
      logger.warn('Knowledge base not available, skipping save');
      return;
    }

    const isDup = await this.isDuplicate(suggestion);
    if (isDup) {
      logger.debug(`Skipping duplicate suggestion: ${suggestion.id}`);
      return;
    }

    const entry = this.toKnowledgeEntry(suggestion);
    await this.knowledgeBase.add(entry);
    logger.info(`Saved optimization suggestion to knowledge base: ${suggestion.id}`);
  }

  // ==================== 私有方法 ====================

  private createSuggestion(
    metrics: PerformanceMetrics,
    bottleneck: Bottleneck
  ): OptimizationSuggestion | null {
    const { stepName, metric, value, severity } = bottleneck;

    switch (metric) {
      case 'successRate':
        return this.createReliabilitySuggestion(stepName, value, severity);

      case 'avgDuration':
        return this.createPerformanceSuggestion(stepName, value, metrics.avgDuration, severity);

      case 'avgRetries':
        return this.createReliabilitySuggestion(stepName, value, severity);

      case 'p99p50Ratio':
        return this.createPerformanceSuggestion(stepName, value, metrics.p50Duration, severity);

      default:
        return null;
    }
  }

  private createReliabilitySuggestion(
    stepName: string,
    value: number,
    severity: 'low' | 'medium' | 'high'
  ): OptimizationSuggestion {
    const isSuccessRate = value <= 1; // 成功率在 0-1 之间
    const displayValue = isSuccessRate ? `${(value * 100).toFixed(1)}%` : value.toFixed(1);

    return {
      id: uuidv4(),
      type: 'reliability',
      priority: severity,
      target: stepName,
      description: `${stepName} 的可靠性需要改进，当前${isSuccessRate ? '成功率' : '重试率'}: ${displayValue}`,
      expectedImprovement: isSuccessRate ? '将成功率提升到 90% 以上' : '将重试次数降低到平均 0.5 次以下',
      implementationHint: isSuccessRate
        ? '1. 检查错误日志找出失败原因\n2. 增加适当的重试逻辑\n3. 添加超时处理\n4. 考虑添加熔断机制'
        : '1. 分析重试的原因\n2. 增加错误预处理\n3. 检查依赖服务稳定性',
      autoApplicable: false,
      createdAt: Date.now(),
    };
  }

  private createPerformanceSuggestion(
    stepName: string,
    value: number,
    baseline: number,
    severity: 'low' | 'medium' | 'high'
  ): OptimizationSuggestion {
    const ratio = baseline > 0 ? value / baseline : 1;
    const isP99p50 = ratio > 10; // p99/p50 比值通常在 1-10 之间

    return {
      id: uuidv4(),
      type: 'performance',
      priority: severity,
      target: stepName,
      description: `${stepName} 的性能需要改进，当前值: ${(value / 1000).toFixed(1)}s${isP99p50 ? ` (p99/p50 = ${ratio.toFixed(1)})` : ''}`,
      expectedImprovement: `将平均耗时降低到 ${(baseline / 1000).toFixed(1)}s 以下`,
      implementationHint: '1. 添加缓存减少重复计算\n2. 考虑并行化处理\n3. 优化算法复杂度\n4. 减少不必要的 I/O 操作',
      autoApplicable: false,
      createdAt: Date.now(),
    };
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // 简单的相似度计算（杰卡德系数）
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

/**
 * 导出单例
 */
let globalGenerator: OptimizationGenerator | null = null;

export function getOptimizationGenerator(): OptimizationGenerator {
  if (!globalGenerator) {
    globalGenerator = new OptimizationGenerator();
  }
  return globalGenerator;
}
