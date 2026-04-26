// unit-test.skill - 单元测试 (L3)
// 返回结构化评分，包含覆盖率统计

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('UnitTestSkill');

/**
 * 单元测试结果
 */
interface UnitTestResult {
  level: 'L3';
  name: string;
  passed: boolean;
  score: number; // 0-100
  duration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    coverage: number; // 百分比
  };
  errors: Array<{
    testName: string;
    file: string;
    message: string;
    fixable: boolean;
  }>;
  coverageDetails?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
}

/**
 * 单元测试 Skill
 * 执行单元测试，返回结构化评分
 */
export class UnitTestSkill extends BaseSkill {
  readonly meta = {
    name: 'unit-test',
    description: 'L3 单元测试 - 函数/模块单元测试',
    category: 'generate' as const,
    version: '2.0.0',
    tags: ['test', 'unit', 'jest', 'L3'],
  };

  // 评分规则
  private readonly scoring = {
    failedTestPenalty: 15,
    coverageTarget: 80, // 目标覆盖率
    coveragePenalty: 1, // 每低于目标1%扣分
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as {
      code?: string;
      testFile?: string;
      coverage?: boolean;
    };

    const { coverage = true } = params;

    logger.info('Starting L3 unit tests', { coverage });

    try {
      const startTime = Date.now();

      // 执行测试
      const result = await this.runTests(coverage);

      const duration = Date.now() - startTime;

      // 计算评分
      const score = this.calculateScore(result);

      // 构建结构化结果
      const testResult: UnitTestResult = {
        level: 'L3',
        name: '单元测试',
        passed: result.failed === 0,
        score,
        duration,
        summary: {
          total: result.total,
          passed: result.passed,
          failed: result.failed,
          skipped: result.skipped,
          coverage: result.coverage,
        },
        errors: result.failures,
        coverageDetails: result.coverageDetails,
      };

      if (testResult.passed) {
        return this.success(
          {
            testLevel: 'L3',
            testResult: testResult,
          },
          `L3 单元测试通过: ${score} 分，覆盖率 ${result.coverage}%`
        );
      } else {
        return {
          code: 400,
          data: {
            testLevel: 'L3',
            testResult: testResult,
          },
          message: `[${this.meta.name}] L3 测试未通过: ${result.failed}/${result.total} 失败`,
        };
      }
    } catch (error) {
      logger.error('Unit test failed', { error });
      return this.fatalError(
        `L3 测试失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 执行测试
   */
  private async runTests(withCoverage: boolean): Promise<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    coverage: number;
    failures: UnitTestResult['errors'];
    coverageDetails?: UnitTestResult['coverageDetails'];
  }> {
    const { spawn } = await import('child_process');

    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let coverage = 0;
    const failures: UnitTestResult['errors'] = [];
    let coverageDetails: UnitTestResult['coverageDetails'] | undefined;

    try {
      // 构建 jest 参数
      const args = ['--passWithNoTests', '--json'];

      if (withCoverage) {
        args.push('--coverage', '--coverageReporters', 'json', '--coverageThreshold', '{}');
      }

      const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
        (resolve) => {
          const proc = spawn('npx', ['jest', ...args], { shell: true, timeout: 120000 });
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

      // 解析 Jest JSON 输出
      if (result.stdout) {
        try {
          const jestOutput = JSON.parse(result.stdout);

          total = jestOutput.numTotalTests || 0;
          passed = jestOutput.numPassedTests || 0;
          failed = jestOutput.numFailedTests || 0;
          skipped = jestOutput.numPendingTests || 0;

          // 解析失败的测试
          for (const test of jestOutput.testResults || []) {
            for (const assertion of test.assertionResults || []) {
              if (assertion.status === 'failed') {
                failures.push({
                  testName: assertion.fullName,
                  file: test.name,
                  message: assertion.failureMessages?.join('\n') || 'Test failed',
                  fixable: false,
                });
              }
            }
          }

          // 解析覆盖率
          if (withCoverage && jestOutput.coverageMap) {
            const coverageMap = jestOutput.coverageMap;
            let stmtTotal = 0,
              stmtCovered = 0;
            let branchTotal = 0,
              branchCovered = 0;
            let fnTotal = 0,
              fnCovered = 0;
            let linesTotal = 0,
              linesCovered = 0;

            for (const file of Object.values(coverageMap || {}) as Array<{ s?: { total?: number; covered?: number }; b?: { total?: number; covered?: number }; fn?: { total?: number; covered?: number }; lines?: { total?: number; covered?: number } }>) {
              stmtTotal += file.s?.total || 0;
              stmtCovered += file.s?.covered || 0;
              branchTotal += file.b?.total || 0;
              branchCovered += file.b?.covered || 0;
              fnTotal += file.fn?.total || 0;
              fnCovered += file.fn?.covered || 0;
              linesTotal += file.lines?.total || 0;
              linesCovered += file.lines?.covered || 0;
            }

            coverageDetails = {
              statements: stmtTotal > 0 ? Math.round((stmtCovered / stmtTotal) * 100) : 0,
              branches: branchTotal > 0 ? Math.round((branchCovered / branchTotal) * 100) : 0,
              functions: fnTotal > 0 ? Math.round((fnCovered / fnTotal) * 100) : 0,
              lines: linesTotal > 0 ? Math.round((linesCovered / linesTotal) * 100) : 0,
            };

            coverage = Math.round(
              (coverageDetails.statements +
                coverageDetails.branches +
                coverageDetails.functions +
                coverageDetails.lines) /
                4
            );
          }
        } catch {
          logger.warn('Failed to parse Jest JSON output');
        }
      }
    } catch (error) {
      logger.warn('Jest not available', { error });
    }

    return {
      total,
      passed,
      failed,
      skipped,
      coverage,
      failures,
      coverageDetails,
    };
  }

  /**
   * 计算评分
   */
  private calculateScore(result: { failed: number; coverage: number }): number {
    const { failedTestPenalty, coverageTarget, coveragePenalty } = this.scoring;

    let score = 100;

    // 扣除失败测试分
    score -= result.failed * failedTestPenalty;

    // 扣除覆盖率不足分
    if (result.coverage < coverageTarget) {
      score -= (coverageTarget - result.coverage) * coveragePenalty;
    }

    return Math.max(0, Math.min(100, score));
  }
}

// 导出实例
export default new UnitTestSkill();
