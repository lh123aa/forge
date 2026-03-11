// save-demand.skill - 保存需求 Skill
// 将采集的需求保存到上下文和存储

import { BaseSkill } from '../../base.skill.js';
import { FileStorage } from '../../../storage/index.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('SaveDemandSkill');

/**
 * 保存需求 Skill
 * 负责将采集的需求保存到存储中
 */
export class SaveDemandSkill extends BaseSkill {
  readonly meta = {
    name: 'save-demand',
    description: '保存采集的需求到存储',
    category: 'utility' as const,
    version: '1.0.0',
    tags: ['save', 'demand', 'persist', 'storage'],
  };

  private storage: FileStorage;

  constructor() {
    super();
    this.storage = new FileStorage();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const context = input.context.writable;
    const collectedDemand = context.collectedDemand as Record<string, unknown> | undefined;
    const clarifiedAnswers = context.clarifiedAnswers as Record<string, unknown> | undefined;

    if (!collectedDemand && !clarifiedAnswers) {
      return this.fatalError('没有可保存的需求数据');
    }

    try {
      // 合并需求数据
      const demandData = {
        traceId: input.traceId,
        timestamp: new Date().toISOString(),
        projectType: context.projectType,
        initialDemand: context.initialDemand,
        collectedDemand: collectedDemand || null,
        clarifiedAnswers: clarifiedAnswers || null,
        mergedDemand: {
          ...collectedDemand,
          answers: {
            ...(collectedDemand?.answers || {}),
            ...(clarifiedAnswers || {}),
          },
        },
      };

      // 保存到存储
      const savePath = `demands/${input.traceId}/demand.json`;
      await this.storage.save(savePath, demandData);

      logger.info('Demand saved', { 
        traceId: input.traceId, 
        savePath 
      });

      return this.success({
        saved: true,
        savePath,
        demandData,
        message: '需求已保存',
      }, '需求保存成功');

    } catch (error) {
      logger.error('Failed to save demand', { error });
      return this.fatalError(`保存需求失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// 导出实例
export default new SaveDemandSkill();
