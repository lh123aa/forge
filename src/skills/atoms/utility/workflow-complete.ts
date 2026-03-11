// workflow-complete.skill - 工作流完成 Skill
// 标记工作流完成并生成总结

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('WorkflowCompleteSkill');

/**
 * 工作流完成 Skill
 * 负责标记工作流完成并生成总结信息
 */
export class WorkflowCompleteSkill extends BaseSkill {
  readonly meta = {
    name: 'workflow-complete',
    description: '标记工作流完成并生成阶段总结',
    category: 'utility' as const,
    version: '1.0.0',
    tags: ['workflow', 'complete', 'finish', 'summary'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { stage, reason } = input.task.params as { 
      stage?: string; 
      reason?: string;
    };

    logger.info('Workflow completing', { stage, reason });

    const context = input.context.writable;
    
    // 生成完成摘要
    const summary = {
      traceId: input.traceId,
      completedAt: new Date().toISOString(),
      stage: stage || 'unknown',
      reason: reason || 'normal_completion',
      
      // 统计信息
      stats: {
        demandReportGenerated: !!context.demandReport,
        tasksPlanned: !!(context.taskDecomposition || context.executionPlan),
        codeGenerated: !!(context.generatedFiles && (context.generatedFiles as string[]).length > 0),
        testsPassed: context.testResults ? true : false,
      },
      
      // 从只读上下文获取的信息
      contextSummary: {
        projectType: context.projectType,
        hasDemandReport: !!context.demandReportMarkdown,
        hasExecutionPlan: !!context.executionPlan,
      },
    };

    // 生成完成消息
    const completionMessage = this.generateCompletionMessage(summary);

    logger.info('Workflow completed', { stage, traceId: input.traceId });

    return this.success({
      ...summary,
      completionMessage,
      workflowStatus: 'completed',
    }, completionMessage);
  }

  /**
   * 生成完成消息
   */
  private generateCompletionMessage(summary: Record<string, unknown>): string {
    const stage = summary.stage as string;
    const stats = summary.stats as Record<string, boolean>;

    switch (stage) {
      case 'demand':
        return '需求分析阶段已完成';
      case 'planning':
        return '任务规划阶段已完成';
      case 'code':
      case 'code-generation':
        return '代码生成阶段已完成';
      case 'test':
        return '测试阶段已完成';
      case 'delivery':
        return '交付阶段已完成';
      default:
        if (stats.codeGenerated) {
          return '开发流程已完成';
        }
        return '工作流已完成';
    }
  }
}

// 导出实例
export default new WorkflowCompleteSkill();
