// list-templates.skill.ts - 列出可用模板

import { BaseSkill } from '../../base.skill.js';
import { TemplateManager, type TemplateItem } from '../../../utils/template-manager.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

/**
 * 模板列表 Skill
 * 列出所有可用的代码模板
 */
export class ListTemplatesSkill extends BaseSkill {
  readonly meta = {
    name: 'list-templates',
    description: '列出所有可用的代码模板',
    category: 'utility' as const,
    version: '1.0.0',
    tags: ['template', 'list', 'code'],
  };

  private templateManager: TemplateManager;

  constructor() {
    super();
    this.templateManager = new TemplateManager();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as { type?: string; framework?: string; search?: string };

    try {
      await this.templateManager.initialize();

      let templates;

      // 根据参数过滤
      if (params.search) {
        templates = this.templateManager.search(params.search);
      } else if (params.type) {
        templates = this.templateManager.getByType(params.type as 'page' | 'component' | 'api' | 'service' | 'model');
      } else if (params.framework) {
        templates = this.templateManager.getByFramework(params.framework);
      } else {
        templates = this.templateManager.getAll();
      }

      // 转换为简洁格式
      const templateList = templates.map((t: TemplateItem) => ({
        name: t.meta.name,
        type: t.meta.type,
        language: t.meta.language,
        framework: t.meta.framework,
        description: t.meta.description,
        tags: t.meta.tags,
        variableCount: t.meta.variables.length,
      }));

      return this.success({
        total: templateList.length,
        templates: templateList,
      }, `找到 ${templateList.length} 个模板`);

    } catch (error) {
      return this.fatalError(`获取模板列表失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default new ListTemplatesSkill();
