// 错误处理工具 - 统一错误处理和日志记录

import {
  SCAError,
  ErrorCode,
  ErrorSeverity,
  ErrorRecoverable,
  type ErrorContext,
  type RecoverySuggestion,
} from '../types/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ErrorHandler');

/**
 * 错误处理配置
 */
export interface ErrorHandlerConfig {
  /** 是否记录错误堆栈 */
  logStackTrace?: boolean;
  /** 是否发送错误通知 */
  notifyOnError?: boolean;
  /** 错误通知回调 */
  onErrorNotify?: (error: SCAError) => void | Promise<void>;
  /** 是否自动恢复可恢复错误 */
  autoRecover?: boolean;
  /** 最大连续错误数 */
  maxConsecutiveErrors?: number;
}

/**
 * 错误统计
 */
export interface ErrorStats {
  total: number;
  byCode: Record<string, number>;
  bySeverity: Record<string, number>;
  consecutiveErrors: number;
  lastError: Date | null;
}

/**
 * 全局错误处理器
 */
export class ErrorHandler {
  private config: Required<ErrorHandlerConfig>;
  private stats: ErrorStats;
  private errorListeners: Array<(error: SCAError) => void | Promise<void>> = [];

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      logStackTrace: config.logStackTrace ?? true,
      notifyOnError: config.notifyOnError ?? false,
      onErrorNotify: config.onErrorNotify ?? (() => {}),
      autoRecover: config.autoRecover ?? false,
      maxConsecutiveErrors: config.maxConsecutiveErrors ?? 10,
    };

    this.stats = {
      total: 0,
      byCode: {},
      bySeverity: {},
      consecutiveErrors: 0,
      lastError: null,
    };
  }

  /**
   * 处理错误
   */
  handle(error: unknown, context?: ErrorContext): SCAError {
    // 如果已经是 SCAError，直接处理
    if (error instanceof SCAError) {
      return this.processError(error, context);
    }

    // 转换普通错误为 SCAError
    const scaError = this.wrapError(error, context);
    return this.processError(scaError, context);
  }

  /**
   * 处理错误并返回结果
   */
  handleResult<T>(
    error: unknown,
    context?: ErrorContext
  ): { success: false; error: SCAError } | { success: true; data: T } {
    if (error instanceof SCAError) {
      const processed = this.processError(error, context);
      return { success: false, error: processed };
    }

    if (error instanceof Error) {
      const processed = this.wrapError(error, context);
      return { success: false, error: this.processError(processed, context) };
    }

    // 未知错误
    const processed = new SCAError(String(error), {
      code: ErrorCode.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      recoverable: ErrorRecoverable.NO,
      context,
    });
    return { success: false, error: this.processError(processed, context) };
  }

  /**
   * 包装错误为 SCAError
   */
  wrapError(error: unknown, context?: ErrorContext): SCAError {
    if (error instanceof SCAError) {
      return error;
    }

    if (error instanceof Error) {
      // 根据错误类型推断错误码
      const code = this.inferErrorCode(error);
      const severity = this.inferSeverity(error);

      return new SCAError(error.message, {
        code,
        severity,
        recoverable: ErrorRecoverable.MANUAL,
        context,
        cause: error,
      });
    }

    return new SCAError(String(error), {
      code: ErrorCode.UNKNOWN,
      context,
    });
  }

  /**
   * 处理错误（内部方法）
   */
  private processError(error: SCAError, context?: ErrorContext): SCAError {
    // 创建新的错误对象，合并上下文
    const mergedContext = {
      ...error.context,
      ...context,
    };

    // 更新统计
    this.stats.total++;
    this.stats.byCode[error.code] = (this.stats.byCode[error.code] || 0) + 1;
    this.stats.bySeverity[error.severity] = (this.stats.bySeverity[error.severity] || 0) + 1;
    this.stats.consecutiveErrors++;
    this.stats.lastError = error.timestamp;

    // 记录日志
    this.logError(error);

    // 检查是否超过最大连续错误
    if (this.stats.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      logger.error('Max consecutive errors reached', {
        count: this.stats.consecutiveErrors,
      });
    }

    // 通知监听器
    this.notifyListeners(error);

    // 错误通知
    if (this.config.notifyOnError) {
      this.config.onErrorNotify(error);
    }

    // 返回带有合并上下文的错误
    return new SCAError(error.message, {
      code: error.code,
      severity: error.severity,
      recoverable: error.recoverable,
      context: mergedContext,
      suggestions: error.suggestions,
      cause: error.cause,
    });
  }

  /**
   * 记录错误
   */
  private logError(error: SCAError): void {
    const logMethod =
      error.severity === ErrorSeverity.CRITICAL
        ? logger.error
        : error.severity === ErrorSeverity.ERROR
          ? logger.error
          : error.severity === ErrorSeverity.WARNING
            ? logger.warn
            : logger.info;

    logMethod(`[${error.code}] ${error.message}`, {
      code: error.code,
      severity: error.severity,
      recoverable: error.recoverable,
      context: error.context,
      timestamp: error.timestamp.toISOString(),
      stack: this.config.logStackTrace ? error.stack : undefined,
    });
  }

  /**
   * 通知错误监听器
   */
  private async notifyListeners(error: SCAError): Promise<void> {
    for (const listener of this.errorListeners) {
      try {
        await listener(error);
      } catch (listenerError) {
        logger.error('Error in error listener', {
          error: listenerError,
        });
      }
    }
  }

  /**
   * 添加错误监听器
   */
  onError(listener: (error: SCAError) => void | Promise<void>): () => void {
    this.errorListeners.push(listener);
    // 返回取消订阅函数
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  /**
   * 获取错误统计
   */
  getStats(): ErrorStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      byCode: {},
      bySeverity: {},
      consecutiveErrors: 0,
      lastError: null,
    };
  }

  /**
   * 标记成功（重置连续错误计数）
   */
  markSuccess(): void {
    this.stats.consecutiveErrors = 0;
  }

  /**
   * 根据错误类型推断错误码
   */
  private inferErrorCode(error: Error): ErrorCode {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (name.includes('timeout') || message.includes('timeout')) {
      return ErrorCode.TIMEOUT;
    }
    if (name.includes('typeerror') || message.includes('type')) {
      return ErrorCode.VALIDATION_ERROR;
    }
    if (name.includes('reference') || message.includes('not defined')) {
      return ErrorCode.VALIDATION_ERROR;
    }
    if (name.includes('syntax')) {
      return ErrorCode.VALIDATION_ERROR;
    }
    if (name.includes('range')) {
      return ErrorCode.VALIDATION_ERROR;
    }

    return ErrorCode.UNKNOWN;
  }

  /**
   * 根据错误类型推断严重级别
   */
  private inferSeverity(error: Error): ErrorSeverity {
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();

    // 严重错误
    if (
      name.includes('typeerror') ||
      name.includes('referenceerror') ||
      name.includes('syntaxerror')
    ) {
      return ErrorSeverity.ERROR;
    }
    if (name.includes('range') || name.includes('syntax')) {
      return ErrorSeverity.ERROR;
    }
    if (
      message.includes('permission') ||
      message.includes('denied') ||
      message.includes('econnrefused')
    ) {
      return ErrorSeverity.ERROR;
    }

    // 警告级别
    if (name.includes('deprecation') || message.includes('deprecated')) {
      return ErrorSeverity.WARNING;
    }
    if (name.includes('timeout') || message.includes('timeout')) {
      return ErrorSeverity.WARNING;
    }

    // 默认信息级别
    return ErrorSeverity.INFO;
  }
}

// ========== 错误处理装饰器 ==========

/**
 * 错误处理装饰器工厂
 */
export function withErrorHandler(
  handler: ErrorHandler,
  context?: ErrorContext
): <T>(fn: () => Promise<T>) => Promise<T> {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      throw handler.handle(error, context);
    }
  };
}

/**
 * 带默认值的错误处理
 */
export async function withDefaultValue<T>(
  error: unknown,
  defaultValue: T,
  handler?: ErrorHandler
): Promise<T> {
  if (error) {
    if (handler) {
      handler.handle(error);
    }
    return defaultValue;
  }
  throw error;
}

// ========== 全局错误处理器实例 ==========

export const globalErrorHandler = new ErrorHandler();

export default ErrorHandler;
