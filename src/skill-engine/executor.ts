// Skill 执行器 - Skill 统一执行入口、异常捕获

import { createLogger } from '../utils/logger.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Skill, SkillInput, SkillOutput, SkillStatusCode } from '../types/index.js';
import { SkillRegistry } from './registry.js';
import { SkillValidator } from './validator.js';

const logger = createLogger('SkillExecutor');

/**
 * Skill 执行上下文
 */
export interface ExecutionContext {
  traceId: string;
  startTime: number;
  retryCount: number;
  maxRetries: number;
  skillName: string;
}

/**
 * Skill 执行选项
 */
export interface ExecutionOptions {
  /** 超时时间(ms) */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 是否捕获异常 */
  catchErrors?: boolean;
  /** 执行前回调 */
  onBeforeExecute?: (input: SkillInput) => void | Promise<void>;
  /** 执行后回调 */
  onAfterExecute?: (output: SkillOutput) => void | Promise<void>;
  /** 异常回调 */
  onError?: (error: Error, context: ExecutionContext) => void | Promise<void>;
}

/**
 * 默认执行选项
 */
const defaultOptions: ExecutionOptions = {
  timeout: 60000, // 1分钟
  maxRetries: 3,
  catchErrors: true,
};

/**
 * Skill 执行器
 */
export class SkillExecutor {
  private registry: SkillRegistry;
  private validator: SkillValidator;
  private options: ExecutionOptions;

  constructor(registry: SkillRegistry, options?: Partial<ExecutionOptions>) {
    this.registry = registry;
    this.validator = new SkillValidator();
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * 执行 Skill
   */
  async execute(
    skillName: string,
    input: SkillInput,
    options?: Partial<ExecutionOptions>
  ): Promise<SkillOutput> {
    const execOptions = { ...this.options, ...options };
    const context: ExecutionContext = {
      traceId: input.traceId,
      startTime: Date.now(),
      retryCount: 0,
      maxRetries: execOptions.maxRetries!,
      skillName,
    };

    return this.executeWithRetry(skillName, input, context, execOptions);
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry(
    skillName: string,
    input: SkillInput,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<SkillOutput> {
    const skill = this.registry.get(skillName);

    if (!skill) {
      return this.createErrorOutput(500, `Skill "${skillName}" not found`);
    }

    // 执行前回调
    if (options.onBeforeExecute) {
      await options.onBeforeExecute(input);
    }

    try {
      // 执行 Skill（带超时）
      const timeoutId = setTimeout(() => {
        throw new Error('Skill execution timeout');
      }, options.timeout);

      const output = await skill.run(input);
      clearTimeout(timeoutId);

      // 校验输出
      if (!this.validator.validateOutput(output)) {
        logger.warn(`Skill "${skillName}" output validation failed`, { output });
        return this.createErrorOutput(500, 'Skill output validation failed');
      }

      // 执行后回调
      if (options.onAfterExecute) {
        await options.onAfterExecute(output);
      }

      logger.debug(`Skill "${skillName}" executed successfully`, {
        code: output.code,
        traceId: input.traceId,
      });

      return output;

    } catch (error) {
      return this.handleError(skillName, error, input, context, options);
    }
  }

  /**
   * 处理错误
   */
  private async handleError(
    skillName: string,
    error: unknown,
    input: SkillInput,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<SkillOutput> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`Skill "${skillName}" execution failed`, {
      error: errorMessage,
      traceId: input.traceId,
      retryCount: context.retryCount,
    });

    // 异常回调
    if (options.onError) {
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      await options.onError(errorObj, context);
    }

    // 判断是否可重试
    if (context.retryCount < context.maxRetries) {
      context.retryCount++;
      
      logger.info(`Retrying skill "${skillName}", attempt ${context.retryCount}/${context.maxRetries}`);
      
      return this.executeWithRetry(skillName, input, context, options);
    }

    // 重试耗尽
    return this.createErrorOutput(500, `Skill execution failed after ${context.maxRetries} retries: ${errorMessage}`);
  }

  /**
   * 创建错误输出
   */
  private createErrorOutput(code: SkillStatusCode, message: string): SkillOutput {
    return {
      code,
      data: {},
      message,
    };
  }

  /**
   * 批量执行多个 Skill
   */
  async executeMany(
    skills: Array<{ name: string; input: SkillInput }>,
    options?: Partial<ExecutionOptions>
  ): Promise<SkillOutput[]> {
    return Promise.all(
      skills.map(({ name, input }) => this.execute(name, input, options))
    );
  }

  /**
   * 设置执行选项
   */
  setOptions(options: Partial<ExecutionOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

export default SkillExecutor;
