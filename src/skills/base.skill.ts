// BaseSkill 基类 - 所有 Skill 的基类

import type { Skill, SkillInput, SkillOutput, SkillMeta } from '../types/index.js';

/**
 * Skill 生命周期钩子接口
 */
export interface SkillLifecycle {
  /**
   * 初始化 - Skill 被注册后调用，用于加载资源、建立连接等
   */
  initialize?(): Promise<void>;

  /**
   * 清理 - Skill 被注销前调用，用于释放资源、关闭连接等
   */
  cleanup?(): Promise<void>;

  /**
   * 验证 - 检查 Skill 配置是否正确
   */
  validate?(): { valid: boolean; errors: string[] };
}

/**
 * Skill 配置
 */
export interface SkillConfig {
  /** 超时时间(ms) */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 是否启用 */
  enabled?: boolean;
  /** 自定义配置 */
  [key: string]: unknown;
}

/**
 * BaseSkill 抽象基类
 * 所有 Skill 必须继承此类
 */
export abstract class BaseSkill implements Skill {
  abstract readonly meta: SkillMeta;

  /** 内部状态标记 */
  private _initialized = false;
  private _config: SkillConfig = {};

  /**
   * 获取是否已初始化
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 获取当前配置
   */
  get config(): SkillConfig {
    return this._config;
  }

  /**
   * 设置配置
   */
  setConfig(config: SkillConfig): void {
    this._config = { ...this._config, ...config };
  }

  /**
   * 核心执行方法 - 子类必须实现
   */
  protected abstract execute(input: SkillInput): Promise<SkillOutput>;

  /**
   * 初始化方法 - 可被子类重写
   * 默认实现标记已初始化状态
   */
  async initialize(): Promise<void> {
    this._initialized = true;
  }

  /**
   * 清理方法 - 可被子类重写
   * 默认实现不做任何操作
   */
  async cleanup(): Promise<void> {
    // 默认实现为空
  }

  /**
   * 验证方法 - 可被子类重写
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.meta.name) {
      errors.push('Skill name is required');
    }
    if (!this.meta.description) {
      errors.push('Skill description is required');
    }
    if (!this.meta.category) {
      errors.push('Skill category is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 统一执行入口
   */
  async run(input: SkillInput): Promise<SkillOutput> {
    // 检查是否已初始化
    if (!this._initialized && this.initialize) {
      await this.initialize();
    }

    // 输入校验
    if (!this.validateInput(input)) {
      return {
        code: 500,
        data: {},
        message: `[${this.meta.name}] 输入格式校验失败`,
      };
    }

    // 执行业务逻辑
    try {
      const output = await this.execute(input);

      // 输出校验
      if (!this.validateOutput(output)) {
        return {
          code: 500,
          data: {},
          message: `[${this.meta.name}] 输出格式校验失败`,
        };
      }

      return output;
    } catch (error) {
      return {
        code: 500,
        data: {},
        message: `[${this.meta.name}] 执行异常: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 输入校验 - 可被子类重写
   */
  protected validateInput(input: SkillInput): boolean {
    return !!(
      input &&
      input.task
    );
  }

  /**
   * 输出校验 - 可被子类重写
   */
  protected validateOutput(output: SkillOutput): boolean {
    return !!(
      output &&
      typeof output.code === 'number' &&
      [200, 300, 400, 500].includes(output.code) &&
      output.message
    );
  }

  /**
   * 创建成功输出
   */
  protected success(data: Record<string, unknown> = {}, message?: string): SkillOutput {
    return {
      code: 200,
      data,
      message: message || `${this.meta.name} 执行成功`,
    };
  }

  /**
   * 创建需要用户交互的输出
   */
  protected needInput(data: Record<string, unknown> = {}, message?: string): SkillOutput {
    return {
      code: 300,
      data,
      message: message || `${this.meta.name} 需要用户输入`,
    };
  }

  /**
   * 创建可重试失败的输出
   */
  protected retryableError(message: string, data: Record<string, unknown> = {}): SkillOutput {
    return {
      code: 400,
      data,
      message: `[${this.meta.name}] ${message}`,
    };
  }

  /**
   * 创建不可重试失败的输出
   */
  protected fatalError(message: string, data: Record<string, unknown> = {}): SkillOutput {
    return {
      code: 500,
      data,
      message: `[${this.meta.name}] ${message}`,
    };
  }
}

export default BaseSkill;
