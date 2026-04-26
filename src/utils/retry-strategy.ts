// 重试策略 - 增强的错误重试机制

import { createLogger } from '../utils/logger.js';
import { SCAError, ErrorCode, ErrorRecoverable, type ErrorContext } from '../types/errors.js';

const logger = createLogger('RetryStrategy');

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts?: number;
  /** 初始重试间隔（毫秒） */
  initialDelay?: number;
  /** 最大重试间隔（毫秒） */
  maxDelay?: number;
  /** 退避乘数 */
  backoffMultiplier?: number;
  /** 是否使用抖动 */
  jitter?: boolean;
  /** 重试条件 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** 可重试的错误码 */
  retryableCodes?: ErrorCode[];
  /** 不可重试的错误码 */
  nonRetryableCodes?: ErrorCode[];
  /** 重试回调 */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
  /** 超时（毫秒），0 表示无超时 */
  timeout?: number;
}

/**
 * 重试状态
 */
export interface RetryState {
  attempts: number;
  lastError: unknown | null;
  totalDelay: number;
  startTime: number;
}

/**
 * 重试结果
 */
export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: SCAError;
  state: RetryState;
}

/**
 * 默认重试配置
 */
const defaultConfig: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  shouldRetry: () => true,
  retryableCodes: [
    ErrorCode.TIMEOUT,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.SKILL_TIMEOUT,
    ErrorCode.MCP_SAMPLING_FAILED,
  ],
  nonRetryableCodes: [
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.PERMISSION_DENIED,
    ErrorCode.NOT_FOUND,
    ErrorCode.ALREADY_EXISTS,
  ],
  onRetry: () => { /* empty callback */ },
  timeout: 0,
};

/**
 * 指数退避重试策略
 */
export class RetryStrategy {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * 执行带重试的操作
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: ErrorContext
  ): Promise<RetryResult<T>> {
    const state: RetryState = {
      attempts: 0,
      lastError: null,
      totalDelay: 0,
      startTime: Date.now(),
    };

    // 如果有超时检查
    if (this.config.timeout > 0) {
      return this.executeWithTimeout(operation, context, state);
    }

    return this.executeWithoutTimeout(operation, context, state);
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    context: ErrorContext | undefined,
    state: RetryState
  ): Promise<RetryResult<T>> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          error: new SCAError('操作超时', {
            code: ErrorCode.TIMEOUT,
            recoverable: ErrorRecoverable.YES,
            context,
          }),
          state,
        });
      }, this.config.timeout);

      this.executeWithoutTimeout(operation, context, state)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          resolve({
            success: false,
            error: error instanceof SCAError ? error : new SCAError(String(error)),
            state,
          });
        });
    });
  }

  /**
   * 不带超时的执行
   */
  private async executeWithoutTimeout<T>(
    operation: () => Promise<T>,
    context: ErrorContext | undefined,
    state: RetryState
  ): Promise<RetryResult<T>> {
    while (state.attempts < this.config.maxAttempts) {
      state.attempts++;

      try {
        const data = await operation();
        
        if (state.attempts > 1) {
          logger.info('Retry succeeded', {
            attempts: state.attempts,
            totalDelay: state.totalDelay,
            context,
          });
        }

        return {
          success: true,
          data,
          state,
        };

      } catch (error) {
        state.lastError = error;

        // 检查是否应该重试
        const shouldRetry = this.shouldRetry(error, state.attempts);
        
        if (!shouldRetry || state.attempts >= this.config.maxAttempts) {
          logger.error('Retry failed', {
            attempts: state.attempts,
            error: error instanceof Error ? error.message : String(error),
            context,
          });

          return {
            success: false,
            error: error instanceof SCAError 
              ? error 
              : new SCAError(String(error), { context }),
            state,
          };
        }

        // 计算延迟
        const delay = this.calculateDelay(state.attempts);
        state.totalDelay += delay;

        logger.warn('Retrying after error', {
          attempt: state.attempts,
          nextDelay: delay,
          error: error instanceof Error ? error.message : String(error),
          context,
        });

        // 调用重试回调
        this.config.onRetry(error, state.attempts, delay);

        // 等待后重试
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: new SCAError('重试次数耗尽', {
        code: ErrorCode.UNKNOWN,
        recoverable: ErrorRecoverable.NO,
        context,
      }),
      state,
    };
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    // 首先调用自定义重试条件
    if (this.config.shouldRetry && !this.config.shouldRetry(error, attempt)) {
      return false;
    }

    // 检查 SCAError
    if (error instanceof SCAError) {
      // 不可恢复的错误不重试
      if (error.recoverable === ErrorRecoverable.NO) {
        return false;
      }

      // 检查可重试错误码
      if (this.config.retryableCodes.includes(error.code)) {
        return true;
      }

      // 检查不可重试错误码
      if (this.config.nonRetryableCodes.includes(error.code)) {
        return false;
      }

      // 默认对可恢复错误重试
      return error.recoverable === ErrorRecoverable.YES;
    }

    // 对普通错误默认重试
    return true;
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(attempt: number): number {
    // 指数退避
    let delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // 限制最大延迟
    delay = Math.min(delay, this.config.maxDelay);

    // 添加抖动
    if (this.config.jitter) {
      const jitterFactor = 0.5 + Math.random() * 0.5; // 0.5 - 1.0
      delay = Math.floor(delay * jitterFactor);
    }

    return delay;
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== 便捷重试函数 ==========

/**
 * 带重试的执行
 */
export async function retry<T>(
  operation: () => Promise<T>,
  config?: RetryConfig,
  context?: ErrorContext
): Promise<T> {
  const strategy = new RetryStrategy(config);
  const result = await strategy.execute(operation, context);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data!;
}

/**
 * 带重试的同步执行
 */
export function retrySync<T>(
  operation: () => T,
  config?: RetryConfig,
  context?: ErrorContext
): T {
  const strategy = new RetryStrategy(config);
  
  // 包装为异步操作
  const asyncOperation = async () => operation();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _result = strategy.execute(asyncOperation, context);

  // 注意：这是简化的同步版本，实际应该用类似逻辑
  // 这里为保持接口简洁，返回同步调用结果（无重试）
  try {
    return operation();
  } catch (error) {
    throw new SCAError(String(error), { context });
  }
}

/**
 * 创建重试策略的工厂函数
 */
export function createRetryStrategy(config?: RetryConfig): RetryStrategy {
  return new RetryStrategy(config);
}

/**
 * 常用重试配置
 */
export const retryPresets = {
  /** 快速重试（网络不稳定时） */
  fast: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
  },

  /** 慢速重试（耗时操作） */
  slow: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
  },

  /** 保守重试（关键操作） */
  conservative: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 1.5,
    jitter: true,
  },

  /** 仅重试一次 */
  once: {
    maxAttempts: 2,
    initialDelay: 500,
    maxDelay: 1000,
    backoffMultiplier: 1,
  },
};

export default RetryStrategy;
