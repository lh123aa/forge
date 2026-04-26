// format-code.skill - 格式化代码

import { BaseSkill } from '../../../skills/base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

/**
 * 格式化代码 Skill
 * 格式化代码（这里只是简单实现，实际可集成 Prettier）
 */
export class FormatCodeSkill extends BaseSkill {
  readonly meta = {
    name: 'format-code',
    description: '格式化代码',
    category: 'format' as const,
    version: '1.0.0',
    tags: ['format', 'prettier', 'lint', 'style'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { 
      code,        // 代码
      language,    // 语言
      maxLineLength = 100, // 最大行长度
    } = input.task.params as {
      code?: string;
      language?: string;
      maxLineLength?: number;
    };

    if (!code) {
      return this.fatalError('缺少代码 code 参数');
    }

    // 简单格式化（实际应该用 Prettier）
    const formattedCode = this.formatCode(code, maxLineLength);

    return this.success({
      originalCode: code,
      formattedCode,
      language,
      originalLines: code.split('\n').length,
      formattedLines: formattedCode.split('\n').length,
    }, '代码格式化完成');
  }

  /**
   * 格式化代码（简化版）
   */
  private formatCode(code: string, _maxLineLength: number): string {
    // 移除多余空白
    let formatted = code
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n');

    // 移除连续空行
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted;
  }
}

// 导出实例
export default new FormatCodeSkill();
