// WorkflowBridge - 工作流桥接器
// 连接 AIOS 工作流系统和外部技能

import { SkillSource, type ForgeWorkflow, type RoutingResult } from './types.js';
import type { RoutingContext, TechDomain, ComplexityLevel } from './types.js';
import type { SkillInput, SkillOutput } from '../types/index.js';
import { SkillRouter } from './skill-router.js';
import { ExternalSkillLoader } from './external-skill-loader.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('WorkflowBridge');

/**
 * WorkflowBridge 类
 * 负责桥接 AIOS 工作流和外部技能
 */
export class WorkflowBridge {
  private skillRouter: SkillRouter;
  private skillLoader: ExternalSkillLoader;
  private workflows: Map<string, ForgeWorkflow>;

  constructor(skillRouter?: SkillRouter, skillLoader?: ExternalSkillLoader) {
    this.skillRouter = skillRouter || new SkillRouter();
    this.skillLoader = skillLoader || new ExternalSkillLoader();
    this.workflows = new Map();
  }

  /**
   * 注册 Forge 工作流
   */
  registerWorkflow(workflow: ForgeWorkflow): void {
    this.workflows.set(workflow.name, workflow);
    logger.info(`Registered workflow: ${workflow.name}`);
  }

  /**
   * 获取工作流
   */
  getWorkflow(name: string): ForgeWorkflow | undefined {
    return this.workflows.get(name);
  }

  /**
   * 列出所有工作流
   */
  listWorkflows(): ForgeWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * 根据阶段获取工作流
   */
  getWorkflowByPhase(phase: string): ForgeWorkflow | undefined {
    for (const workflow of this.workflows.values()) {
      if (workflow.type === phase) {
        return workflow;
      }
    }
    return undefined;
  }

  /**
   * 路由到技能
   */
  async routeToSkill(routingResult: RoutingResult, _input: SkillInput): Promise<SkillOutput> {
    const { source, skill, invokeType } = routingResult;

    if (invokeType === 'direct') {
      // AIOS 内部技能，通过 SkillExecutor 调用
      // 这里返回需要继续执行的信号，实际执行由调用方处理
      return {
        code: 200,
        data: {
          source,
          skill,
          needsExecutor: true,
        },
        message: `Routed to AIOS skill: ${skill}`,
      };
    }

    if (invokeType === 'llm') {
      // 外部技能（gstack/minimax），加载 SKILL.md 内容
      try {
        const content = await this.skillLoader.getSkillContent(source, skill);
        return {
          code: 200,
          data: {
            source,
            skill,
            content,
            needsLLM: true,
          },
          message: `Loaded ${source} skill: ${skill}`,
        };
      } catch (error) {
        return {
          code: 500,
          data: {},
          message: `Failed to load skill: ${skill}, error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // mcp 类型
    return {
      code: 200,
      data: {
        source,
        skill,
        needsMCP: true,
      },
      message: `Routed to MCP skill: ${skill}`,
    };
  }

  /**
   * 执行带降级的技能调用
   * 优先尝试主技能，失败后尝试备用技能
   */
  async invokeWithFallback(
    primary: RoutingResult,
    fallback: RoutingResult,
    input: SkillInput
  ): Promise<SkillOutput> {
    // 尝试主技能
    const primaryResult = await this.routeToSkill(primary, input);

    if (primaryResult.code === 200) {
      return primaryResult;
    }

    // 主技能失败，尝试备用技能
    logger.warn(`Primary skill failed, trying fallback: ${primary.skill} -> ${fallback.skill}`);

    const fallbackResult = await this.routeToSkill(fallback, input);
    return {
      ...fallbackResult,
      message: `${fallbackResult.message} (fallback from ${primary.skill})`,
    };
  }

  /**
   * 创建路由上下文
   */
  createRoutingContext(params: {
    phase: string;
    originalInput?: string;
    techStack?: string;
    domain?: string;
    complexity?: string;
    hasBrowser?: boolean;
  }) {
    return this.skillRouter.route({
      phase: params.phase as RoutingContext['phase'],
      originalInput: params.originalInput,
      techStack: params.techStack,
      domain: params.domain as TechDomain,
      complexity: params.complexity as ComplexityLevel,
      hasBrowser: params.hasBrowser,
    });
  }

  /**
   * 获取技能来源标签
   */
  getSourceLabel(source: SkillSource): string {
    const labels: Record<SkillSource, string> = {
      [SkillSource.AIOS]: 'AIOS',
      [SkillSource.GSTACK]: 'GStack',
      [SkillSource.MINIMAX]: 'MiniMax',
    };
    return labels[source];
  }
}

/**
 * 导出单例
 */
let globalBridge: WorkflowBridge | null = null;

export function getWorkflowBridge(): WorkflowBridge {
  if (!globalBridge) {
    globalBridge = new WorkflowBridge();
    // 注册默认工作流
    registerDefaultWorkflows(globalBridge);
  }
  return globalBridge;
}

/**
 * 注册默认工作流
 */
function registerDefaultWorkflows(bridge: WorkflowBridge): void {
  // 需求分析工作流
  bridge.registerWorkflow({
    name: 'forge-demand',
    description: '整合需求分析工作流',
    type: 'demand',
    initialStep: 'demand-collect',
    skills: [
      { name: 'demand-collect', source: SkillSource.AIOS, invokeType: 'direct', required: true },
      { name: 'office-hours', source: SkillSource.GSTACK, invokeType: 'llm', required: false },
    ],
    steps: [
      { skill: 'demand-collect', source: SkillSource.AIOS, invokeType: 'direct', onSuccess: 'demand-analysis' },
      { skill: 'demand-analysis', source: SkillSource.AIOS, invokeType: 'direct', onSuccess: 'demand-confirm' },
      { skill: 'demand-confirm', source: SkillSource.AIOS, invokeType: 'direct', onSuccess: null },
    ],
  });

  // 架构设计工作流
  bridge.registerWorkflow({
    name: 'forge-architecture',
    description: '整合架构设计工作流',
    type: 'architecture',
    initialStep: 'plan-eng-review',
    skills: [
      { name: 'plan-eng-review', source: SkillSource.GSTACK, invokeType: 'llm', required: true },
    ],
    steps: [
      { skill: 'plan-eng-review', source: SkillSource.GSTACK, invokeType: 'llm', onSuccess: null },
    ],
  });

  // 审查工作流
  bridge.registerWorkflow({
    name: 'forge-review',
    description: '整合代码审查工作流',
    type: 'review',
    initialStep: 'review',
    skills: [
      { name: 'review', source: SkillSource.GSTACK, invokeType: 'llm', required: true },
      { name: 'code-review', source: SkillSource.AIOS, invokeType: 'direct', required: false },
    ],
    steps: [
      { skill: 'review', source: SkillSource.GSTACK, invokeType: 'llm', onSuccess: null },
    ],
  });

  // QA 工作流
  bridge.registerWorkflow({
    name: 'forge-qa',
    description: '整合 QA 工作流',
    type: 'qa',
    initialStep: 'qa',
    skills: [
      { name: 'qa', source: SkillSource.GSTACK, invokeType: 'llm', required: true },
      { name: 'test-orchestrator', source: SkillSource.AIOS, invokeType: 'direct', required: false },
    ],
    steps: [
      { skill: 'qa', source: SkillSource.GSTACK, invokeType: 'llm', onSuccess: null },
    ],
  });

  // 发布工作流
  bridge.registerWorkflow({
    name: 'forge-ship',
    description: '整合发布工作流',
    type: 'ship',
    initialStep: 'ship',
    skills: [
      { name: 'ship', source: SkillSource.GSTACK, invokeType: 'llm', required: true },
      { name: 'deploy', source: SkillSource.AIOS, invokeType: 'direct', required: false },
    ],
    steps: [
      { skill: 'ship', source: SkillSource.GSTACK, invokeType: 'llm', onSuccess: null },
    ],
  });
}
