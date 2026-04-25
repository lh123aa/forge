// Skill 注册器 - Skill 注册、发现、获取

import { createLogger } from '../utils/logger.js';
import type { Skill, SkillMeta, SkillCategory } from '../types/index.js';

const logger = createLogger('SkillRegistry');

/**
 * Skill 注册器选项
 */
export interface SkillRegistryOptions {
  /** 是否自动加载内置 Skill */
  autoLoadBuiltin?: boolean;
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

  // 单例实例
  private static _defaultInstance: SkillRegistry | null = null;

  constructor(options?: SkillRegistryOptions) {
    this.options = {
      autoLoadBuiltin: true,
      ...options,
    };
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
  unregister(name: string): boolean { const instance = this.skills.get(name);
    if (!instance) return false;

    this.skills.delete(name);
    this.categories.get(instance.meta.category)?.delete(name);

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
    logger.info('所有 Skill 已清空');
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
