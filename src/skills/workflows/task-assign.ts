// task-assign.skill - 任务分配与子任务拆解
// 将需求拆解为可独立开发的子任务，支持多人协作

import { BaseSkill } from '../base.skill.js';
import { createLogger } from '../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

const logger = createLogger('TaskAssignSkill');

/**
 * 任务分配参数
 */
interface TaskAssignParams {
  demand?: string;
  decomposition?: Record<string, unknown>;
  teamMembers?: string[];
  assignStrategy?: 'auto' | 'round-robin' | 'skill-based';
  parallelTasks?: boolean;
}

/**
 * 子任务
 */
interface SubTask {
  id: string;
  name: string;
  description: string;
  assignee?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  dependencies: string[];
  estimatedHours?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 任务分配结果
 */
interface TaskAssignResult {
  tasks: SubTask[];
  dependencies: Record<string, string[]>;
  assignees: Record<string, string>;
  parallelGroups: string[][];
  totalTasks: number;
  estimatedTotalHours?: number;
}

/**
 * 任务分配 Skill
 * 将需求拆解为可独立开发的子任务，支持多人协作
 */
export class TaskAssignSkill extends BaseSkill {
  readonly meta = {
    name: 'task-assign',
    description: '任务分配 - 将需求拆解为可独立开发的子任务',
    category: 'workflow' as const,
    version: '1.0.0',
    tags: ['task', 'assign', 'decompose', 'collaboration', 'team'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as TaskAssignParams;
    const {
      demand,
      decomposition,
      teamMembers = [],
      assignStrategy = 'auto',
      parallelTasks = true,
    } = params;

    logger.info('Starting task assignment', { demand: demand?.substring(0, 50), teamMembers, assignStrategy });

    try {
      // 从需求或分解结果获取任务列表
      const tasks = this.extractTasks(decomposition, demand);
      
      // 分配任务
      const assignedTasks = this.assignTasks(tasks, teamMembers, assignStrategy);
      
      // 分析依赖关系
      const dependencies = this.analyzeDependencies(assignedTasks);
      
      // 生成分组（可并行执行的任务）
      const parallelGroups = parallelTasks 
        ? this.computeParallelGroups(assignedTasks, dependencies)
        : [[...assignedTasks.map(t => t.id)]];
      
      // 计算总工期
      const estimatedTotalHours = this.calculateTotalHours(assignedTasks);

      const result: TaskAssignResult = {
        tasks: assignedTasks,
        dependencies,
        assignees: this.buildAssigneeMap(assignedTasks),
        parallelGroups,
        totalTasks: assignedTasks.length,
        estimatedTotalHours,
      };

      return this.success({
        taskAssignResult: result,
        summary: {
          totalTasks: result.totalTasks,
          totalMembers: teamMembers.length,
          parallelGroups: parallelGroups.length,
          estimatedHours: estimatedTotalHours,
        },
      }, '任务分配完成: ' + result.totalTasks + ' 个子任务');

    } catch (error) {
      logger.error('Task assignment failed', { error });
      return this.fatalError('任务分配失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * 从分解结果或需求中提取任务
   */
  private extractTasks(
    decomposition?: Record<string, unknown>,
    demand?: string
  ): Omit<SubTask, 'id' | 'assignee'>[] {
    // 如果有分解结果，直接使用
    if (decomposition?.tasks) {
      const tasks = decomposition.tasks as Array<Record<string, unknown>>;
      return tasks.map(t => ({
        name: (t.name as string) || '未命名任务',
        description: (t.description as string) || '',
        status: 'pending' as const,
        dependencies: (t.dependencies as string[]) || [],
        estimatedHours: t.estimatedHours as number | undefined,
        priority: (t.priority as SubTask['priority']) || 'medium',
      }));
    }

    // 否则从需求中智能提取
    return this.inferTasksFromDemand(demand || '');
  }

  /**
   * 从需求中推断任务
   */
  private inferTasksFromDemand(demand: string): Omit<SubTask, 'id' | 'assignee'>[] {
    const tasks: Omit<SubTask, 'id' | 'assignee'>[] = [];
    const demandLower = demand.toLowerCase();

    // 常见任务模式
    const taskPatterns = [
      { keywords: ['前端', '页面', '界面', 'ui'], name: '前端页面开发', priority: 'high' as const },
      { keywords: ['后端', '接口', 'api', '服务'], name: '后端接口开发', priority: 'high' as const },
      { keywords: ['数据库', '存储', 'model'], name: '数据库设计', priority: 'medium' as const },
      { keywords: ['测试', '用例'], name: '测试用例编写', priority: 'medium' as const },
      { keywords: ['部署', '发布'], name: '部署配置', priority: 'medium' as const },
      { keywords: ['文档', '说明'], name: '文档编写', priority: 'low' as const },
    ];

    for (const pattern of taskPatterns) {
      if (pattern.keywords.some(k => demandLower.includes(k))) {
        tasks.push({
          name: pattern.name,
          description: '根据需求 "' + demand.substring(0, 100) + '" 推断的任务',
          status: 'pending',
          dependencies: [],
          priority: pattern.priority,
        });
      }
    }

    // 如果没有匹配到任何任务，创建一个默认任务
    if (tasks.length === 0) {
      tasks.push({
        name: '需求开发',
        description: demand.substring(0, 200),
        status: 'pending',
        dependencies: [],
        priority: 'medium',
      });
    }

    return tasks;
  }

  /**
   * 分配任务给团队成员
   */
  private assignTasks(
    tasks: Omit<SubTask, 'id' | 'assignee'>[],
    teamMembers: string[],
    strategy: string
  ): SubTask[] {
    if (teamMembers.length === 0) {
      // 没有团队成员，返回未分配的任务
      return tasks.map((t, i) => ({
        ...t,
        id: 'task-' + (i + 1),
      }));
    }

    return tasks.map((t, i) => {
      let assignee: string | undefined;
      
      switch (strategy) {
        case 'round-robin':
          assignee = teamMembers[i % teamMembers.length];
          break;
        case 'skill-based':
          // 简化版：轮流分配
          assignee = teamMembers[i % teamMembers.length];
          break;
        case 'auto':
        default:
          assignee = teamMembers[i % teamMembers.length];
          break;
      }

      return {
        ...t,
        id: 'task-' + (i + 1),
        assignee,
      };
    });
  }

  /**
   * 分析任务依赖关系
   */
  private analyzeDependencies(tasks: SubTask[]): Record<string, string[]> {
    const deps: Record<string, string[]> = {};
    
    for (const task of tasks) {
      if (task.dependencies.length > 0) {
        deps[task.id] = task.dependencies;
      }
    }

    return deps;
  }

  /**
   * 计算可并行执行的任务分组
   */
  private computeParallelGroups(
    tasks: SubTask[],
    dependencies: Record<string, string[]>
  ): string[][] {
    const groups: string[][] = [];
    const assigned = new Set<string>();
    
    // 简化实现：基于依赖关系分组
    while (assigned.size < tasks.length) {
      const currentGroup: string[] = [];
      
      for (const task of tasks) {
        if (assigned.has(task.id)) continue;
        
        // 检查依赖是否都已完成
        const taskDeps = dependencies[task.id] || [];
        const depsMet = taskDeps.every(dep => assigned.has(dep));
        
        if (depsMet) {
          currentGroup.push(task.id);
        }
      }
      
      if (currentGroup.length === 0) break;
      
      groups.push(currentGroup);
      currentGroup.forEach(id => assigned.add(id));
    }

    return groups;
  }

  /**
   * 计算总工期
   */
  private calculateTotalHours(tasks: SubTask[]): number {
    return tasks.reduce((sum, t) => sum + (t.estimatedHours || 1), 0);
  }

  /**
   * 构建任务负责人映射
   */
  private buildAssigneeMap(tasks: SubTask[]): Record<string, string> {
    const map: Record<string, string> = {};
    
    for (const task of tasks) {
      if (task.assignee) {
        map[task.id] = task.assignee;
      }
    }

    return map;
  }
}

export default new TaskAssignSkill();
