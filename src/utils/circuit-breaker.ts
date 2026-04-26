// 熔断器 - 防止级联失败的弹性模式

import { createLogger } from './logger.js';
import type { EnhancedSCAError } from '../types/enhanced-errors.js';
import { ErrorCategory } from '../types/enhanced-errors.js';

const logger = createLogger('CircuitBreaker');

/**
 * 熔断器状态
 */
export enum CircuitState {
  /** 熔断器关闭，正常工作 */
  CLOSED = 'closed',
  /** 熔断器打开，拒绝请求 */
  OPEN = 'open',
  /** 熔断器半开，允许试探请求 */
  HALF_OPEN = 'half-open',
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 熔断器名称 */
  name?: string;
  /** 触发熔断的连续失败次数 */
  failureThreshold?: number;
  /** 熔断持续时间（毫秒） */
  resetTimeout?: number;
  /** 半开状态下允许的试探请求数 */
  halfOpenRequests?: number;
  /** 熔断器打开的成功率阈值 */
  successThreshold?: number;
  /** 监控的错误分类 */
  monitoredCategories?: ErrorCategory[];
  /** 熔断回调 */
  onCircuitOpen?: (circuitName: string, reason: string) => void;
  /** 熔断关闭回调 */
  onCircuitClose?: (circuitName: string) => void;
}

/**
 * 熔断器默认配置
 */
const defaultConfig: Required<CircuitBreakerConfig> = {
  name: 'default',
  failureThreshold: 5,
  resetTimeout: 60000,
  halfOpenRequests: 3,
  successThreshold: 0.5,
  monitoredCategories: [
    ErrorCategory.NETWORK,
    ErrorCategory.EXTERNAL,
    ErrorCategory.TIMEOUT,
  ],
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onCircuitOpen: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onCircuitClose: () => {},
};

/**
 * 熔断器统计
 */
interface CircuitBreakerStats {
  totalSuccesses: number;
  totalFailures: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  stateChangedAt: number;
}

/**
 * 熔断器
 */
export class CircuitBreaker {
  private config: Required<CircuitBreakerConfig>;
  private state: CircuitState = CircuitState.CLOSED;
  private stats: CircuitBreakerStats = {
    totalSuccesses: 0,
    totalFailures: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    stateChangedAt: Date.now(),
  };
  private halfOpenRequestsRemaining = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * 获取熔断器名称
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 检查是否允许请求
   */
  canExecute(): boolean {
    const state = this.state;
    
    if (state === CircuitState.CLOSED) {
      return true;
    }

    if (state === CircuitState.OPEN) {
      // 检查是否应该转换到半开状态
      this.checkStateTransition();
      return this.state === CircuitState.HALF_OPEN;
    }

    if (state === CircuitState.HALF_OPEN) {
      return this.halfOpenRequestsRemaining > 0;
    }

    return false;
  }

  /**
   * 执行带熔断保护的操作
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    if (!this.canExecute()) {
      logger.warn(`Circuit breaker [${this.config.name}] is OPEN, rejecting request`);

      if (fallback) {
        return fallback();
      }

      throw new Error(`Circuit breaker [${this.config.name}] is open`);
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));

      if (fallback) {
        try {
          return await fallback();
        } catch {
          throw error;
        }
      }

      throw error;
    }
  }

  /**
   * 记录成功
   */
  recordSuccess(): void {
    this.stats.totalSuccesses++;
    this.stats.consecutiveSuccesses++;
    this.stats.consecutiveFailures = 0;
    this.stats.lastSuccessTime = Date.now();

    // 在半开状态下
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.consecutiveSuccesses >= this.config.halfOpenRequests) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }

    logger.debug(`Circuit breaker [${this.config.name}] recorded success`, {
      consecutiveSuccesses: this.stats.consecutiveSuccesses,
      state: this.state,
    });
  }

  /**
   * 记录失败
   */
  recordFailure(error: Error): void {
    this.stats.totalFailures++;
    this.stats.consecutiveFailures++;
    this.stats.lastFailureTime = Date.now();
    this.stats.consecutiveSuccesses = 0;

    // 检查是否应该熔断
    if (this.state === CircuitState.CLOSED) {
      if (this.shouldTrip(error)) {
        this.transitionTo(CircuitState.OPEN);
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态下任何失败都立即打开熔断器
      this.transitionTo(CircuitState.OPEN);
    }

    logger.debug(`Circuit breaker [${this.config.name}] recorded failure`, {
      consecutiveFailures: this.stats.consecutiveFailures,
      state: this.state,
      error: error.message,
    });
  }

  /**
   * 检查是否应该触发熔断
   */
  private shouldTrip(error: Error): boolean {
    // 如果是 EnhancedSCAError，检查是否在监控的分类中
    if ('category' in error) {
      const enhancedError = error as unknown as EnhancedSCAError;
      if (
        this.config.monitoredCategories.length > 0 &&
        !this.config.monitoredCategories.includes(enhancedError.category)
      ) {
        return false;
      }
    }

    // 检查连续失败次数
    return this.stats.consecutiveFailures >= this.config.failureThreshold;
  }

  /**
   * 检查状态转换
   */
  private checkStateTransition(): void {
    if (this.state !== CircuitState.OPEN) {
      return;
    }

    const now = Date.now();
    const timeSinceStateChange = now - this.stats.stateChangedAt;

    // 到达重置时间，转换到半开状态
    if (timeSinceStateChange >= this.config.resetTimeout) {
      this.transitionTo(CircuitState.HALF_OPEN);
    }
  }

  /**
   * 转换到新状态
   */
  private transitionTo(newState: CircuitState): void {
    this.state = newState;
    this.stats.stateChangedAt = Date.now();

    if (newState === CircuitState.OPEN) {
      // 设置自动重置定时器
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
      }
      this.resetTimer = setTimeout(() => {
        this.checkStateTransition();
      }, this.config.resetTimeout);

      this.config.onCircuitOpen(
        this.config.name,
        `连续 ${this.stats.consecutiveFailures} 次失败`
      );

      logger.warn(`Circuit breaker [${this.config.name}] OPENED`, {
        consecutiveFailures: this.stats.consecutiveFailures,
        resetTimeout: this.config.resetTimeout,
      });
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenRequestsRemaining = this.config.halfOpenRequests;

      logger.info(`Circuit breaker [${this.config.name}] HALF_OPEN`, {
        allowedRequests: this.halfOpenRequestsRemaining,
      });
    } else if (newState === CircuitState.CLOSED) {
      // 清除重置定时器
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
        this.resetTimer = null;
      }

      // 重置统计
      this.stats.consecutiveFailures = 0;
      this.stats.consecutiveSuccesses = 0;

      this.config.onCircuitClose(this.config.name);

      logger.info(`Circuit breaker [${this.config.name}] CLOSED`, {
        totalSuccesses: this.stats.totalSuccesses,
        totalFailures: this.stats.totalFailures,
      });
    }
  }

  /**
   * 获取熔断器统计
   */
  getStats(): {
    name: string;
    state: CircuitState;
    stats: CircuitBreakerStats;
    config: Required<CircuitBreakerConfig>;
  } {
    return {
      name: this.config.name,
      state: this.state,
      stats: { ...this.stats },
      config: this.config,
    };
  }

  /**
   * 重置熔断器
   */
  reset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.state = CircuitState.CLOSED;
    this.stats = {
      totalSuccesses: 0,
      totalFailures: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      stateChangedAt: Date.now(),
    };

    logger.info(`Circuit breaker [${this.config.name}] reset`);
  }

  /**
   * 手动强制打开熔断器
   */
  forceOpen(reason?: string): void {
    logger.warn(`Circuit breaker [${this.config.name}] force opened: ${reason || 'manual'}`);
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * 手动强制关闭熔断器
   */
  forceClose(): void {
    logger.info(`Circuit breaker [${this.config.name}] force closed`);
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * 清理资源（供外部调用，如注册表移除时）
   */
  cleanup(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

// ========== 熔断器管理器 ==========

/**
 * 全局熔断器注册表
 */
class CircuitBreakerRegistry {
  private circuits: Map<string, CircuitBreaker> = new Map();

  /**
   * 获取或创建熔断器
   */
  getOrCreate(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = new CircuitBreaker({
        name,
        ...config,
      });
      this.circuits.set(name, circuit);
    }
    return circuit;
  }

  /**
   * 获取熔断器
   */
  get(name: string): CircuitBreaker | undefined {
    return this.circuits.get(name);
  }

  /**
   * 获取所有熔断器
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.circuits);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStats(): Array<{
    name: string;
    state: CircuitState;
    stats: CircuitBreakerStats;
  }> {
    return Array.from(this.circuits.values()).map(c => {
      const info = c.getStats();
      return {
        name: info.name,
        state: info.state,
        stats: info.stats,
      };
    });
  }

  /**
   * 重置所有熔断器
   */
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
  }

/**
    * 移除熔断器
    */
  remove(name: string): void {
    const circuit = this.circuits.get(name);
    if (circuit) {
      circuit.cleanup();
      this.circuits.delete(name);
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// ========== 便捷函数 ==========

/**
 * 创建带熔断保护的执行器
 */
export function withCircuitBreaker<T>(
  circuitName: string,
  operation: () => Promise<T>,
  fallback?: () => Promise<T>,
  config?: CircuitBreakerConfig
): Promise<T> {
  const circuit = circuitBreakerRegistry.getOrCreate(circuitName, config);
  return circuit.execute(operation, fallback);
}

/**
 * 获取熔断器状态
 */
export function getCircuitBreakerState(circuitName: string): CircuitState | undefined {
  return circuitBreakerRegistry.get(circuitName)?.getState();
}

export default {
  CircuitState,
  CircuitBreaker,
  circuitBreakerRegistry,
  withCircuitBreaker,
  getCircuitBreakerState,
};
