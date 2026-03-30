// type-check.skill - TypeScript 类型检查 (L2)
// 返回结构化评分，支持自动修复建议

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('TypeCheckSkill');

/**
 * 类型检查结果
 */
interface TypeCheckResult {
  level: 'L2';
  name: string;
  passed: boolean;
  score: number; // 0-100
  duration: number;
  summary: {
    fileCount: number;
    errorCount: number;
    warningCount: number;
  };
  errors: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    code: string;
    severity: 'error' | 'warning';
    fixable: boolean;
    suggestion?: string;
  }>;
  typeStats?: {
    anyCount: number;
    unknownCount: number;
    strictNullChecks: boolean;
  };
}

/**
 * TypeScript 类型检查 Skill
 * 返回结构化评分
 */
export class TypeCheckSkill extends BaseSkill {
  readonly meta = {
    name: 'type-check',
    description: 'L2 类型检查 - TypeScript 类型安全检查',
    category: 'generate' as const,
    version: '2.0.0',
    tags: ['typescript', 'type', 'check', 'L2'],
  };

  // 评分规则
  private readonly scoring = {
    errorPenalty: 25,
    warningPenalty: 10,
    anyPenalty: 5, // 每个 any 类型扣分
    maxPenalty: 100,
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as {
      files?: string[];
      project?: string;
      strict?: boolean;
    };

    const { files = ['src/**/*.ts'], project = './tsconfig.json', strict = true } = params;

    logger.info('Starting L2 type check', { files, project, strict });

    try {
      const startTime = Date.now();

      // 执行类型检查
      const result = await this.runTypeCheck(files, project, strict);

      const duration = Date.now() - startTime;

      // 计算评分
      const score = this.calculateScore(result);

      // 构建结构化结果
      const typeCheckResult: TypeCheckResult = {
        level: 'L2',
        name: '类型检查',
        passed: result.errorCount === 0,
        score,
        duration,
        summary: {
          fileCount: result.files.length,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
        },
        errors: result.issues,
        typeStats: result.typeStats,
      };

      if (typeCheckResult.passed) {
        return this.success(
          {
            testLevel: 'L2',
            testResult: typeCheckResult,
          },
          `L2 类型检查通过: ${score} 分`
        );
      } else {
        return {
          code: 400,
          data: {
            testLevel: 'L2',
            testResult: typeCheckResult,
          },
          message: `[${this.meta.name}] L2 检查未通过: ${result.errorCount} 个类型错误`,
        };
      }
    } catch (error) {
      logger.error('Type check failed', { error });
      return this.fatalError(
        `L2 检查失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行类型检查
   */
  private async runTypeCheck(
    files: string[],
    _project: string,
    strict: boolean
  ): Promise<{
    files: string[];
    errorCount: number;
    warningCount: number;
    issues: TypeCheckResult['errors'];
    typeStats: {
      anyCount: number;
      unknownCount: number;
      strictNullChecks: boolean;
    };
  }> {
    const { spawn } = await import('child_process');
    const { readFile } = await import('fs/promises');
    const issues: TypeCheckResult['errors'] = [];
    let errorCount = 0;
    const warningCount = 0;
    let anyCount = 0;
    let unknownCount = 0;

    try {
      // 运行 tsc --noEmit 获取类型错误
      const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
        (resolve) => {
          const proc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], { shell: true });
          let stdout = '';
          let stderr = '';

          proc.stdout?.on('data', (data) => {
            stdout += data.toString();
          });
          proc.stderr?.on('data', (data) => {
            stderr += data.toString();
          });
          proc.on('close', (code) => resolve({ stdout, stderr, code: code || 0 }));
          proc.on('error', (err) => resolve({ stdout: '', stderr: err.message, code: 1 }));
        }
      );

      // 解析 tsc 输出格式: file(line,col): error TS1234: message
      const output = result.stdout + result.stderr;
      const errorRegex = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
      let match;

      while ((match = errorRegex.exec(output)) !== null) {
        const [, file, line, column, code, message] = match;
        issues.push({
          file,
          line: parseInt(line, 10),
          column: parseInt(column, 10),
          message,
          code,
          severity: 'error',
          fixable: false,
          suggestion: this.getSuggestionForCode(code),
        });
        errorCount++;
      }

      // 统计 any 和 unknown 使用次数
      for (const file of files.slice(0, 20)) {
        try {
          const content = await readFile(file, 'utf-8');
          const anyMatches = content.match(/:\s*any\b/g);
          const unknownMatches = content.match(/:\s*unknown\b/g);
          anyCount += anyMatches?.length || 0;
          unknownCount += unknownMatches?.length || 0;
        } catch {
          // 文件读取失败，忽略
        }
      }
    } catch (error) {
      logger.warn('TypeScript not available', { error });
    }

    return {
      files,
      errorCount,
      warningCount,
      issues,
      typeStats: {
        anyCount,
        unknownCount,
        strictNullChecks: strict,
      },
    };
  }

  /**
   * 根据错误代码获取修复建议
   */
  private getSuggestionForCode(code: string): string {
    const suggestions: Record<string, string> = {
      TS2322: '检查类型注解，确保类型匹配',
      TS2339: '属性不存在于类型上，检查是否拼写错误',
      TS2531: '对象可能为 null，使用可选链 (?.) 或空检查',
      TS2532: '对象可能为 undefined，添加 undefined 检查',
      TS2345: '参数类型不匹配，检查函数调用参数',
      TS7006: '需要为箭头函数参数指定类型',
    };
    return suggestions[code] || '查看 TypeScript 错误文档';
  }

  /**
   * 计算评分
   */
  private calculateScore(result: {
    errorCount: number;
    warningCount: number;
    typeStats?: { anyCount: number };
  }): number {
    const { errorPenalty, warningPenalty, anyPenalty, maxPenalty } = this.scoring;
    const anyCount = result.typeStats?.anyCount || 0;
    const penalty = Math.min(
      result.errorCount * errorPenalty +
        result.warningCount * warningPenalty +
        anyCount * anyPenalty,
      maxPenalty
    );
    return Math.max(0, 100 - penalty);
  }
}

// 导出实例
export default new TypeCheckSkill();
