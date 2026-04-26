// DIContainer - 依赖注入容器
// 用于 Skill 的依赖管理和懒加载

import { createLogger } from './logger.js';

const logger = createLogger('DIContainer');

/**
 * 依赖注册信息
 */
interface DependencyRegistry<T> {
  instance?: T;
  factory?: () => T;
  singleton: boolean;
}

/**
 * 依赖注入容器
 * 支持单例和工厂模式，用于管理 Skill 的依赖
 */
export class DIContainer {
  private dependencies: Map<string, DependencyRegistry<unknown>> = new Map();

  /**
   * 注册依赖（单例模式）
   */
  registerSingleton<T>(token: string, instance: T): void {
    if (this.dependencies.has(token)) {
      logger.warn(`Dependency already registered: ${token}, overwriting`);
    }
    this.dependencies.set(token, { instance, singleton: true });
    logger.debug(`Registered singleton: ${token}`);
  }

  /**
   * 注册依赖（工厂模式）
   */
  registerFactory<T>(token: string, factory: () => T): void {
    if (this.dependencies.has(token)) {
      logger.warn(`Dependency already registered: ${token}, overwriting`);
    }
    this.dependencies.set(token, { factory, singleton: false });
    logger.debug(`Registered factory: ${token}`);
  }

  /**
   * 注册依赖（自动选择单例或工厂）
   */
  register<T>(token: string, instanceOrFactory: T | (() => T), asSingleton = true): void {
    if (typeof instanceOrFactory === 'function') {
      this.registerFactory(token, instanceOrFactory as () => T);
    } else if (asSingleton) {
      this.registerSingleton(token, instanceOrFactory);
    } else {
      this.registerFactory(token, () => instanceOrFactory);
    }
  }

  /**
   * 获取依赖
   */
  resolve<T>(token: string): T {
    const registry = this.dependencies.get(token);

    if (!registry) {
      throw new Error(`Dependency not found: ${token}`);
    }

    if (registry.singleton) {
      if (!registry.instance) {
        // 工厂还没被调用，先调用工厂创建实例
        if (registry.factory) {
          registry.instance = registry.factory();
        } else {
          throw new Error(`Singleton instance not initialized: ${token}`);
        }
      }
      return registry.instance as T;
    }

    // 非单例模式，每次都创建新实例
    if (registry.factory) {
      return registry.factory() as T;
    }

    throw new Error(`Factory not found for: ${token}`);
  }

  /**
   * 检查依赖是否存在
   */
  has(token: string): boolean {
    return this.dependencies.has(token);
  }

  /**
   * 移除依赖
   */
  unregister(token: string): boolean {
    const result = this.dependencies.delete(token);
    if (result) {
      logger.debug(`Unregistered: ${token}`);
    }
    return result;
  }

  /**
   * 清空所有依赖
   */
  clear(): void {
    this.dependencies.clear();
    logger.info('Container cleared');
  }

  /**
   * 获取所有注册的依赖
   */
  getRegisteredTokens(): string[] {
    return Array.from(this.dependencies.keys());
  }
}

/**
 * 全局容器实例
 */
let globalContainer: DIContainer | null = null;

export function getContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = new DIContainer();
  }
  return globalContainer;
}

export function resetContainer(): void {
  if (globalContainer) {
    globalContainer.clear();
    globalContainer = null;
  }
}

export default DIContainer;
