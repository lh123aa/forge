// Skill 注册器 - Skill 注册、发现、获取

import { createLogger } from '../utils/logger.js';
import { SkillDependencyResolver, skillDependencyResolver } from '../utils/skill-dependency-resolver.js';
import type { Skill, SkillMeta, SkillCategory } from '../types/index.js';

const logger = createLogger('SkillRegistry');

/**
 * Skill 注册器选项
 */
export interface SkillRegistryOptions {
  /** 是否自动加载内置 Skill */
  autoLoadBuiltin?: boolean;
  /** 是否启用依赖管理 */
  enableDependencyResolution?: boolean;
}

/**
 * Skill 实例（包含元信息和实例）
 */
export interface SkillInstance {
  meta: SkillMeta;
  instance: Skill;
}

/**
 * Skill 注册器
 */
export class SkillRegistry {
  private skills: Map<string, SkillInstance> = new Map();
  private categories: Map<SkillCategory, Set<string>> = new Map();
  private options: SkillRegistryOptions;
  private dependencyResolver: SkillDependencyResolver;

  // 单例实例
  private static _defaultInstance: SkillRegistry | null = null;

  constructor(options?: SkillRegistryOptions) {
    this.options = {
      autoLoadBuiltin: true,
      enableDependencyResolution: true,
      ...options,
    };
    this.dependencyResolver = skillDependencyResolver;
  }

  /**
   * 获取全局默认实例（单例）
   */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry._defaultInstance) {
      SkillRegistry._defaultInstance = new SkillRegistry();
    }
    return SkillRegistry._defaultInstance;
  }

  /**
   * 重置全局实例（用于测试）
   */
  static resetInstance(): void {
    SkillRegistry._defaultInstance = null;
  }

  /**
   * 注册 Skill
   */
  register(skill: Skill): void {
    const { name, category } = skill.meta;

    if (this.skills.has(name)) {
      logger.warn(`Skill "${name}" 已存在，将被覆盖`);
    }

    this.skills.set(name, {
      meta: skill.meta,
      instance: skill,
    });

    // 按类别索引
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(name);

    // 注册依赖关系
    if (this.options.enableDependencyResolution && skill.meta.dependencies) {
      this.dependencyResolver.registerDependency(name, skill.meta.dependencies);
    }

    logger.info(`Skill "${name}" 注册成功`, { category });
  }

  /**
   * 批量注册 Skill
   */
  registerMany(skills: Skill[]): void {
    skills.forEach(skill => this.register(skill));
  }

  /**
   * 获取 Skill
   */
  get(name: string): Skill | null {
    return this.skills.get(name)?.instance || null;
  }

  /**
   * 获取 Skill 元信息
   */
  getMeta(name: string): SkillMeta | null {
    return this.skills.get(name)?.meta || null;
  }

  /**
   * 获取所有 Skill 名称
   */
  getAllNames(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * 按类别获取 Skill
   */
  getByCategory(category: SkillCategory): SkillMeta[] {
    const names = this.categories.get(category);
    if (!names) return [];

    return Array.from(names)
      .map(name => this.skills.get(name)?.meta)
      .filter((meta): meta is SkillMeta => meta !== undefined);
  }

  /**
   * 检查 Skill 是否存在
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 移除 Skill
   */
  unregister(name: string): boolean {
    const instance = this.skills.get(name);
    if (!instance) return false;

    this.skills.delete(name);
    this.categories.get(instance.meta.category)?.delete(name);

    // 移除依赖关系
    if (this.options.enableDependencyResolution) {
      this.dependencyResolver.unregisterDependency(name);
    }

    logger.info(`Skill "${name}" 已移除`);
    return true;
  }

  /**
   * 获取所有 Skill
   */
  getAll(): SkillMeta[] {
    return Array.from(this.skills.values()).map(s => s.meta);
  }

  /**
   * 搜索 Skill
   */
  search(query: string): SkillMeta[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(meta =>
      meta.name.toLowerCase().includes(lowerQuery) ||
      meta.description.toLowerCase().includes(lowerQuery) ||
      meta.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 清空所有 Skill
   */
  clear(): void {
    this.skills.clear();
    this.categories.clear();
    if (this.options.enableDependencyResolution) {
      this.dependencyResolver.clear();
    }
    logger.info('所有 Skill 已清空');
  }

  /**
   * 解析 Skill 执行顺序（考虑依赖关系）
   */
  resolveExecutionOrder(skillNames: string[]): {
    success: boolean;
    executionOrder: string[];
    error?: string;
  } {
    if (!this.options.enableDependencyResolution) {
      return { success: true, executionOrder: skillNames };
    }

    const result = this.dependencyResolver.resolve(skillNames);
    if (!result.success) {
      logger.warn(`Dependency resolution failed: ${result.error}`);
    }
    return {
      success: result.success,
      executionOrder: result.executionOrder,
      error: result.error,
    };
  }

  /**
   * 获取 Skill 的依赖链
   */
  getDependencyChain(skillName: string): string[] {
    if (!this.options.enableDependencyResolution) {
      return [];
    }
    return this.dependencyResolver.getAllDependencies(skillName);
  }

  /**
   * 验证 Skill 的依赖是否都可用
   */
  validateDependencies(skillName: string): { valid: boolean; missingDeps: string[] } {
    if (!this.options.enableDependencyResolution) {
      return { valid: true, missingDeps: [] };
    }

    const availableSkills = new Set(this.skills.keys());
    const result = this.dependencyResolver.validateDependencyChain(skillName, availableSkills);

    if (!result.valid) {
      logger.warn(`Dependency validation failed for ${skillName}: ${result.errors.join(', ')}`);
    }

    return {
      valid: result.valid,
      missingDeps: result.errors
        .filter((e) => e.includes('not available'))
        .map((e) => e.match(/"([^"]+)"/)?.[1] || ''),
    };
  }

  /**
   * 获取入口 Skills（无前置依赖的 Skills）
   */
  getEntrySkills(): string[] {
    return this.getAll()
      .filter((meta) => meta.isEntry || !meta.dependencies || meta.dependencies.length === 0)
      .map((meta) => meta.name);
  }

  /**
   * 获取依赖图
   */
  getDependencyGraph(): Record<string, { dependencies: string[]; dependents: string[] }> {
    if (!this.options.enableDependencyResolution) {
      return {};
    }
    return this.dependencyResolver.getDependencyGraph();
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; byCategory: Record<SkillCategory, number> } {
    const byCategory: Record<SkillCategory, number> = {
      ask: 0,
      search: 0,
      analyze: 0,
      generate: 0,
      format: 0,
      io: 0,
      observe: 0,
      utility: 0,
      workflow: 0,
      plan: 0,
    };

    this.skills.forEach(instance => {
      byCategory[instance.meta.category]++;
    });

    return {
      total: this.skills.size,
      byCategory,
    };
  }
}

// 导出默认实例（单例），便于直接使用
export default SkillRegistry.getInstance();
