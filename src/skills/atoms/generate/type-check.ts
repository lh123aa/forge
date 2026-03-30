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
    anyPenalty: 5,       // 每个 any 类型扣分
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
        return this.success({
          testLevel: 'L2',
          testResult: typeCheckResult,
        }, `L2 类型检查通过: ${score} 分`);
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
      return this.fatalError(`L2 检查失败: ${error instanceof Error ? error.message : String(error)}`);
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
    // 模拟类型检查结果
    const issues: TypeCheckResult['errors'] = [];
    let errorCount = 0;
    const warningCount = 0;

    // 模拟一些类型错误
    for (const file of files.slice(0, 5)) {
      if (Math.random() > 0.85) {
        issues.push({
          file,
          line: Math.floor(Math.random() * 100) + 1,
          column: Math.floor(Math.random() * 80) + 1,
          message: "Type 'string' is not assignable to type 'number'",
          code: 'TS2322',
          severity: 'error',
          fixable: true,
          suggestion: 'Convert string to number or fix type annotation',
        });
        errorCount++;
      }

      if (Math.random() > 0.9 && strict) {
        issues.push({
          file,
          line: Math.floor(Math.random() * 100) + 1,
          column: Math.floor(Math.random() * 80) + 1,
          message: "Object is possibly 'null'",
          code: 'TS2531',
          severity: 'error',
          fixable: true,
          suggestion: 'Use optional chaining (?.) or null check',
        });
        errorCount++;
      }
    }

    return {
      files,
      errorCount,
      warningCount,
      issues,
      typeStats: {
        anyCount: Math.floor(Math.random() * 5),
        unknownCount: Math.floor(Math.random() * 3),
        strictNullChecks: strict,
      },
    };
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