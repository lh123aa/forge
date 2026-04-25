// SkillRouter - 技能路由决策器
// 根据上下文自动选择最合适的技能来源

import { SkillSource, type RoutingContext, type RoutingResult, type RoutingRule } from './types.js';
import { routingRules, inferDomain, inferComplexity, detectBrowserNeed } from './routing-rules.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SkillRouter');

/**
 * SkillRouter 类
 * 根据上下文自动路由到合适的技能
 */
export class SkillRouter {
  private rules: RoutingRule[];

  constructor(rules?: RoutingRule[]) {
    // 按优先级排序（从高到低）
    this.rules = (rules || routingRules).sort((a, b) => b.priority - a.priority);
  }

  /**
   * 根据上下文路由
   */
  route(context: RoutingContext): RoutingResult {
    // 推断缺失的上下文
    const ctx = this.enrichContext(context);

    // 查找匹配的规则
    const matchedRule = this.findMatchingRule(ctx);

    if (!matchedRule) {
      logger.warn('No matching rule found, using default', { context: ctx });
      return this.getDefaultResult(ctx);
    }

    const result: RoutingResult = {
      ...matchedRule.result,
      confidence: this.calculateConfidence(ctx, matchedRule),
      reason: this.buildReason(ctx, matchedRule),
    };

    logger.debug('Routing decision', {
      phase: ctx.phase,
      domain: ctx.domain,
      result: `${result.source}/${result.skill}`,
      confidence: result.confidence,
    });

    return result;
  }

  /**
   * 批量路由（用于工作流多步骤）
   */
  routeBatch(contexts: RoutingContext[]): RoutingResult[] {
    return contexts.map(ctx => this.route(ctx));
  }

  /**
   * 检查是否需要外部技能
   */
  shouldDelegate(skill: string): boolean {
    // AIOS 核心技能不需要外部代理
    const aiosCoreSkills = [
      'demand-collect',
      'demand-analysis',
      'demand-confirm',
      'demand-clarify',
      'task-decompose',
      'task-plan',
      'task-confirm',
      'generate-code',
      'test-orchestrator',
      'code-review',
    ];

    if (aiosCoreSkills.includes(skill)) {
      return false;
    }

    return true;
  }

  /**
   * 获取指定阶段的所有可用路由
   */
  getAvailableRoutes(phase: RoutingContext['phase']): RoutingResult[] {
    const phaseRules = this.rules.filter(r => r.phase === phase);
    return phaseRules.map(rule => ({
      ...rule.result,
      confidence: rule.priority / 100,
      reason: `Phase ${phase} route`,
    }));
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    // 重新排序
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 移除指定规则
   */
  removeRule(phase: RoutingContext['phase'], skill: string): boolean {
    const index = this.rules.findIndex(
      r => r.phase === phase && r.result.skill === skill
    );
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  // ==================== 私有方法 ====================

  /**
   * 丰富上下文（推断缺失信息）
   */
  private enrichContext(context: RoutingContext): RoutingContext {
    const ctx = { ...context };

    // 推断 domain
    if (!ctx.domain || ctx.domain === 'unknown') {
      ctx.domain = inferDomain(ctx.originalInput || '', ctx.techStack);
    }

    // 推断复杂度
    if (!ctx.complexity) {
      ctx.complexity = inferComplexity(ctx.originalInput || '');
    }

    // 推断浏览器需求
    if (ctx.hasBrowser === undefined) {
      ctx.hasBrowser = detectBrowserNeed(ctx.originalInput || '');
    }

    return ctx;
  }

  /**
   * 查找匹配的规则
   */
  private findMatchingRule(ctx: RoutingContext): RoutingRule | null {
    for (const rule of this.rules) {
      if (rule.phase !== ctx.phase) continue;
      if (rule.condition(ctx)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(ctx: RoutingContext, rule: RoutingRule): number {
    let confidence = 0.5; // 基础置信度

    // 优先级加成
    confidence += Math.min(rule.priority / 100, 0.3);

    // 明确的 tech stack 加成
    if (ctx.hasExplicitTechStack) {
      confidence += 0.1;
    }

    // 明确的 domain 加成
    if (ctx.domain !== 'unknown') {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.99);
  }

  /**
   * 构建原因描述
   */
  private buildReason(ctx: RoutingContext, rule: RoutingRule): string {
    const reasons: string[] = [];

    if (ctx.phase) {
      reasons.push(`${ctx.phase} 阶段`);
    }

    if (ctx.domain && ctx.domain !== 'unknown') {
      reasons.push(`领域: ${ctx.domain}`);
    }

    if (ctx.complexity) {
      reasons.push(`复杂度: ${ctx.complexity}`);
    }

    if (ctx.hasBrowser) {
      reasons.push('需要浏览器');
    }

    return reasons.join(', ') || '默认路由';
  }

  /**
   * 获取默认结果
   */
  private getDefaultResult(ctx: RoutingContext): RoutingResult {
    return {
      source: SkillSource.AIOS,
      skill: 'generate-code',
      invokeType: 'direct',
      confidence: 0.3,
      reason: '默认路由，无匹配规则',
    };
  }
}

/**
 * 导出单例（全局使用同一个 router）
 */
let globalRouter: SkillRouter | null = null;

export function getSkillRouter(): SkillRouter {
  if (!globalRouter) {
    globalRouter = new SkillRouter();
  }
  return globalRouter;
}

export function resetSkillRouter(): void {
  globalRouter = null;
}
