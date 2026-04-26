// test-plan.skill - 测试计划生成
// 根据项目类型和需求生成测试计划

import { BaseSkill } from '../base.skill.js';
import { createLogger } from '../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

const logger = createLogger('TestPlanSkill');

/**
 * 测试层级
 */
type TestLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';

/**
 * 测试项配置
 */
interface TestItem {
  level: TestLevel;
  name: string;
  description: string;
  estimatedTime: string;
  required: boolean;
  testCount?: number;
  details?: string[];
}

/**
 * 测试计划
 */
interface TestPlan {
  projectName: string;
  projectType: 'page' | 'api' | 'component' | 'project';
  totalEstimatedTime: string;
  testItems: TestItem[];
  summary: {
    totalLevels: number;
    requiredLevels: number;
    optionalLevels: number;
  };
  targetScore: number;
  maxRetries: number;
}

/**
 * 测试计划生成参数
 */
interface TestPlanParams {
  projectPath?: string;
  projectType?: 'page' | 'api' | 'component' | 'project';
  projectName?: string;
  requirements?: string[];
  skipLevels?: TestLevel[];
  targetScore?: number;
}

/**
 * 测试计划生成 Skill
 * 根据项目类型和需求生成结构化测试计划
 */
export class TestPlanSkill extends BaseSkill {
  readonly meta = {
    name: 'test-plan',
    description: '生成测试计划 - 根据项目类型生成测试列表',
    category: 'plan' as const,
    version: '1.0.0',
    tags: ['test', 'plan', 'workflow', 'quality'],
  };

  // 各层级测试的默认配置
  private readonly testLevelConfigs: Record<TestLevel, Omit<TestItem, 'testCount' | 'details'>> = {
    'L1': {
      level: 'L1',
      name: '语法检查',
      description: 'ESLint 代码规范检查，确保代码风格一致',
      estimatedTime: '30秒',
      required: true,
    },
    'L2': {
      level: 'L2',
      name: '类型检查',
      description: 'TypeScript 类型检查，确保类型安全',
      estimatedTime: '1分钟',
      required: true,
    },
    'L3': {
      level: 'L3',
      name: '单元测试',
      description: '函数/模块级别的单元测试',
      estimatedTime: '2分钟',
      required: true,
    },
    'L4': {
      level: 'L4',
      name: '集成测试',
      description: '依赖检查、构建验证、模块协作测试',
      estimatedTime: '3分钟',
      required: true,
    },
    'L5': {
      level: 'L5',
      name: '端到端测试',
      description: '用户流程完整性测试',
      estimatedTime: '5分钟',
      required: false,
    },
    'L6': {
      level: 'L6',
      name: '性能测试',
      description: '页面加载、渲染性能测试',
      estimatedTime: '2分钟',
      required: false,
    },
    'L7': {
      level: 'L7',
      name: '安全扫描',
      description: 'XSS、CSRF、注入等安全漏洞检测',
      estimatedTime: '1分钟',
      required: true,
    },
  };

  // 项目类型对应的推荐测试层级
  private readonly projectTypeTestLevels: Record<string, TestLevel[]> = {
    'page': ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
    'api': ['L1', 'L2', 'L3', 'L4', 'L7'],
    'component': ['L1', 'L2', 'L3', 'L4'],
    'project': ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as TestPlanParams;
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      projectPath: _projectPath = '.',
      projectType = 'page',
      projectName,
      requirements = [],
      skipLevels = [],
      targetScore = 90,
    } = params;

    // 从上下文获取项目信息
    const contextProjectType = input.context.readOnly.projectType as string | undefined;
    const contextProjectName = input.context.readOnly.projectName as string | undefined;
    const contextRequirements = input.context.readOnly.requirements as string[] | undefined;

    const finalProjectType = (projectType || contextProjectType || 'page') as 'page' | 'api' | 'component' | 'project';
    const finalProjectName = projectName || contextProjectName || '未命名项目';
    const finalRequirements = requirements.length > 0 ? requirements : (contextRequirements || []);

    logger.info('Generating test plan', {
      projectType: finalProjectType,
      projectName: finalProjectName,
      requirementsCount: finalRequirements.length,
    });

    try {
      // 生成测试计划
      const testPlan = this.generateTestPlan(
        finalProjectType,
        finalProjectName,
        finalRequirements,
        skipLevels,
        targetScore
      );

      // 生成可视化展示
      const planDisplay = this.renderPlanDisplay(testPlan);

      return this.needInput({
        testPlan,
        planDisplay,
        testLevels: testPlan.testItems.map(item => item.level),
        nextStage: 'test-confirm',
      }, `测试计划已生成，共 ${testPlan.testItems.length} 项测试，预计耗时 ${testPlan.totalEstimatedTime}`);

    } catch (error) {
      logger.error('Failed to generate test plan', { error });
      return this.fatalError(`测试计划生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成测试计划
   */
  private generateTestPlan(
    projectType: 'page' | 'api' | 'component' | 'project',
    projectName: string,
    requirements: string[],
    skipLevels: TestLevel[],
    targetScore: number
  ): TestPlan {
    // 获取该项目类型的测试层级
    const testLevels = this.projectTypeTestLevels[projectType] || this.projectTypeTestLevels['project'];

    // 过滤跳过的层级
    const filteredLevels = testLevels.filter(level => !skipLevels.includes(level));

    // 生成测试项
    const testItems: TestItem[] = filteredLevels.map(level => {
      const config = this.testLevelConfigs[level];
      return {
        ...config,
        testCount: this.estimateTestCount(level, projectType, requirements),
        details: this.generateTestDetails(level, projectType, requirements),
      };
    });

    // 计算总耗时
    const totalMinutes = this.calculateTotalTime(testItems);

    return {
      projectName,
      projectType,
      totalEstimatedTime: totalMinutes,
      testItems,
      summary: {
        totalLevels: testItems.length,
        requiredLevels: testItems.filter(item => item.required).length,
        optionalLevels: testItems.filter(item => !item.required).length,
      },
      targetScore,
      maxRetries: 5,
    };
  }

  /**
   * 估算测试数量
   */
  private estimateTestCount(level: TestLevel, projectType: string, requirements: string[]): number {
    switch (level) {
      case 'L1':
      case 'L2':
        return 1; // 单次检查
      case 'L3':
        // 单元测试数量基于需求
        return 5 + Math.min(requirements.length * 2, 15);
      case 'L4':
        return projectType === 'api' ? 3 : 4; // 依赖、构建、启动、API
      case 'L5':
        return Math.max(2, Math.min(requirements.length, 5)); // E2E 流程
      case 'L6':
        return 3; // 加载、渲染、资源
      case 'L7':
        return 4; // XSS、CSRF、注入、敏感信息
      default:
        return 1;
    }
  }

  /**
   * 生成测试详情
   */
  private generateTestDetails(level: TestLevel, projectType: string, requirements: string[]): string[] {
    const details: string[] = [];

    switch (level) {
      case 'L1':
        details.push('代码风格检查', '最佳实践检查', '潜在错误检测');
        break;
      case 'L2':
        details.push('类型定义检查', '类型兼容性验证', '泛型约束检查');
        break;
      case 'L3':
        details.push('函数单元测试', '边界条件测试', '异常处理测试');
        if (requirements.length > 0) {
          details.push(`覆盖 ${Math.min(requirements.length, 5)} 个核心需求`);
        }
        break;
      case 'L4':
        details.push('依赖安装检查', '构建流程验证');
        if (projectType !== 'component') {
          details.push('启动验证');
        }
        if (projectType === 'api') {
          details.push('API 接口测试');
        }
        break;
      case 'L5':
        details.push('主流程测试', '边界场景测试');
        if (requirements.some(r => r.includes('登录'))) {
          details.push('登录流程测试');
        }
        break;
      case 'L6':
        details.push('首屏加载时间', '交互响应时间', '资源体积检查');
        break;
      case 'L7':
        details.push('XSS 漏洞扫描', 'CSRF 防护检查', '敏感信息泄露检测');
        break;
    }

    return details;
  }

  /**
   * 计算总耗时
   */
  private calculateTotalTime(testItems: TestItem[]): string {
    let totalSeconds = 0;

    for (const item of testItems) {
      const timeStr = item.estimatedTime;
      if (timeStr.includes('分钟')) {
        totalSeconds += parseInt(timeStr) * 60;
      } else if (timeStr.includes('秒')) {
        totalSeconds += parseInt(timeStr);
      }
    }

    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`;
    }

    return `${totalSeconds}秒`;
  }

  /**
   * 渲染测试计划展示
   */
  private renderPlanDisplay(plan: TestPlan): string {
    const lines: string[] = [];

    lines.push(`\n╔══════════════════════════════════════════════════════════╗`);
    lines.push(`║  测试计划: ${plan.projectName.padEnd(40)}║`);
    lines.push(`╠══════════════════════════════════════════════════════════╣`);
    lines.push(`║  项目类型: ${plan.projectType.padEnd(42)}║`);
    lines.push(`║  预计耗时: ${plan.totalEstimatedTime.padEnd(42)}║`);
    lines.push(`║  目标分数: ${String(plan.targetScore).padEnd(42)}║`);
    lines.push(`╠══════════════════════════════════════════════════════════╣`);

    for (const item of plan.testItems) {
      const required = item.required ? '●' : '○';
      const testCount = item.testCount ? ` (${item.testCount}项)` : '';
      const line = `${required} ${item.level} ${item.name}${testCount} ─────── ${item.estimatedTime}`;
      lines.push(`║  ${line.padEnd(54)}║`);

      if (item.details && item.details.length > 0) {
        for (const detail of item.details.slice(0, 2)) {
          lines.push(`║      - ${detail.padEnd(50)}║`);
        }
      }
    }

    lines.push(`╠══════════════════════════════════════════════════════════╣`);
    lines.push(`║  必须通过: ${String(plan.summary.requiredLevels).padEnd(42)}║`);
    lines.push(`║  可选测试: ${String(plan.summary.optionalLevels).padEnd(42)}║`);
    lines.push(`╚══════════════════════════════════════════════════════════╝\n`);

    return lines.join('\n');
  }
}

// 导出实例
export default new TestPlanSkill();
