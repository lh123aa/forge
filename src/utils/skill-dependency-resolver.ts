// Skill 依赖解析器
// 支持 Skill 依赖声明和拓扑排序执行

import { createLogger } from './logger.js';

const logger = createLogger('SkillDependencyResolver');

/**
 * Skill 依赖配置
 */
export interface SkillDependency {
  /** 依赖的 Skill 名称 */
  skill: string;
  /** 最小版本约束（可选） */
  version?: string;
  /** 依赖说明 */
  description?: string;
}

/**
 * 依赖解析结果
 */
export interface DependencyResolutionResult {
  /** 是否成功 */
  success: boolean;
  /** 排序后的执行顺序 */
  executionOrder: string[];
  /** 循环依赖检测 */
  circularDependencies?: string[][];
  /** 缺失依赖 */
  missingDependencies?: string[];
  /** 错误信息 */
  error?: string;
}

/**
 * 依赖图节点
 */
interface DependencyNode {
  name: string;
  dependencies: string[];
  dependents: string[];
}

/**
 * Skill 依赖解析器
 * 支持：
 * - 依赖声明与验证
 * - 循环依赖检测
 * - 拓扑排序
 * - 执行顺序规划
 */
export class SkillDependencyResolver {
  private dependencyGraph: Map<string, DependencyNode> = new Map();

  /**
   * 注册 Skill 的依赖
   */
  registerDependency(skillName: string, dependencies: SkillDependency[]): void {
    const deps = dependencies.map((d) => d.skill);

    // 创建或更新节点
    if (!this.dependencyGraph.has(skillName)) {
      this.dependencyGraph.set(skillName, {
        name: skillName,
        dependencies: [],
        dependents: [],
      });
    }

    const node = this.dependencyGraph.get(skillName)!;
    node.dependencies = deps;

    // 更新依赖者的反向引用
    for (const dep of deps) {
      if (!this.dependencyGraph.has(dep)) {
        this.dependencyGraph.set(dep, {
          name: dep,
          dependencies: [],
          dependents: [],
        });
      }
      const depNode = this.dependencyGraph.get(dep)!;
      if (!depNode.dependents.includes(skillName)) {
        depNode.dependents.push(skillName);
      }
    }

    logger.debug(`Registered dependencies for ${skillName}: ${deps.join(', ')}`);
  }

  /**
   * 批量注册依赖
   */
  registerDependencies(dependencies: Record<string, SkillDependency[]>): void {
    for (const [skillName, deps] of Object.entries(dependencies)) {
      this.registerDependency(skillName, deps);
    }
  }

  /**
   * 移除 Skill 的依赖声明
   */
  unregisterDependency(skillName: string): void {
    const node = this.dependencyGraph.get(skillName);
    if (!node) return;

    // 移除对该 Skill 的依赖引用
    for (const dep of node.dependencies) {
      const depNode = this.dependencyGraph.get(dep);
      if (depNode) {
        depNode.dependents = depNode.dependents.filter((d) => d !== skillName);
      }
    }

    // 移除该 Skill 的依赖引用
    for (const dependent of node.dependents) {
      const dependentNode = this.dependencyGraph.get(dependent);
      if (dependentNode) {
        dependentNode.dependencies = dependentNode.dependencies.filter((d) => d !== skillName);
      }
    }

    this.dependencyGraph.delete(skillName);
    logger.debug(`Unregistered dependencies for ${skillName}`);
  }

  /**
   * 解析依赖并返回执行顺序
   */
  resolve(skillNames: string[]): DependencyResolutionResult {
    // 检测循环依赖
    const circularDeps = this.detectCircularDependencies();
    if (circularDeps.length > 0) {
      return {
        success: false,
        executionOrder: [],
        circularDependencies: circularDeps,
        error: `Circular dependencies detected: ${circularDeps.map((c) => c.join(' -> ')).join(', ')}`,
      };
    }

    // 检测缺失依赖
    const allSkills = new Set(this.dependencyGraph.keys());
    const missingDeps = new Set<string>();

    for (const skillName of skillNames) {
      const node = this.dependencyGraph.get(skillName);
      if (node) {
        for (const dep of node.dependencies) {
          if (!allSkills.has(dep)) {
            missingDeps.add(dep);
          }
        }
      }
    }

    if (missingDeps.size > 0) {
      return {
        success: false,
        executionOrder: [],
        missingDependencies: Array.from(missingDeps),
        error: `Missing dependencies: ${Array.from(missingDeps).join(', ')}`,
      };
    }

    // 拓扑排序
    const sorted = this.topologicalSort(skillNames);

    return {
      success: true,
      executionOrder: sorted,
    };
  }

  /**
   * 获取 Skill 的所有依赖（递归）
   */
  getAllDependencies(skillName: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const node = this.dependencyGraph.get(name);
      if (node) {
        for (const dep of node.dependencies) {
          visit(dep);
        }
        result.push(name);
      }
    };

    visit(skillName);
    return result.slice(0, -1); // 移除自身
  }

  /**
   * 获取依赖该 Skill 的所有 Skill（递归）
   */
  getAllDependents(skillName: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);

      const node = this.dependencyGraph.get(name);
      if (node) {
        for (const dependent of node.dependents) {
          visit(dependent);
        }
        result.push(name);
      }
    };

    visit(skillName);
    return result.slice(0, -1); // 移除自身
  }

  /**
   * 检测循环依赖
   */
  detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const nodeData = this.dependencyGraph.get(node);
      if (nodeData) {
        for (const dep of nodeData.dependencies) {
          if (!visited.has(dep)) {
            dfs(dep);
          } else if (recursionStack.has(dep)) {
            // 发现循环
            const cycleStart = path.indexOf(dep);
            const cycle = path.slice(cycleStart);
            cycle.push(dep); // 闭合循环
            cycles.push(cycle);
          }
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    for (const nodeName of this.dependencyGraph.keys()) {
      if (!visited.has(nodeName)) {
        dfs(nodeName);
      }
    }

    return cycles;
  }

  /**
   * 拓扑排序（Kahn 算法）
   */
  private topologicalSort(startNodes: string[]): string[] {
    const inDegree = new Map<string, number>();
    const result: string[] = [];
    const queue: string[] = [];

    // 初始化入度
    for (const [name, node] of this.dependencyGraph) {
      inDegree.set(name, node.dependencies.length);
    }

    // 从起始节点开始
    for (const start of startNodes) {
      if (inDegree.get(start) === 0 && !queue.includes(start)) {
        queue.push(start);
      }
    }

    // 处理队列
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const node = this.dependencyGraph.get(current);
      if (node) {
        for (const dependent of node.dependents) {
          const newDegree = (inDegree.get(dependent) || 1) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0 && !queue.includes(dependent)) {
            queue.push(dependent);
          }
        }
      }
    }

    return result;
  }

  /**
   * 验证依赖链是否有效
   */
  validateDependencyChain(skillName: string, availableSkills: Set<string>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const node = this.dependencyGraph.get(skillName);

    if (!node) {
      return { valid: true, errors: [] };
    }

    for (const dep of node.dependencies) {
      if (!availableSkills.has(dep)) {
        errors.push(`Skill "${skillName}" requires "${dep}" which is not available`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 获取依赖图的可视化表示
   */
  getDependencyGraph(): Record<string, { dependencies: string[]; dependents: string[] }> {
    const graph: Record<string, { dependencies: string[]; dependents: string[] }> = {};

    for (const [name, node] of this.dependencyGraph) {
      graph[name] = {
        dependencies: node.dependencies,
        dependents: node.dependents,
      };
    }

    return graph;
  }

  /**
   * 清空依赖图
   */
  clear(): void {
    this.dependencyGraph.clear();
    logger.info('Dependency graph cleared');
  }
}

// 导出单例
export const skillDependencyResolver = new SkillDependencyResolver();

export default skillDependencyResolver;
