// 用户模板管理器 - 用户上传模板的管理、增强的模板功能

import fs from 'fs/promises';
import path from 'path';
import { cwd } from 'process';
import crypto from 'crypto';
import Handlebars from 'handlebars';
import { createLogger } from './logger.js';
import { TemplateManager, type TemplateVariable } from './template-manager.js';

const logger = createLogger('UserTemplateManager');

/**
 * 模板版本
 */
export interface TemplateVersion {
  /** 版本号 */
  version: string;
  /** 创建时间 */
  createdAt: Date;
  /** 创建者 */
  author?: string;
  /** 变更说明 */
  changelog?: string;
  /** 模板源码 */
  source: string;
}

/**
 * 用户模板
 */
export interface UserTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板类型 */
  type: 'component' | 'page' | 'api' | 'hook' | 'type' | 'service' | 'model' | 'test' | 'workflow';
  /** 描述 */
  description: string;
  /** 编程语言 */
  language: string;
  /** 框架 */
  framework?: string;
  /** 标签 */
  tags: string[];
  /** 变量定义 */
  variables: TemplateVariable[];
  /** 版本列表 */
  versions: TemplateVersion[];
  /** 当前版本号 */
  currentVersion: string;
  /** 是否公开 */
  isPublic: boolean;
  /** 作者 */
  author?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 使用次数 */
  usageCount: number;
  /** 评分 */
  rating: number;
  /** 评分次数 */
  ratingCount: number;
}

/**
 * 模板上传选项
 */
export interface TemplateUploadOptions {
  /** 模板名称 */
  name: string;
  /** 模板类型 */
  type: UserTemplate['type'];
  /** 描述 */
  description?: string;
  /** 编程语言 */
  language: string;
  /** 框架（可选） */
  framework?: string;
  /** 标签 */
  tags?: string[];
  /** 模板源码 */
  source: string;
  /** 版本号（可选，默认 1.0.0） */
  version?: string;
  /** 变更说明 */
  changelog?: string;
  /** 作者 */
  author?: string;
  /** 是否公开 */
  isPublic?: boolean;
}

/**
 * 模板验证结果
 */
export interface TemplateValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: string[];
  /** 警告列表 */
  warnings: string[];
  /** 提取的变量 */
  extractedVariables: TemplateVariable[];
}

/**
 * 模板搜索过滤器
 */
export interface TemplateSearchFilter {
  /** 关键词 */
  query?: string;
  /** 类型 */
  type?: UserTemplate['type'];
  /** 语言 */
  language?: string;
  /** 框架 */
  framework?: string;
  /** 标签（必须包含所有指定的标签） */
  tags?: string[];
  /** 至少包含某个标签 */
  anyTag?: string[];
  /** 公开模板 */
  isPublic?: boolean;
  /** 作者 */
  author?: string;
  /** 排序字段 */
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'usageCount' | 'rating';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 分页 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
}

/**
 * 搜索结果
 */
export interface TemplateSearchResult {
  /** 模板列表 */
  templates: UserTemplate[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * 用户模板管理器
 */
export class UserTemplateManager {
  private userTemplatesDir: string;
  private templateManager: TemplateManager;
  private userTemplates: Map<string, UserTemplate> = new Map();

  constructor(userTemplatesDir?: string) {
    this.userTemplatesDir = userTemplatesDir || path.join(cwd(), 'data', 'templates', 'user');
    this.templateManager = new TemplateManager();
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await this.templateManager.initialize();
    await this.loadUserTemplates();
    logger.info('User template manager initialized', {
      templateCount: this.userTemplates.size,
    });
  }

  /**
   * 加载用户模板
   */
  private async loadUserTemplates(): Promise<void> {
    try {
      await fs.mkdir(this.userTemplatesDir, { recursive: true });
      const files = await fs.readdir(this.userTemplatesDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.userTemplatesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const template = JSON.parse(content) as UserTemplate;

        // 恢复日期对象
        template.createdAt = new Date(template.createdAt);
        template.updatedAt = new Date(template.updatedAt);
        template.versions = template.versions.map(v => ({
          ...v,
          createdAt: new Date(v.createdAt),
        }));

        this.userTemplates.set(template.id, template);
      }
    } catch (error) {
      logger.warn('Failed to load user templates', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 保存模板到磁盘
   */
  private async saveTemplateToDisk(template: UserTemplate): Promise<void> {
    const filePath = path.join(this.userTemplatesDir, `${template.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(template, null, 2), 'utf-8');
  }

  /**
   * 删除模板文件
   */
  private async deleteTemplateFile(templateId: string): Promise<void> {
    const filePath = path.join(this.userTemplatesDir, `${templateId}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // 忽略文件不存在的错误
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * 递增版本号
   */
  private incrementVersion(currentVersion: string, type: 'major' | 'minor' | 'patch' = 'minor'): string {
    const parts = currentVersion.split('.');
    const major = parseInt(parts[0] || '1', 10);
    const minor = parseInt(parts[1] || '0', 10);
    const patch = parseInt(parts[2] || '0', 10);

    switch (type) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * 验证模板
   */
  validateTemplate(source: string, name: string): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查空模板
    if (!source || source.trim().length === 0) {
      errors.push('模板源码不能为空');
    }

    // 检查模板名称
    if (!name || name.trim().length === 0) {
      errors.push('模板名称不能为空');
    } else if (name.length > 100) {
      errors.push('模板名称不能超过 100 个字符');
    }

    // 检查 Handlebars 语法
    try {
      Handlebars.compile(source);
    } catch (error) {
      errors.push(`Handlebars 语法错误: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 提取变量
    const extractedVariables = this.extractVariables(source);

    // 检查变量命名
    for (const variable of extractedVariables) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable.name)) {
        warnings.push(`变量名 "${variable.name}" 不符合命名规范，建议使用驼峰命名`);
      }
    }

    // 检查未使用的变量
    const usedVariables = this.extractUsedVariables(source);
    for (const variable of extractedVariables) {
      if (!usedVariables.includes(variable.name)) {
        warnings.push(`变量 "${variable.name}" 被定义但未使用`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      extractedVariables,
    };
  }

  /**
   * 从模板源码提取变量定义
   */
  private extractVariables(source: string): TemplateVariable[] {
    const variables: TemplateVariable[] = [];
    const varMatches = source.match(/\{\{(\w+)\}\}/g) || [];
    const uniqueVars = [...new Set(varMatches.map(m => m.replace(/[{}]/g, '')))];

    for (const name of uniqueVars) {
      // 跳过 Handlebars 内置关键字
      if (['else', 'each', 'if', 'unless', 'end', 'log', 'lookup'].includes(name)) {
        continue;
      }

      variables.push({
        name,
        type: 'string', // 默认类型
        required: false,
        description: `${name} variable`,
      });
    }

    return variables;
  }

  /**
   * 提取实际使用的变量
   */
  private extractUsedVariables(source: string): string[] {
    const used: string[] = [];

    // 匹配 {{variable}} 和 {{{variable}}}
    const matches = source.match(/\{\{[^}]+\}\}/g) || [];

    for (const match of matches) {
      // 去掉 {{ 和 }} 并处理前缀
      let content = match.replace(/^\{\{[^@]*/, '');
      if (content.endsWith('}}')) {
        content = content.slice(0, -2);
      }
      const trimmed = content.trim();

      // 跳过内联表达式
      if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('!')) {
        continue;
      }

      // 提取变量名（处理点号访问如 config.name）
      const varName = trimmed.split('.')[0].split(' ')[0];
      if (varName && !used.includes(varName)) {
        used.push(varName);
      }
    }

    return used;
  }

  /**
   * 上传模板
   */
  async uploadTemplate(options: TemplateUploadOptions): Promise<UserTemplate> {
    // 验证模板
    const validation = this.validateTemplate(options.source, options.name);
    if (!validation.valid) {
      throw new Error(`模板验证失败: ${validation.errors.join(', ')}`);
    }

    const now = new Date();
    const id = this.generateId();
    const version = options.version || '1.0.0';

    const template: UserTemplate = {
      id,
      name: options.name,
      type: options.type,
      description: options.description || '',
      language: options.language,
      framework: options.framework,
      tags: options.tags || [],
      variables: validation.extractedVariables,
      versions: [
        {
          version,
          createdAt: now,
          author: options.author,
          changelog: options.changelog,
          source: options.source,
        },
      ],
      currentVersion: version,
      isPublic: options.isPublic ?? false,
      author: options.author,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      rating: 0,
      ratingCount: 0,
    };

    this.userTemplates.set(id, template);
    await this.saveTemplateToDisk(template);

    // 注册到 Handlebars
    Handlebars.registerPartial(`user-${id}`, options.source);

    logger.info('Template uploaded', { id, name: options.name, version });

    return template;
  }

  /**
   * 更新模板
   */
  async updateTemplate(
    id: string,
    updates: Partial<Omit<TemplateUploadOptions, 'source'>> & { source?: string; versionType?: 'major' | 'minor' | 'patch' }
  ): Promise<UserTemplate> {
    const template = this.userTemplates.get(id);
    if (!template) {
      throw new Error(`模板不存在: ${id}`);
    }

    const now = new Date();

    // 如果提供了新源码，需要验证并更新版本
    if (updates.source) {
      const validation = this.validateTemplate(updates.source, updates.name || template.name);
      if (!validation.valid) {
        throw new Error(`模板验证失败: ${validation.errors.join(', ')}`);
      }

      const newVersion = this.incrementVersion(
        template.currentVersion,
        updates.versionType || 'minor'
      );

      template.versions.push({
        version: newVersion,
        createdAt: now,
        author: updates.author || template.author,
        changelog: updates.changelog,
        source: updates.source,
      });

      template.currentVersion = newVersion;
      template.variables = validation.extractedVariables;

      // 更新 Handlebars 注册
      Handlebars.registerPartial(`user-${id}`, updates.source);
    }

    // 更新元数据
    if (updates.name !== undefined) template.name = updates.name;
    if (updates.type !== undefined) template.type = updates.type;
    if (updates.description !== undefined) template.description = updates.description;
    if (updates.language !== undefined) template.language = updates.language;
    if (updates.framework !== undefined) template.framework = updates.framework;
    if (updates.tags !== undefined) template.tags = updates.tags;
    if (updates.isPublic !== undefined) template.isPublic = updates.isPublic;
    if (updates.author !== undefined) template.author = updates.author;

    template.updatedAt = now;

    await this.saveTemplateToDisk(template);

    logger.info('Template updated', { id, name: template.name });

    return template;
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<void> {
    const template = this.userTemplates.get(id);
    if (!template) {
      throw new Error(`模板不存在: ${id}`);
    }

    this.userTemplates.delete(id);
    await this.deleteTemplateFile(id);

    // 取消注册 Handlebars
    Handlebars.unregisterPartial(`user-${id}`);

    logger.info('Template deleted', { id });
  }

  /**
   * 获取模板
   */
  getTemplate(id: string): UserTemplate | undefined {
    return this.userTemplates.get(id);
  }

  /**
   * 根据 ID 列表获取模板
   */
  getTemplatesByIds(ids: string[]): UserTemplate[] {
    return ids.map(id => this.userTemplates.get(id)).filter((t): t is UserTemplate => t !== undefined);
  }

  /**
   * 渲染模板
   */
  renderTemplate(id: string, data: Record<string, unknown>): string {
    const template = this.userTemplates.get(id);
    if (!template) {
      throw new Error(`模板不存在: ${id}`);
    }

    const currentSource = template.versions.find(v => v.version === template.currentVersion)?.source;
    if (!currentSource) {
      throw new Error(`模板版本不存在: ${template.currentVersion}`);
    }

    // 增加使用计数
    template.usageCount++;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    this.saveTemplateToDisk(template).catch(() => {}); // 异步保存，不阻塞

    const compiled = Handlebars.compile(currentSource);
    return compiled(data);
  }

  /**
   * 搜索模板
   */
  search(filter: TemplateSearchFilter): TemplateSearchResult {
    let results = Array.from(this.userTemplates.values());

    // 关键词过滤
    if (filter.query) {
      const lowerQuery = filter.query.toLowerCase();
      results = results.filter(
        t =>
          t.name.toLowerCase().includes(lowerQuery) ||
          t.description.toLowerCase().includes(lowerQuery) ||
          t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // 类型过滤
    if (filter.type) {
      results = results.filter(t => t.type === filter.type);
    }

    // 语言过滤
    if (filter.language) {
      results = results.filter(t => t.language.toLowerCase() === filter.language!.toLowerCase());
    }

    // 框架过滤
    if (filter.framework) {
      results = results.filter(t => t.framework?.toLowerCase() === filter.framework!.toLowerCase());
    }

    // 标签过滤（必须包含所有）
    if (filter.tags && filter.tags.length > 0) {
      results = results.filter(t => filter.tags!.every(tag => t.tags.includes(tag)));
    }

    // 至少包含某个标签
    if (filter.anyTag && filter.anyTag.length > 0) {
      results = results.filter(t => filter.anyTag!.some(tag => t.tags.includes(tag)));
    }

    // 公开状态过滤
    if (filter.isPublic !== undefined) {
      results = results.filter(t => t.isPublic === filter.isPublic);
    }

    // 作者过滤
    if (filter.author) {
      results = results.filter(t => t.author?.toLowerCase() === filter.author!.toLowerCase());
    }

    // 排序
    const sortBy = filter.sortBy || 'updatedAt';
    const sortOrder = filter.sortOrder || 'desc';
    results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'updatedAt':
          comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
        case 'usageCount':
          comparison = a.usageCount - b.usageCount;
          break;
        case 'rating':
          comparison = a.rating - b.rating;
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // 分页
    const page = filter.page || 1;
    const pageSize = filter.pageSize || 20;
    const total = results.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paginatedResults = results.slice(start, start + pageSize);

    return {
      templates: paginatedResults,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * 获取用户的所有模板
   */
  getTemplatesByAuthor(author: string): UserTemplate[] {
    return Array.from(this.userTemplates.values()).filter(t => t.author === author);
  }

  /**
   * 获取公开模板
   */
  getPublicTemplates(): UserTemplate[] {
    return Array.from(this.userTemplates.values()).filter(t => t.isPublic);
  }

  /**
   * 获取所有模板（简化列表，仅元数据）
   */
  getAllMeta(): Array<{
    name: string;
    type: string;
    description: string;
    language: string;
    framework?: string;
    tags: string[];
    variables: TemplateVariable[];
  }> {
    return Array.from(this.userTemplates.values()).map(t => ({
      name: t.name,
      type: t.type,
      description: t.description,
      language: t.language,
      framework: t.framework,
      tags: t.tags,
      variables: t.variables,
    }));
  }

  /**
   * 评分模板
   */
  async rateTemplate(id: string, rating: number): Promise<void> {
    const template = this.userTemplates.get(id);
    if (!template) {
      throw new Error(`模板不存在: ${id}`);
    }

    if (rating < 1 || rating > 5) {
      throw new Error('评分必须在 1-5 之间');
    }

    // 计算新的平均评分
    const totalRating = template.rating * template.ratingCount + rating;
    template.ratingCount++;
    template.rating = totalRating / template.ratingCount;
    template.updatedAt = new Date();

    await this.saveTemplateToDisk(template);
  }

  /**
   * 导出模板
   */
  exportTemplate(id: string, format: 'json' | 'hbs' = 'json'): string | UserTemplate {
    const template = this.userTemplates.get(id);
    if (!template) {
      throw new Error(`模板不存在: ${id}`);
    }

    if (format === 'json') {
      return JSON.stringify(template, null, 2);
    }

    // 返回模板对象（包含所有版本）
    return template;
  }

  /**
   * 导入模板
   */
  async importTemplate(data: string | UserTemplate, overwrite = false): Promise<UserTemplate> {
    let template: UserTemplate;

    if (typeof data === 'string') {
      template = JSON.parse(data);
    } else {
      template = data;
    }

    // 检查是否已存在
    const existing = this.userTemplates.get(template.id);
    if (existing && !overwrite) {
      throw new Error(`模板已存在: ${template.id}，使用 overwrite=true 覆盖`);
    }

    // 恢复日期对象
    template.createdAt = new Date(template.createdAt);
    template.updatedAt = new Date(template.updatedAt);
    template.versions = template.versions.map(v => ({
      ...v,
      createdAt: new Date(v.createdAt),
    }));

    this.userTemplates.set(template.id, template);
    await this.saveTemplateToDisk(template);

    // 注册 Handlebars
    const currentSource = template.versions.find(v => v.version === template.currentVersion)?.source;
    if (currentSource) {
      Handlebars.registerPartial(`user-${template.id}`, currentSource);
    }

    logger.info('Template imported', { id: template.id, name: template.name });

    return template;
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalTemplates: number;
    publicTemplates: number;
    privateTemplates: number;
    byType: Record<string, number>;
    byLanguage: Record<string, number>;
    byFramework: Record<string, number>;
    totalUsage: number;
  } {
    const templates = Array.from(this.userTemplates.values());

    const byType: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    const byFramework: Record<string, number> = {};
    let totalUsage = 0;

    for (const t of templates) {
      byType[t.type] = (byType[t.type] || 0) + 1;
      byLanguage[t.language] = (byLanguage[t.language] || 0) + 1;
      if (t.framework) {
        byFramework[t.framework] = (byFramework[t.framework] || 0) + 1;
      }
      totalUsage += t.usageCount;
    }

    return {
      totalTemplates: templates.length,
      publicTemplates: templates.filter(t => t.isPublic).length,
      privateTemplates: templates.filter(t => !t.isPublic).length,
      byType,
      byLanguage,
      byFramework,
      totalUsage,
    };
  }
}

// 导出单例
let userTemplateManager: UserTemplateManager | null = null;

export function getUserTemplateManager(): UserTemplateManager {
  if (!userTemplateManager) {
    userTemplateManager = new UserTemplateManager();
  }
  return userTemplateManager;
}

export default UserTemplateManager;
