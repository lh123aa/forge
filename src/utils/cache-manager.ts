// 缓存管理器 - 提供通用内存缓存能力

import { createLogger } from '../utils/logger.js';

const logger = createLogger('CacheManager');

/**
 * 缓存配置
 */
export interface CacheOptions {
  /** 默认过期时间（毫秒），0 表示永不过期 */
  defaultTTL?: number;
  /** 最大缓存条目数，0 表示无限制 */
  maxSize?: number;
  /** 是否启用 LRU 淘汰策略 */
  enableLRU?: boolean;
  /** 缓存命中回调 */
  onHit?: (key: string) => void;
  /** 缓存miss回调 */
  onMiss?: (key: string) => void;
  /** 缓存过期回调 */
  onExpire?: (key: string, value: unknown) => void;
}

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number; // 0 表示永不过期
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
  hitRate: number;
}

/**
 * 通用缓存管理器
 * 支持 TTL、LRU、统计等功能
 */
export class CacheManager<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private options: Required<CacheOptions>;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    expirations: number;
  };

  constructor(options: CacheOptions = {}) {
    this.options = {
      defaultTTL: options.defaultTTL ?? 5 * 60 * 1000, // 默认 5 分钟
      maxSize: options.maxSize ?? 1000,
      enableLRU: options.enableLRU ?? true,
      onHit: options.onHit ?? (() => { /* empty callback */ }),
      onMiss: options.onMiss ?? (() => { /* empty callback */ }),
      onExpire: options.onExpire ?? (() => { /* empty callback */ }),
    };
    
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
    };

    // 定期清理过期缓存
    this.startCleanupTimer();
  }

  /**
   * 设置缓存
   */
  set(key: string, value: T, ttl?: number): void {
    const expiresAt = ttl === 0 ? 0 : (ttl ?? this.options.defaultTTL);
    const absoluteExpiry = expiresAt > 0 ? Date.now() + expiresAt : 0;

    // 检查是否需要淘汰
    if (this.options.maxSize > 0 && this.cache.size >= this.options.maxSize) {
      this.evict();
    }

    this.cache.set(key, {
      value,
      expiresAt: absoluteExpiry,
      accessCount: 0,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    });

    logger.debug('Cache set', { key, ttl: expiresAt });
  }

  /**
   * 获取缓存
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.options.onMiss(key);
      logger.debug('Cache miss', { key });
      return undefined;
    }

    // 检查是否过期
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.options.onExpire(key, entry.value);
      this.options.onMiss(key);
      logger.debug('Cache expired', { key });
      return undefined;
    }

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    // LRU: 移到最新位置
    if (this.options.enableLRU) {
      this.cache.set(key, entry);
    }

    this.stats.hits++;
    this.options.onHit(key);
    logger.debug('Cache hit', { key });
    
    return entry.value;
  }

  /**
   * 获取缓存（如果不存在则设置）
   */
  getOrSet(key: string, factory: () => T, ttl?: number): T {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * 异步获取缓存（如果不存在则设置）
   */
  async getOrSetAsync(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * 检查缓存是否存在（未过期）
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.expirations++;
      return false;
    }

    return true;
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { entriesRemoved: size });
  }

  /**
   * 批量删除（支持模式匹配）
   */
  deleteByPattern(pattern: string | RegExp): number {
    let count = 0;
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/\*/g, '.*')) 
      : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    logger.debug('Cache pattern delete', { pattern, count });
    return count;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
    };
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有缓存键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 手动触发过期清理
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.expirations++;
        this.options.onExpire(key, entry.value);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 淘汰最少使用的缓存项
   */
  private evict(): void {
    if (!this.options.enableLRU || this.cache.size === 0) {
      // 如果没有启用 LRU，删除最老的
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
      return;
    }

    // LRU: 删除最少使用的
    let minAccess = Infinity;
    let lruKey: string | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      logger.debug('LRU eviction', { key: lruKey, accessCount: minAccess });
    }
  }

  /**
   * 启动定期清理定时器
   */
  private startCleanupTimer(): void {
    // 每分钟清理一次过期缓存
    setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) {
        logger.debug('Periodic cache cleanup', { cleaned });
      }
    }, 60 * 1000);
  }
}

/**
 * 创建指定类型的缓存实例
 */
export function createCache<T>(options?: CacheOptions): CacheManager<T> {
  return new CacheManager<T>(options);
}

// ========== 专用缓存工厂 ==========

/**
 * 创建结果缓存（用于 Skill 执行结果）
 */
export function createResultCache(): CacheManager {
  return new CacheManager({
    defaultTTL: 10 * 60 * 1000, // 10 分钟
    maxSize: 500,
    enableLRU: true,
  });
}

/**
 * 创建知识库搜索缓存
 */
export function createSearchCache(): CacheManager {
  return new CacheManager({
    defaultTTL: 30 * 60 * 1000, // 30 分钟
    maxSize: 200,
    enableLRU: true,
  });
}

/**
 * 创建模板缓存
 */
export function createTemplateCache(): CacheManager {
  return new CacheManager({
    defaultTTL: 60 * 60 * 1000, // 1 小时
    maxSize: 100,
    enableLRU: false, // 模板不需要 LRU
  });
}

export default CacheManager;
