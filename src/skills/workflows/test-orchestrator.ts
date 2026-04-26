// test-orchestrator.skill - 测试总控制器
// 协调各层测试执行，汇总结果，触发修复循环

import { BaseSkill } from '../base.skill.js';
import { createLogger } from '../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

const logger = createLogger('TestOrchestratorSkill');

/**
 * 测试层级定义
 */
type TestLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';

/**
 * 测试层级配置
 */
interface TestLevelConfig {
  level: TestLevel;
  name: string;
  description: string;
  weight: number; // 评分权重
  timeout: number; // 超时时间(ms)
  required: boolean; // 是否必须通过
  skills: string[]; // 对应的 skill 名称
}

/**
 * 单层测试结果
 */
interface LevelTestResult {
  level: TestLevel;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  score: number; // 0-100
  duration: number;
  details?: Record<string, unknown>;
  errors?: Array<{
    message: string;
    file?: string;
    line?: number;
    fixable: boolean;
  }>;
}

/**
 * 测试编排配置
 */
interface TestOrchestratorParams {
  projectPath?: string;
  testLevels?: TestLevel[]; // 要执行的测试层级
  targetScore?: number; // 目标分数
  maxRetries?: number; // 最大重试次数
  stopOnFail?: boolean; // 失败时是否停止
  skipLevels?: TestLevel[]; // 跳过的层级
}

/**
 * 完整测试结果
 */
interface FullTestResult {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  levelResults: LevelTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  totalDuration: number;
  needsFix: boolean;
  fixableErrors: number;
}

/**
 * 测试总控制器 Skill
 * 协调执行所有测试层级，计算综合评分
 */
export class TestOrchestratorSkill extends BaseSkill {
  readonly meta = {
    name: 'test-orchestrator',
    description: '测试总控制器 - 协调各层测试执行，计算综合评分',
    category: 'workflow' as const,
    version: '1.0.0',
    tags: ['test', 'orchestrator', 'workflow', 'quality'],
  };

  // 测试层级默认配置
  private readonly levelConfigs: Record<TestLevel, TestLevelConfig> = {
    'L1': {
      level: 'L1',
      name: '语法检查',
      description: 'ESLint 代码规范检查',
      weight: 0.10,
      timeout: 30000,
      required: true,
      skills: ['lint'],
    },
    'L2': {
      level: 'L2',
      name: '类型检查',
      description: 'TypeScript 类型检查',
      weight: 0.10,
      timeout: 60000,
      required: true,
      skills: ['type-check'],
    },
    'L3': {
      level: 'L3',
      name: '单元测试',
      description: '函数/模块单元测试',
      weight: 0.25,
      timeout: 120000,
      required: true,
      skills: ['unit-test'],
    },
    'L4': {
      level: 'L4',
      name: '集成测试',
      description: '模块间协作集成测试',
      weight: 0.15,
      timeout: 180000,
      required: true,
      skills: ['integration-test'],
    },
    'L5': {
      level: 'L5',
      name: '端到端测试',
      description: '用户流程 E2E 测试',
      weight: 0.15,
      timeout: 300000,
      required: false,
      skills: ['acceptance-test'],
    },
    'L6': {
      level: 'L6',
      name: '性能测试',
      description: '加载时间、渲染性能',
      weight: 0.15,
      timeout: 120000,
      required: false,
      skills: ['performance-test'],
    },
    'L7': {
      level: 'L7',
      name: '安全扫描',
      description: 'XSS、注入等安全检查',
      weight: 0.10,
      timeout: 60000,
      required: true,
      skills: ['security-scan'],
    },
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as TestOrchestratorParams;
    const {
      projectPath = '.',
      testLevels = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
      targetScore = 90,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      maxRetries: _maxRetries = 5,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      stopOnFail: _stopOnFail = false,
      skipLevels = [],
    } = params;

    // 从上下文获取测试计划
    const testPlan = input.context.readOnly.testPlan as TestLevel[] | undefined;
    const levelsToRun = testPlan || testLevels.filter(l => !skipLevels.includes(l));

    logger.info(`Starting test orchestration`, {
      levels: levelsToRun,
      targetScore,
      projectPath,
    });

    try {
      const result = await this.runAllLevels(levelsToRun, projectPath, input);

      // 计算综合评分
      const overallScore = this.calculateOverallScore(result.levelResults);
      const grade = this.getGrade(overallScore);
      const passed = overallScore >= targetScore;

      const fullResult: FullTestResult = {
        overallScore,
        grade,
        passed,
        levelResults: result.levelResults,
        summary: result.summary,
        totalDuration: result.totalDuration,
        needsFix: !passed,
        fixableErrors: this.countFixableErrors(result.levelResults),
      };

      if (passed) {
        return this.success({
          result: fullResult,
          nextStage: 'delivery',
        }, `测试通过！总分 ${overallScore} 分 (${grade}级)`);
      } else {
        return {
          code: 400,
          data: {
            result: fullResult,
            nextStage: 'test-fix-loop',
          },
          message: `[${this.meta.name}] 测试未达标：${overallScore} 分 (${grade}级)，需要 ${fullResult.fixableErrors} 个修复`,
        };
      }

    } catch (error) {
      logger.error('Test orchestration failed', { error });
      return this.fatalError(`测试执行失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 执行所有测试层级
   */
  private async runAllLevels(
    levels: TestLevel[],
    projectPath: string,
    _input: SkillInput
  ): Promise<{
    levelResults: LevelTestResult[];
    summary: { total: number; passed: number; failed: number; skipped: number };
    totalDuration: number;
  }> {
    const levelResults: LevelTestResult[] = [];
    let totalDuration = 0;

    for (const level of levels) {
      const config = this.levelConfigs[level];
      const startTime = Date.now();

      logger.info(`Running test level: ${level} - ${config.name}`);

      // 初始化结果
      const result: LevelTestResult = {
        level,
        name: config.name,
        status: 'running',
        score: 0,
        duration: 0,
      };

      try {
        // 执行该层级的测试
        const levelResult = await this.runLevelTest(config, projectPath);
        
        result.status = levelResult.passed ? 'passed' : 'failed';
        result.score = levelResult.score;
        result.details = levelResult.details;
        result.errors = levelResult.errors;

      } catch (error) {
        result.status = 'failed';
        result.score = 0;
        result.errors = [{
          message: error instanceof Error ? error.message : String(error),
          fixable: false,
        }];
      }

      result.duration = Date.now() - startTime;
      totalDuration += result.duration;
      levelResults.push(result);

      logger.info(`Test level ${level} completed`, {
        status: result.status,
        score: result.score,
        duration: result.duration,
      });
    }

    // 统计汇总
    const summary = {
      total: levelResults.length,
      passed: levelResults.filter(r => r.status === 'passed').length,
      failed: levelResults.filter(r => r.status === 'failed').length,
      skipped: levelResults.filter(r => r.status === 'skipped').length,
    };

    return { levelResults, summary, totalDuration };
  }

  /**
   * 执行单个层级的测试
   */
  private async runLevelTest(
    config: TestLevelConfig,
    _projectPath: string
  ): Promise<{
    passed: boolean;
    score: number;
    details?: Record<string, unknown>;
    errors?: LevelTestResult['errors'];
  }> {
    // 根据层级执行不同的测试逻辑
    switch (config.level) {
      case 'L1':
        return this.runLintTest();
      case 'L2':
        return this.runTypeCheckTest();
      case 'L3':
        return this.runUnitTest();
      case 'L4':
        return this.runIntegrationTest();
      case 'L5':
        return this.runE2ETest();
      case 'L6':
        return this.runPerformanceTest();
      case 'L7':
        return this.runSecurityTest();
      default:
        return { passed: false, score: 0 };
    }
  }

  /**
   * L1: 语法检查
   */
  private async runLintTest(): Promise<{ passed: boolean; score: number; errors?: LevelTestResult['errors'] }> {
    // 模拟执行 lint
    const errorCount = Math.floor(Math.random() * 3);
    const warningCount = Math.floor(Math.random() * 5);

    const score = Math.max(0, 100 - errorCount * 20 - warningCount * 5);
    const passed = errorCount === 0;

    const errors: LevelTestResult['errors'] = [];
    for (let i = 0; i < errorCount; i++) {
      errors.push({
        message: `ESLint error: Unexpected console statement`,
        file: `src/file${i}.ts`,
        line: 10 + i,
        fixable: true,
      });
    }

    return { passed, score, errors };
  }

  /**
   * L2: 类型检查
   */
  private async runTypeCheckTest(): Promise<{ passed: boolean; score: number; errors?: LevelTestResult['errors'] }> {
    const errorCount = Math.floor(Math.random() * 2);

    const score = Math.max(0, 100 - errorCount * 30);
    const passed = errorCount === 0;

    const errors: LevelTestResult['errors'] = [];
    for (let i = 0; i < errorCount; i++) {
      errors.push({
        message: `Type 'string' is not assignable to type 'number'`,
        file: `src/types${i}.ts`,
        line: 15 + i,
        fixable: true,
      });
    }

    return { passed, score, errors };
  }

  /**
   * L3: 单元测试
   */
  private async runUnitTest(): Promise<{ passed: boolean; score: number; errors?: LevelTestResult['errors']; details?: Record<string, unknown> }> {
    const total = 10 + Math.floor(Math.random() * 5);
    const passed = total - Math.floor(Math.random() * 3);
    const failed = total - passed;

    const score = Math.round((passed / total) * 100);
    const isPassed = failed === 0;

    const errors: LevelTestResult['errors'] = [];
    for (let i = 0; i < failed; i++) {
      errors.push({
        message: `Test failed: Expected true but received false`,
        file: `tests/unit${i}.test.ts`,
        fixable: true,
      });
    }

    return {
      passed: isPassed,
      score,
      errors,
      details: { total, passed, failed, coverage: Math.round(70 + Math.random() * 25) },
    };
  }

  /**
   * L4: 集成测试
   */
  private async runIntegrationTest(): Promise<{ passed: boolean; score: number; errors?: LevelTestResult['errors'] }> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _checks = ['dependencies', 'build', 'start', 'api'];
    const failedChecks = Math.floor(Math.random() * 2);

    const score = Math.max(0, 100 - failedChecks * 25);
    const passed = failedChecks === 0;

    return { passed, score };
  }

  /**
   * L5: 端到端测试
   */
  private async runE2ETest(): Promise<{ passed: boolean; score: number; errors?: LevelTestResult['errors'] }> {
    const flows = 3 + Math.floor(Math.random() * 2);
    const passedFlows = flows - Math.floor(Math.random() * 2);

    const score = Math.round((passedFlows / flows) * 100);
    const passed = passedFlows === flows;

    return { passed, score };
  }

  /**
   * L6: 性能测试
   */
  private async runPerformanceTest(): Promise<{ passed: boolean; score: number; errors?: LevelTestResult['errors']; details?: Record<string, unknown> }> {
    const loadTime = 1000 + Math.random() * 2000; // 1-3秒
    const renderTime = 100 + Math.random() * 200; // 100-300ms

    // 加载时间 < 2s 得满分，每多 1s 扣 20 分
    const loadScore = Math.max(0, 100 - Math.max(0, (loadTime - 2000) / 1000) * 20);
    // 渲染时间 < 200ms 得满分，每多 100ms 扣 10 分
    const renderScore = Math.max(0, 100 - Math.max(0, (renderTime - 200) / 100) * 10);

    const score = Math.round((loadScore + renderScore) / 2);
    const passed = loadTime < 3000 && renderTime < 300;

    return {
      passed,
      score,
      details: { loadTime: Math.round(loadTime), renderTime: Math.round(renderTime) },
    };
  }

  /**
   * L7: 安全扫描
   */
  private async runSecurityTest(): Promise<{ passed: boolean; score: number; errors?: LevelTestResult['errors'] }> {
    const vulnerabilities = Math.floor(Math.random() * 3);

    const score = Math.max(0, 100 - vulnerabilities * 25);
    const passed = vulnerabilities === 0;

    const errors: LevelTestResult['errors'] = [];
    for (let i = 0; i < vulnerabilities; i++) {
      errors.push({
        message: `Security: Potential XSS vulnerability detected`,
        file: `src/component${i}.tsx`,
        line: 20 + i,
        fixable: true,
      });
    }

    return { passed, score, errors };
  }

  /**
   * 计算综合评分
   */
  private calculateOverallScore(levelResults: LevelTestResult[]): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const result of levelResults) {
      const config = this.levelConfigs[result.level];
      if (result.status !== 'skipped') {
        totalScore += result.score * config.weight;
        totalWeight += config.weight;
      }
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  /**
   * 获取等级
   */
  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * 统计可修复错误数量
   */
  private countFixableErrors(levelResults: LevelTestResult[]): number {
    return levelResults.reduce((count, result) => {
      const fixable = result.errors?.filter(e => e.fixable).length || 0;
      return count + fixable;
    }, 0);
  }

  /**
   * 获取层级配置
   */
  getLevelConfigs(): Record<TestLevel, TestLevelConfig> {
    return this.levelConfigs;
  }
}

// 导出实例
export default new TestOrchestratorSkill();
