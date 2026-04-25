// ExternalSkillLoader - 外部技能加载器
// 加载 gstack 和 MiniMax 的 SKILL.md 文件

import { promises as fs } from 'fs';
import path from 'path';
import { SkillSource, type ExternalSkillMeta } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ExternalSkillLoader');

// 技能目录映射
interface SkillDirectory {
  basePath: string;
  source: SkillSource;
}

/**
 * ExternalSkillLoader 类
 * 负责从外部系统加载技能
 */
export class ExternalSkillLoader {
  private gstackPath: string;
  private minimaxPath: string;
  private skillCache: Map<string, string>;
  private metaCache: Map<string, ExternalSkillMeta>;

  constructor() {
    // 获取项目根目录
    const projectRoot = this.findProjectRoot();

    this.gstackPath = path.join(projectRoot, 'external', 'gstack');
    this.minimaxPath = path.join(projectRoot, 'external', 'minimax-skills', 'skills');
    this.skillCache = new Map();
    this.metaCache = new Map();
  }

  /**
   * 获取 gstack 技能内容
   */
  async loadGstackSkill(skillName: string): Promise<string> {
    const cacheKey = `gstack:${skillName}`;
    if (this.skillCache.has(cacheKey)) {
      return this.skillCache.get(cacheKey)!;
    }

    const skillPath = path.join(this.gstackPath, skillName, 'SKILL.md');

    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      this.skillCache.set(cacheKey, content);
      logger.debug(`Loaded gstack skill: ${skillName}`);
      return content;
    } catch (error) {
      logger.error(`Failed to load gstack skill: ${skillName}`, { error });
      throw new Error(`Gstack skill not found: ${skillName}`);
    }
  }

  /**
   * 获取 MiniMax 技能内容
   */
  async loadMinimaxSkill(skillName: string): Promise<string> {
    const cacheKey = `minimax:${skillName}`;
    if (this.skillCache.has(cacheKey)) {
      return this.skillCache.get(cacheKey)!;
    }

    const skillPath = path.join(this.minimaxPath, skillName, 'SKILL.md');

    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      this.skillCache.set(cacheKey, content);
      logger.debug(`Loaded minimax skill: ${skillName}`);
      return content;
    } catch (error) {
      logger.error(`Failed to load minimax skill: ${skillName}`, { error });
      throw new Error(`Minimax skill not found: ${skillName}`);
    }
  }

  /**
   * 获取技能内容（根据来源）
   */
  async getSkillContent(source: SkillSource, skill: string): Promise<string> {
    switch (source) {
      case SkillSource.GSTACK:
        return this.loadGstackSkill(skill);
      case SkillSource.MINIMAX:
        return this.loadMinimaxSkill(skill);
      default:
        throw new Error(`Unknown skill source: ${source}`);
    }
  }

  /**
   * 获取技能元信息
   */
  async getSkillMeta(source: SkillSource, skill: string): Promise<ExternalSkillMeta> {
    const cacheKey = `${source}:${skill}`;
    if (this.metaCache.has(cacheKey)) {
      return this.metaCache.get(cacheKey)!;
    }

    const content = await this.getSkillContent(source, skill);
    const meta = this.parseSkillMeta(content, source, skill);

    this.metaCache.set(cacheKey, meta);
    return meta;
  }

  /**
   * 列出 gstack 可用技能
   */
  async listGstackSkills(): Promise<string[]> {
    return this.listSkillsInDirectory(this.gstackPath);
  }

  /**
   * 列出 MiniMax 可用技能
   */
  async listMinimaxSkills(): Promise<string[]> {
    return this.listSkillsInDirectory(this.minimaxPath);
  }

  /**
   * 列出所有可用技能
   */
  async listAvailableSkills(): Promise<{ gstack: string[]; minimax: string[] }> {
    const [gstack, minimax] = await Promise.all([
      this.listGstackSkills(),
      this.listMinimaxSkills(),
    ]);

    return { gstack, minimax };
  }

  /**
   * 列出所有技能（包括完整路径）
   */
  async listAllSkills(): Promise<ExternalSkillMeta[]> {
    const skills: ExternalSkillMeta[] = [];

    // gstack 技能
    const gstackSkills = await this.listGstackSkills();
    for (const skill of gstackSkills) {
      try {
        const meta = await this.getSkillMeta(SkillSource.GSTACK, skill);
        skills.push(meta);
      } catch (error) {
        logger.warn(`Failed to get meta for gstack skill: ${skill}`);
      }
    }

    // minimax 技能
    const minimaxSkills = await this.listMinimaxSkills();
    for (const skill of minimaxSkills) {
      try {
        const meta = await this.getSkillMeta(SkillSource.MINIMAX, skill);
        skills.push(meta);
      } catch (error) {
        logger.warn(`Failed to get meta for minimax skill: ${skill}`);
      }
    }

    return skills;
  }

  /**
   * 检查技能是否存在
   */
  async exists(source: SkillSource, skill: string): Promise<boolean> {
    try {
      await this.getSkillContent(source, skill);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.skillCache.clear();
    this.metaCache.clear();
  }

  // ==================== 私有方法 ====================

  /**
   * 查找项目根目录
   */
  private findProjectRoot(): string {
    // 尝试从当前文件的目录向上查找
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const srcDir = path.dirname(currentDir);
    const projectRoot = path.dirname(srcDir);

    // 验证是否为项目根目录（应该有 package.json）
    return projectRoot;
  }

  /**
   * 列出目录下的技能
   */
  private async listSkillsInDirectory(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const skills: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // 检查是否有 SKILL.md 文件
          const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md');
          try {
            await fs.access(skillMdPath);
            skills.push(entry.name);
          } catch {
            // 目录存在但没有 SKILL.md，跳过
          }
        }
      }

      return skills.sort();
    } catch (error) {
      logger.error(`Failed to list skills in: ${dirPath}`, { error });
      return [];
    }
  }

  /**
   * 解析技能元信息
   */
  private parseSkillMeta(
    content: string,
    source: SkillSource,
    skillName: string
  ): ExternalSkillMeta {
    // 解析 YAML front matter
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let description = skillName;
    const skills: string[] = [skillName];

    if (frontMatterMatch) {
      const frontMatter = frontMatterMatch[1];
      const descMatch = frontMatter.match(/description:\s*\|?\s*\n?([\s\S]*?)(?=\n\w|\n---|$)/i);
      if (descMatch) {
        description = descMatch[1].replace(/\n+/g, ' ').trim();
      }
    }

    // 获取子技能列表（如果是技能目录）
    let basePath = '';
    switch (source) {
      case SkillSource.GSTACK:
        basePath = path.join(this.gstackPath, skillName);
        break;
      case SkillSource.MINIMAX:
        basePath = path.join(this.minimaxPath, skillName);
        break;
    }

    return {
      name: skillName,
      source,
      path: basePath,
      description,
      skills,
    };
  }
}

/**
 * 导出单例
 */
let globalLoader: ExternalSkillLoader | null = null;

export function getExternalSkillLoader(): ExternalSkillLoader {
  if (!globalLoader) {
    globalLoader = new ExternalSkillLoader();
  }
  return globalLoader;
}
