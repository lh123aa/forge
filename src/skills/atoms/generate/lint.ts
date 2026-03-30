// lint.skill - 代码质量检查 (L1)
// 返回结构化评分，支持自动修复

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('LintSkill');

/**
 * Lint 结果
 */
interface LintResult {
  level: 'L1';
  name: string;
  passed: boolean;
  score: number; // 0-100
  duration: number;
  summary: {
    fileCount: number;
    errorCount: number;
    warningCount: number;
    fixableCount: number;
  };
  errors: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    rule: string;
    severity: 'error' | 'warning';
    fixable: boolean;
    fix?: string;
  }>;
  rules: {
    passed: string[];
    failed: string[];
  };
}

/**
 * 代码质量检查 Skill
 * ESLint 代码规范检查，返回结构化评分
 */
export class LintSkill extends BaseSkill {
  readonly meta = {
    name: 'lint',
    description: 'L1 语法检查 - ESLint 代码规范检查',
    category: 'generate' as const,
    version: '2.0.0',
    tags: ['lint', 'eslint', 'code-quality', 'L1'],
  };

  // 评分规则
  private readonly scoring = {
    errorPenalty: 20, // 每个错误扣分
    warningPenalty: 5, // 每个警告扣分
    maxPenalty: 100, // 最大扣分
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as {
      files?: string[];
      fix?: boolean;
      maxWarnings?: number;
    };

    const { files = ['src/**/*.ts'], fix = false, maxWarnings = 10 } = params;

    logger.info('Starting L1 lint check', { files, fix });

    try {
      const startTime = Date.now();

      // 执行 lint 检查
      const result = await this.runLint(files, fix);

      const duration = Date.now() - startTime;

      // 计算评分
      const score = this.calculateScore(result);

      // 构建结构化结果
      const lintResult: LintResult = {
        level: 'L1',
        name: '语法检查',
        passed: result.errorCount === 0 && result.warningCount <= maxWarnings,
        score,
        duration,
        summary: {
          fileCount: result.files.length,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
          fixableCount: result.fixableCount,
        },
        errors: result.issues,
        rules: {
          passed: result.passedRules,
          failed: result.failedRules,
        },
      };

      if (lintResult.passed) {
        return this.success(
          {
            testLevel: 'L1',
            testResult: lintResult,
          },
          `L1 语法检查通过: ${score} 分`
        );
      } else {
        return {
          code: 400,
          data: {
            testLevel: 'L1',
            testResult: lintResult,
          },
          message: `[${this.meta.name}] L1 检查未通过: ${result.errorCount} 错误, ${result.warningCount} 警告`,
        };
      }
    } catch (error) {
      logger.error('Lint check failed', { error });
      return this.fatalError(
        `L1 检查失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行 lint 检查
   */
  private async runLint(
    files: string[],
    fix: boolean
  ): Promise<{
    files: string[];
    errorCount: number;
    warningCount: number;
    fixableCount: number;
    issues: LintResult['errors'];
    passedRules: string[];
    failedRules: string[];
  }> {
    const { spawn } = await import('child_process');
    const issues: LintResult['errors'] = [];
    let errorCount = 0;
    let warningCount = 0;
    let fixableCount = 0;

    const allRules = ['no-console', 'no-unused-vars', 'prefer-const', 'eqeqeq', 'curly'];

    try {
      // 构建 eslint 参数
      const args = [
        ...files.flatMap((f) => ['--ext', '.ts', f]),
        '--format',
        'json',
        '--no-error-on-unmatched-pattern',
      ];

      if (fix) {
        args.push('--fix');
      }

      const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
        (resolve) => {
          const proc = spawn('npx', ['eslint', ...args], { shell: true });
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

      // 解析 ESLint JSON 输出
      if (result.stdout) {
        try {
          const eslintResults = JSON.parse(result.stdout);
          for (const fileResult of eslintResults) {
            for (const msg of fileResult.messages || []) {
              const severity = msg.severity === 2 ? 'error' : 'warning';
              issues.push({
                file: fileResult.filePath,
                line: msg.line,
                column: msg.column,
                message: msg.message,
                rule: msg.ruleId || 'unknown',
                severity,
                fixable: !!msg.fix,
                fix: msg.fix ? msg.fix.text : undefined,
              });

              if (severity === 'error') errorCount++;
              else warningCount++;
              if (msg.fix) fixableCount++;
            }
          }
        } catch {
          logger.warn('Failed to parse ESLint JSON output');
        }
      }
    } catch (error) {
      logger.warn('ESLint not available', { error });
    }

    const failedRules = [...new Set(issues.map((i) => i.rule).filter(Boolean))];
    const passedRules = allRules.filter((r) => !failedRules.includes(r));

    return {
      files,
      errorCount,
      warningCount,
      fixableCount,
      issues,
      passedRules,
      failedRules,
    };
  }

  /**
   * 计算评分
   */
  private calculateScore(result: { errorCount: number; warningCount: number }): number {
    const { errorPenalty, warningPenalty, maxPenalty } = this.scoring;
    const penalty = Math.min(
      result.errorCount * errorPenalty + result.warningCount * warningPenalty,
      maxPenalty
    );
    return Math.max(0, 100 - penalty);
  }
}

// 导出实例
export default new LintSkill();
