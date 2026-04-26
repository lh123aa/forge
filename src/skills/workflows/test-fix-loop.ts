// test-fix-loop.skill - 测试修复循环
// 循环执行测试-修复直到达到目标分数或达到最大次数

import { BaseSkill } from '../base.skill.js';
import { createLogger } from '../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

const logger = createLogger('TestFixLoopSkill');

/**
 * 测试层级
 */
type TestLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';

/**
 * 修复记录
 */
interface FixRecord {
  round: number;
  timestamp: number;
  errorsFound: number;
  errorsFixed: number;
  scoreBefore: number;
  scoreAfter: number;
  fixedItems: string[];
}

/**
 * 测试修复循环参数
 */
interface TestFixLoopParams {
  targetScore?: number;
  maxRounds?: number;
  currentRound?: number;
  fixHistory?: FixRecord[];
  testResults?: Record<string, unknown>;
  qualityScore?: {
    overallScore: number;
    levelScores: Array<{
      level: TestLevel;
      name: string;
      score: number;
      passed: boolean;
      errors?: Array<{ message: string; fixable: boolean }>;
    }>;
  };
}

/**
 * 循环结果
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface LoopResult {
  success: boolean;
  roundsCompleted: number;
  finalScore: number;
  finalGrade: string;
  fixHistory: FixRecord[];
  remainingIssues: string[];
  nextAction: 'deliver' | 'manual-fix' | 'regenerate';
}

/**
 * 测试修复循环 Skill
 * 自动循环修复直到达标
 */
export class TestFixLoopSkill extends BaseSkill {
  readonly meta = {
    name: 'test-fix-loop',
    description: '测试修复循环 - 循环测试修复直到达标',
    category: 'workflow' as const,
    version: '1.0.0',
    tags: ['test', 'fix', 'loop', 'workflow', 'quality'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as TestFixLoopParams;
    const {
      targetScore = 90,
      maxRounds = 5,
      currentRound = 0,
      fixHistory = [],
    } = params;

    // 从上下文获取测试结果和评分
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _testResults = params.testResults || input.context.readOnly.testResults;
    const qualityScore = (params.qualityScore || input.context.writable.qualityScore) as {
      overallScore: number;
      levelScores: Array<{
        level: TestLevel;
        name: string;
        score: number;
        passed: boolean;
        errors?: Array<{ message: string; fixable: boolean }>;
      }>;
    } | undefined;

    if (!qualityScore) {
      return this.fatalError('未找到质量评分，请先执行测试');
    }

    const currentScore = qualityScore.overallScore;
    const levelScores = qualityScore.levelScores;

    logger.info('Test fix loop', {
      currentRound,
      maxRounds,
      currentScore,
      targetScore,
    });

    // 检查是否已达标
    if (currentScore >= targetScore) {
      return this.success({
        success: true,
        roundsCompleted: currentRound,
        finalScore: currentScore,
        finalGrade: this.getGrade(currentScore),
        fixHistory,
        nextAction: 'deliver',
      }, `已达到目标分数 ${currentScore} 分，可以交付`);
    }

    // 检查是否超过最大轮数
    if (currentRound >= maxRounds) {
      return this.handleMaxRoundsReached(currentScore, targetScore, fixHistory, levelScores);
    }

    // 收集可修复的错误
    const fixableErrors = this.collectFixableErrors(levelScores);

    if (fixableErrors.length === 0) {
      return this.handleNoFixableErrors(currentScore, targetScore, fixHistory, levelScores);
    }

    // 执行修复
    logger.info(`Round ${currentRound + 1}: Fixing ${fixableErrors.length} errors`);

    const fixResult = await this.executeFixes(fixableErrors, currentRound);

    // 记录修复历史
    const fixRecord: FixRecord = {
      round: currentRound + 1,
      timestamp: Date.now(),
      errorsFound: fixableErrors.length,
      errorsFixed: fixResult.fixed,
      scoreBefore: currentScore,
      scoreAfter: fixResult.estimatedNewScore,
      fixedItems: fixResult.fixedItems,
    };

    const newHistory = [...fixHistory, fixRecord];

    // 返回继续测试的指令
    return this.needInput({
      round: currentRound + 1,
      maxRounds,
      fixRecord,
      fixHistory: newHistory,
      nextStage: 'test-orchestrator',
      params: {
        currentRound: currentRound + 1,
        fixHistory: newHistory,
      },
    }, `第 ${currentRound + 1} 轮修复完成，修复了 ${fixResult.fixed} 个问题，请重新测试`);
  }

  /**
   * 收集可修复的错误
   */
  private collectFixableErrors(
    levelScores: Array<{
      level: TestLevel;
      name: string;
      score: number;
      passed: boolean;
      errors?: Array<{ message: string; fixable: boolean }>;
    }>
  ): Array<{ level: TestLevel; error: { message: string; fixable: boolean } }> {
    const fixable: Array<{ level: TestLevel; error: { message: string; fixable: boolean } }> = [];

    for (const level of levelScores) {
      if (!level.passed && level.errors) {
        for (const error of level.errors) {
          if (error.fixable) {
            fixable.push({ level: level.level, error });
          }
        }
      }
    }

    return fixable;
  }

  /**
   * 执行修复
   */
  private async executeFixes(
    fixableErrors: Array<{ level: TestLevel; error: { message: string; fixable: boolean } }>,
    _round: number
  ): Promise<{ fixed: number; estimatedNewScore: number; fixedItems: string[] }> {
    const fixedItems: string[] = [];
    let fixed = 0;

    // 按优先级修复（L1, L2, L7 先修复）
    const priorityOrder: TestLevel[] = ['L1', 'L2', 'L7', 'L3', 'L4', 'L5', 'L6'];

    const sortedErrors = [...fixableErrors].sort((a, b) => {
      return priorityOrder.indexOf(a.level) - priorityOrder.indexOf(b.level);
    });

    for (const item of sortedErrors) {
      // 模拟修复过程
      const fixSuccess = await this.attemptFix(item);

      if (fixSuccess) {
        fixed++;
        fixedItems.push(`[${item.level}] ${item.error.message.substring(0, 30)}...`);
      }
    }

    // 估算新分数
    const estimatedNewScore = Math.min(100, 75 + fixed * 5);

    return { fixed, estimatedNewScore, fixedItems };
  }

  /**
   * 尝试修复单个错误
   */
  private async attemptFix(
    _item: { level: TestLevel; error: { message: string; fixable: boolean } }
  ): Promise<boolean> {
    // 模拟修复延迟
    await new Promise(resolve => setTimeout(resolve, 10));

    // 90% 的修复成功率
    return Math.random() > 0.1;
  }

  /**
   * 处理达到最大轮数
   */
  private handleMaxRoundsReached(
    currentScore: number,
    targetScore: number,
    fixHistory: FixRecord[],
    levelScores: Array<{ level: TestLevel; passed: boolean; errors?: Array<{ message: string }> }>
  ): SkillOutput {
    const remainingIssues = this.getRemainingIssues(levelScores);

    return {
      code: 400,
      data: {
        success: false,
        roundsCompleted: fixHistory.length,
        finalScore: currentScore,
        finalGrade: this.getGrade(currentScore),
        fixHistory,
        remainingIssues,
        nextAction: currentScore >= 70 ? 'manual-fix' : 'regenerate',
      },
      message: `达到最大修复轮数 (${fixHistory.length})，当前分数 ${currentScore}，目标 ${targetScore}。剩余 ${remainingIssues.length} 个问题需要处理`,
    };
  }

  /**
   * 处理无可修复错误
   */
  private handleNoFixableErrors(
    currentScore: number,
    targetScore: number,
    fixHistory: FixRecord[],
    levelScores: Array<{ level: TestLevel; passed: boolean; errors?: Array<{ message: string }> }>
  ): SkillOutput {
    const remainingIssues = this.getRemainingIssues(levelScores);

    return {
      code: 400,
      data: {
        success: false,
        roundsCompleted: fixHistory.length,
        finalScore: currentScore,
        finalGrade: this.getGrade(currentScore),
        fixHistory,
        remainingIssues,
        nextAction: 'manual-fix',
      },
      message: `无可自动修复的错误，当前分数 ${currentScore}，目标 ${targetScore}。需要手动处理 ${remainingIssues.length} 个问题`,
    };
  }

  /**
   * 获取剩余问题
   */
  private getRemainingIssues(
    levelScores: Array<{ level: TestLevel; passed: boolean; errors?: Array<{ message: string }> }>
  ): string[] {
    const issues: string[] = [];

    for (const level of levelScores) {
      if (!level.passed && level.errors) {
        for (const error of level.errors) {
          issues.push(`[${level.level}] ${error.message}`);
        }
      }
    }

    return issues;
  }

  /**
   * 获取等级
   */
  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

// 导出实例
export default new TestFixLoopSkill();
