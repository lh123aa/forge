// manual-fix-required.skill - 人工修复请求 Skill
// 当自动修复达到最大次数时，请求人工介入

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('ManualFixRequiredSkill');

/**
 * 人工修复请求 Skill
 * 当自动化流程无法继续时，暂停并请求人工介入
 */
export class ManualFixRequiredSkill extends BaseSkill {
  readonly meta = {
    name: 'manual-fix-required',
    description: '当自动修复达到最大次数时，暂停并请求人工介入',
    category: 'utility' as const,
    version: '1.0.0',
    tags: ['manual', 'intervention', 'fix', 'pause'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { 
      prompt, 
      reason, 
      failedStep, 
      attempts,
      errorDetails 
    } = input.task.params as {
      prompt?: string;
      reason?: string;
      failedStep?: string;
      attempts?: number;
      errorDetails?: string;
    };

    const context = input.context.writable;

    logger.warn('Manual fix required', { 
      reason, 
      failedStep, 
      attempts,
      traceId: input.traceId 
    });

    // 收集需要人工处理的信息
    const manualFixInfo = {
      requiresManualIntervention: true,
      reason: reason || '自动修复已达到最大次数',
      
      // 失败上下文
      context: {
        failedStep: failedStep || 'unknown',
        attempts: attempts || 0,
        errorDetails: errorDetails || null,
        lastTestResults: context.testResults || null,
        generatedFiles: context.generatedFiles || [],
      },
      
      // 建议的人工操作
      suggestedActions: this.generateSuggestedActions(reason, context),
      
      // 提示消息
      prompt: prompt || '自动修复已达到最大次数，需要人工介入处理',
      
      // 时间戳
      timestamp: new Date().toISOString(),
    };

    // 返回需要用户输入的状态
    return this.needInput(manualFixInfo, manualFixInfo.prompt);
  }

  /**
   * 生成建议的人工操作
   */
  private generateSuggestedActions(
    reason?: string, 
    context?: Record<string, unknown>
  ): string[] {
    const actions: string[] = [];

    // 根据失败原因生成建议
    if (reason?.includes('test') || reason?.includes('测试')) {
      actions.push('检查测试用例是否正确');
      actions.push('查看测试失败的具体原因');
      actions.push('手动修复代码中的问题');
    }

    if (reason?.includes('compile') || reason?.includes('编译')) {
      actions.push('检查类型定义是否正确');
      actions.push('修复语法错误');
      actions.push('确保依赖已正确安装');
    }

    if (reason?.includes('lint') || reason?.includes('格式')) {
      actions.push('运行 npm run lint:fix 自动修复');
      actions.push('手动调整代码格式');
    }

    // 通用建议
    if (actions.length === 0) {
      actions.push('检查生成的代码是否符合预期');
      actions.push('查看错误日志了解具体问题');
      actions.push('手动修复发现的问题');
      actions.push('重新运行测试验证修复');
    }

    actions.push('修复完成后，可以继续工作流或重新运行');

    return actions;
  }
}

// 导出实例
export default new ManualFixRequiredSkill();
