// delivery.skill - 交付 Skill
// 完成开发流程的最终交付阶段

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('DeliverySkill');

/**
 * 交付 Skill
 * 负责最终交付阶段的处理：
 * - 生成交付清单
 * - 整理项目文件
 * - 生成使用说明
 */
export class DeliverySkill extends BaseSkill {
  readonly meta = {
    name: 'delivery',
    description: '完成开发流程的最终交付，生成交付清单和使用说明',
    category: 'utility' as const,
    version: '1.0.0',
    tags: ['delivery', 'complete', 'finalize', 'handover'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { stage } = input.task.params as { stage?: string };
    const context = input.context.writable;

    logger.info('Starting delivery process', { stage });

    try {
      // 收集交付信息
      const deliveryInfo = {
        traceId: input.traceId,
        stage: stage || 'complete',
        timestamp: new Date().toISOString(),
        
        // 从上下文收集信息
        projectType: context.projectType || 'unknown',
        demandReport: context.demandReport || null,
        demandReportMarkdown: context.demandReportMarkdown || null,
        taskDecomposition: context.taskDecomposition || null,
        executionPlan: context.executionPlan || null,
        generatedFiles: context.generatedFiles || [],
        
        // 交付清单
        deliverables: this.generateDeliverables(context),
        
        // 使用说明
        usageInstructions: this.generateUsageInstructions(context),
        
        // 下一步建议
        nextSteps: [
          '检查生成的文件是否符合预期',
          '运行测试确保功能正常',
          '根据需要进行手动调整',
          '部署到目标环境',
        ],
      };

      logger.info('Delivery completed', { 
        deliverablesCount: deliveryInfo.deliverables.length 
      });

      return this.success({
        ...deliveryInfo,
        deliveryComplete: true,
      }, '交付完成');

    } catch (error) {
      logger.error('Delivery failed', { error });
      return this.fatalError(`交付失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成交付清单
   */
  private generateDeliverables(context: Record<string, unknown>): Array<{ type: string; name: string; description: string }> {
    const deliverables: Array<{ type: string; name: string; description: string }> = [];

    // 需求文档
    if (context.demandReportMarkdown) {
      deliverables.push({
        type: 'document',
        name: '需求分析报告',
        description: '完整的需求分析和功能规格说明',
      });
    }

    // 任务规划
    if (context.executionPlan) {
      deliverables.push({
        type: 'document',
        name: '执行计划',
        description: '开发任务分解和执行计划',
      });
    }

    // 生成的代码文件
    const generatedFiles = (context.generatedFiles as string[]) || [];
    for (const file of generatedFiles) {
      deliverables.push({
        type: 'code',
        name: file,
        description: '生成的代码文件',
      });
    }

    // 如果没有生成文件，添加占位符
    if (deliverables.length === 0) {
      deliverables.push({
        type: 'info',
        name: '项目已完成',
        description: '开发流程已成功完成',
      });
    }

    return deliverables;
  }

  /**
   * 生成使用说明
   */
  private generateUsageInstructions(context: Record<string, unknown>): string[] {
    const instructions: string[] = [];
    const projectType = context.projectType as string;

    switch (projectType) {
      case 'page':
        instructions.push('1. 在浏览器中打开生成的 HTML/页面文件');
        instructions.push('2. 根据需要调整样式和交互');
        instructions.push('3. 确保所有依赖已安装');
        break;
      case 'api':
        instructions.push('1. 启动服务: npm run dev 或 npm start');
        instructions.push('2. 测试 API 端点');
        instructions.push('3. 根据需要调整配置');
        break;
      case 'component':
        instructions.push('1. 在项目中导入组件');
        instructions.push('2. 根据需要传递 props');
        instructions.push('3. 调整样式以匹配项目风格');
        break;
      case 'project':
        instructions.push('1. 安装依赖: npm install');
        instructions.push('2. 配置环境变量');
        instructions.push('3. 启动开发服务器');
        break;
      default:
        instructions.push('1. 检查生成的文件');
        instructions.push('2. 根据需要进行调整');
    }

    return instructions;
  }
}

// 导出实例
export default new DeliverySkill();
