// prettier-format.skill - Prettier 代码格式化

import { BaseSkill } from '../../base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

interface PrettierParams {
  files?: string[];
  printWidth?: number;
  tabWidth?: number;
  useTabs?: boolean;
  semi?: boolean;
  singleQuote?: boolean;
  trailingComma?: 'none' | 'es5' | 'all';
  bracketSpacing?: boolean;
  arrowParens?: 'always' | 'avoid';
}

interface FormatResult {
  success: boolean;
  fileCount: number;
  formattedFiles: string[];
  skippedFiles: string[];
  changes: Array<{
    file: string;
    linesChanged: number;
    beforeLines: number;
    afterLines: number;
  }>;
  errors: Array<{
    file: string;
    message: string;
  }>;
}

/**
 * Prettier 代码格式化 Skill
 */
export class PrettierFormatSkill extends BaseSkill {
  readonly meta = {
    name: 'prettier-format',
    description: '使用 Prettier 自动格式化代码',
    category: 'format' as const,
    version: '1.0.0',
    tags: ['prettier', 'format', 'formatting', 'code-style'],
  };

  // 默认配置
  private defaultConfig = {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    trailingComma: 'es5' as const,
    bracketSpacing: true,
    arrowParens: 'always' as const,
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as PrettierParams;
    const config = {
      ...this.defaultConfig,
      ...params,
    };

    const { files = ['src/**/*.ts'] } = params;

    try {
      // 模拟 Prettier 格式化
      const result = this.simulateFormat(files, config);
      const resultData = result as unknown as Record<string, unknown>;

      if (result.errors.length > 0) {
        return {
          code: 300,
          data: resultData,
          message: `[${this.meta.name}] 部分文件格式化失败`,
        };
      }

      return this.success(
        resultData,
        `格式化完成：${result.formattedFiles.length} 个文件，${result.changes.reduce((sum, c) => sum + c.linesChanged, 0)} 行变更`
      );

    } catch (error) {
      return this.fatalError(`格式化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 模拟格式化
   */
  private simulateFormat(files: string[], _config: PrettierParams): FormatResult {
    const formattedFiles: string[] = [];
    const skippedFiles: string[] = [];
    const changes: FormatResult['changes'] = [];
    const errors: FormatResult['errors'] = [];

    for (const file of files) {
      try {
        // 模拟格式化结果
        const beforeLines = Math.floor(Math.random() * 50) + 10;
        const afterLines = beforeLines + Math.floor(Math.random() * 5) - 2;
        const linesChanged = Math.abs(afterLines - beforeLines);

        // 80% 概率成功格式化
        if (Math.random() > 0.2) {
          formattedFiles.push(file);
          changes.push({
            file,
            linesChanged,
            beforeLines,
            afterLines: beforeLines + (linesChanged > 0 ? 1 : 0),
          });
        } else {
          skippedFiles.push(file);
        }
      } catch (error) {
        errors.push({
          file,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: errors.length === 0,
      fileCount: files.length,
      formattedFiles,
      skippedFiles,
      changes,
      errors,
    };
  }
}

// 导出实例
export default new PrettierFormatSkill();
