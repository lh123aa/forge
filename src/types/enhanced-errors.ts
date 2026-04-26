// 增强错误类型 - 扩展 SCAError 分类体系
// 支持错误原因链追踪、频率统计、自动恢复建议生成

import {
  ErrorCode,
  ErrorSeverity,
  ErrorRecoverable,
  ErrorContext,
  RecoverySuggestion,
  SCAError,
} from './errors.js';

/**
 * 错误分类（高一级分类）
 */
export enum ErrorCategory {
  /** 网络错误 */
  NETWORK = 'network',
  /** 依赖错误（缺少依赖资源） */
  DEPENDENCY = 'dependency',
  /** 资源错误（资源不足或不可用） */
  RESOURCE = 'resource',
  /** 验证错误 */
  VALIDATION = 'validation',
  /** 认证/权限错误 */
  AUTH = 'auth',
  /** 配置错误 */
  CONFIG = 'config',
  /** 外部服务错误 */
  EXTERNAL = 'external',
  /** 内部错误 */
  INTERNAL = 'internal',
  /** 超时错误 */
  TIMEOUT = 'timeout',
  /** 取消错误 */
  CANCELLATION = 'cancellation',
}

/**
 * 错误子码（更细粒度分类）
 */
export enum ErrorSubCode {
  // 网络错误 (1000-1099)
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_RESET = 'CONNECTION_RESET',
  DNS_FAILURE = 'DNS_FAILURE',
  SSL_ERROR = 'SSL_ERROR',
  PROXY_ERROR = 'PROXY_ERROR',

  // 依赖错误 (2000-2099)
  DEPENDENCY_NOT_FOUND = 'DEPENDENCY_NOT_FOUND',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
  DEPENDENCY_VERSION_MISMATCH = 'DEPENDENCY_VERSION_MISMATCH',
  CYCLIC_DEPENDENCY = 'CYCLIC_DEPENDENCY',

  // 资源错误 (3000-3099)
  MEMORY_EXHAUSTED = 'MEMORY_EXHAUSTED',
  DISK_FULL = 'DISK_FULL',
  FILE_LOCKED = 'FILE_LOCKED',
  PROCESS_LIMIT = 'PROCESS_LIMIT',
  PORT_IN_USE = 'PORT_IN_USE',

  // 验证错误 (4000-4099)
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_RANGE = 'INVALID_RANGE',
  MISSING_FIELD = 'MISSING_FIELD',
  SCHEMA_MISMATCH = 'SCHEMA_MISMATCH',

  // 认证权限错误 (5000-5099)
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // 配置错误 (6000-6099)
  INVALID_CONFIG = 'INVALID_CONFIG',
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  ENV_VAR_MISSING = 'ENV_VAR_MISSING',

  // 外部服务错误 (7000-7099)
  API_ERROR = 'API_ERROR',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_QUOTA_EXCEEDED = 'API_QUOTA_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // 内部错误 (8000-8099)
  NULL_POINTER = 'NULL_POINTER',
  ASSERTION_FAILED = 'ASSERTION_FAILED',
  UNEXPECTED_STATE = 'UNEXPECTED_STATE',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',

  // 超时错误 (9000-9099)
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  READ_TIMEOUT = 'READ_TIMEOUT',
  WRITE_TIMEOUT = 'WRITE_TIMEOUT',

  // 取消错误 (10000-10099)
  OPERATION_CANCELLED = 'OPERATION_CANCELLED',
  USER_CANCELLED = 'USER_CANCELLED',
}

/**
 * 错误原因链节点
 */
export interface CauseNode {
  /** 错误消息 */
  message: string;
  /** 错误码 */
  code?: string;
  /** 时间戳 */
  timestamp: Date;
  /** 堆栈 */
  stack?: string;
}

/**
 * 错误上下文（增强版）
 */
export interface EnhancedErrorContext extends ErrorContext {
  /** 错误分类 */
  category?: ErrorCategory;
  /** 错误子码 */
  subCode?: ErrorSubCode;
  /** HTTP 状态码（如果有） */
  httpStatusCode?: number;
  /** 请求 ID */
  requestId?: string;
  /** 资源路径 */
  resourcePath?: string;
  /** 额外的诊断信息 */
  diagnostics?: Record<string, unknown>;
}

/**
 * 错误统计信息
 */
export interface ErrorStatistics {
  /** 错误码 */
  code: string;
  /** 错误分类 */
  category: ErrorCategory;
  /** 出现次数 */
  count: number;
  /** 首次出现时间 */
  firstOccurrence: Date;
  /** 最近出现时间 */
  lastOccurrence: Date;
  /** 最近错误消息 */
  lastMessage: string;
  /** 最近消息历史（每个错误码最多 10 条） */
  recentMessages: Array<{ message: string; timestamp: Date }>;
  /** 是否正在重试 */
  isRetrying: boolean;
  /** 连续失败次数 */
  consecutiveFailures: number;
}

/**
 * 自动恢复建议生成器配置
 */
export interface AutoRecoveryConfig {
  /** 是否启用自动恢复建议 */
  enabled: boolean;
  /** 最大建议数 */
  maxSuggestions: number;
  /** 是否包含诊断命令 */
  includeDiagnosticCommands: boolean;
  /** 是否包含相关文档链接 */
  includeDocLinks: boolean;
}

/**
 * 增强的 SCAError
 */
export class EnhancedSCAError extends SCAError {
  /** 错误分类 */
  category: ErrorCategory;
  /** 错误子码 */
  subCode?: ErrorSubCode;
  /** 错误原因链 */
  causeChain: CauseNode[];
  /** 诊断信息 */
  diagnostics?: Record<string, unknown>;
  /** HTTP 状态码 */
  httpStatusCode?: number;
  /** 请求 ID */
  requestId?: string;

  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      subCode?: ErrorSubCode;
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      recoverable?: ErrorRecoverable;
      context?: EnhancedErrorContext;
      suggestions?: RecoverySuggestion[];
      cause?: Error | unknown;
      causeChain?: CauseNode[];
      diagnostics?: Record<string, unknown>;
      httpStatusCode?: number;
      requestId?: string;
    } = {}
  ) {
    super(message, {
      code: options.code,
      severity: options.severity,
      recoverable: options.recoverable,
      context: options.context as ErrorContext,
      suggestions: options.suggestions,
      cause: options.cause as Error | undefined,
    });

    this.name = 'EnhancedSCAError';
    this.category = options.category ?? this.inferCategory(options.code);
    this.subCode = options.subCode;
    this.causeChain = this.buildCauseChain(options.cause, options.causeChain);
    this.diagnostics = options.diagnostics;
    this.httpStatusCode = options.httpStatusCode;
    this.requestId = options.requestId;
  }

  /**
   * 从错误码推断分类
   */
  private inferCategory(code?: ErrorCode): ErrorCategory {
    if (!code) return ErrorCategory.INTERNAL;

    const codeStr = String(code);

    if (codeStr.includes('NETWORK') || codeStr.includes('CONNECTION')) {
      return ErrorCategory.NETWORK;
    }
    if (codeStr.includes('TIMEOUT')) {
      return ErrorCategory.TIMEOUT;
    }
    if (codeStr.includes('NOT_FOUND') || codeStr.includes('MISSING')) {
      return ErrorCategory.DEPENDENCY;
    }
    if (codeStr.includes('VALIDATION') || codeStr.includes('INVALID')) {
      return ErrorCategory.VALIDATION;
    }
    if (codeStr.includes('PERMISSION') || codeStr.includes('AUTH')) {
      return ErrorCategory.AUTH;
    }
    if (codeStr.includes('STORAGE') || codeStr.includes('DISK') || codeStr.includes('MEMORY')) {
      return ErrorCategory.RESOURCE;
    }
    if (codeStr.includes('EXTERNAL') || codeStr.includes('API')) {
      return ErrorCategory.EXTERNAL;
    }

    return ErrorCategory.INTERNAL;
  }

  /**
   * 构建错误原因链
   */
  private buildCauseChain(
    cause: Error | unknown | undefined,
    existingChain?: CauseNode[]
  ): CauseNode[] {
    const chain = existingChain ? [...existingChain] : [];

    if (cause instanceof Error) {
      const code = (cause as { code?: string }).code;
      const timestamp = (cause as { timestamp?: Date }).timestamp;

      chain.push({
        message: cause.message,
        code: code ?? cause.name,
        timestamp: timestamp ?? new Date(),
        stack: cause.stack,
      });

      // 检查 cause.cause
      if ((cause as { cause?: unknown }).cause) {
        this.buildCauseChain((cause as { cause: unknown }).cause, chain);
      }
    } else if (cause) {
      chain.push({
        message: String(cause),
        timestamp: new Date(),
      });
    }

    return chain;
  }

  /**
   * 添加到原因链
   */
  addToCauseChain(message: string, code?: string): void {
    this.causeChain.push({
      message,
      code,
      timestamp: new Date(),
    });
  }

  /**
   * 检查是否是特定类型的错误
   */
  isCategory(category: ErrorCategory): boolean {
    return this.category === category;
  }

  /**
   * 检查是否是特定子码的错误
   */
  isSubCode(subCode: ErrorSubCode): boolean {
    return this.subCode === subCode;
  }

  /**
   * 获取人类可读的分类名称
   */
  getCategoryLabel(): string {
    const labels: Record<ErrorCategory, string> = {
      [ErrorCategory.NETWORK]: '网络错误',
      [ErrorCategory.DEPENDENCY]: '依赖错误',
      [ErrorCategory.RESOURCE]: '资源错误',
      [ErrorCategory.VALIDATION]: '验证错误',
      [ErrorCategory.AUTH]: '认证权限错误',
      [ErrorCategory.CONFIG]: '配置错误',
      [ErrorCategory.EXTERNAL]: '外部服务错误',
      [ErrorCategory.INTERNAL]: '内部错误',
      [ErrorCategory.TIMEOUT]: '超时错误',
      [ErrorCategory.CANCELLATION]: '取消错误',
    };
    return labels[this.category] || '未知错误';
  }

  /**
   * 转换为可序列化对象
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      recoverable: this.recoverable,
      context: this.context,
      suggestions: this.suggestions,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause?.message,
      category: this.category,
      subCode: this.subCode,
      causeChain: this.causeChain,
      diagnostics: this.diagnostics,
      httpStatusCode: this.httpStatusCode,
      requestId: this.requestId,
    };
  }
}

// ========== 错误统计管理器 ==========

/**
 * 全局错误统计
 */
class ErrorStatisticsRegistry {
  private stats: Map<string, ErrorStatistics> = new Map();
  private maxHistory = 1000;

  /**
   * 记录错误
   */
  recordError(error: EnhancedSCAError): void {
    const key = String(error.code);
    const existing = this.stats.get(key);

    if (existing) {
      existing.count++;
      existing.lastOccurrence = new Date();
      existing.lastMessage = error.message;
      existing.consecutiveFailures++;

      // 维护最近消息历史（每个错误码最多 10 条）
      existing.recentMessages.unshift({ message: error.message, timestamp: new Date() });
      if (existing.recentMessages.length > 10) {
        existing.recentMessages.pop();
      }
    } else {
      this.stats.set(key, {
        code: key,
        category: error.category,
        count: 1,
        firstOccurrence: new Date(),
        lastOccurrence: new Date(),
        lastMessage: error.message,
        recentMessages: [{ message: error.message, timestamp: new Date() }],
        isRetrying: false,
        consecutiveFailures: 1,
      });
    }

    // 限制总历史大小
    if (this.stats.size > this.maxHistory) {
      const oldestKey = this.findOldestKey();
      if (oldestKey) this.stats.delete(oldestKey);
    }
  }

  /**
   * 标记为正在重试
   */
  markRetrying(code: string, isRetrying: boolean): void {
    const stat = this.stats.get(code);
    if (stat) {
      stat.isRetrying = isRetrying;
      if (!isRetrying) {
        stat.consecutiveFailures = 0;
      }
    }
  }

  /**
   * 获取错误统计
   */
  getStatistics(code: string): ErrorStatistics | undefined {
    return this.stats.get(code);
  }

  /**
   * 获取所有统计
   */
  getAllStatistics(): ErrorStatistics[] {
    return Array.from(this.stats.values());
  }

  /**
   * 获取某分类的所有统计
   */
  getStatisticsByCategory(category: ErrorCategory): ErrorStatistics[] {
    return Array.from(this.stats.values()).filter(s => s.category === category);
  }

  /**
   * 获取高频错误（前 N 个）
   */
  getTopErrors(limit = 10): ErrorStatistics[] {
    return Array.from(this.stats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * 获取最近错误
   */
  getRecentErrors(limit = 10): ErrorStatistics[] {
    return Array.from(this.stats.values())
      .sort((a, b) => b.lastOccurrence.getTime() - a.lastOccurrence.getTime())
      .slice(0, limit);
  }

  /**
   * 清除统计
   */
  clear(): void {
    this.stats.clear();
  }

  /**
   * 查找最旧的 key
   */
  private findOldestKey(): string | undefined {
    let oldest: string | undefined;
    let oldestTime = Infinity;

    for (const [key, stat] of this.stats) {
      if (stat.firstOccurrence.getTime() < oldestTime) {
        oldestTime = stat.firstOccurrence.getTime();
        oldest = key;
      }
    }

    return oldest;
  }
}

export const errorStatisticsRegistry = new ErrorStatisticsRegistry();

// ========== 自动恢复建议生成器 =========/

/**
 * 自动恢复建议生成器
 */
export class AutoRecoverySuggestionGenerator {
  private config: AutoRecoveryConfig;

  constructor(config: Partial<AutoRecoveryConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      maxSuggestions: config.maxSuggestions ?? 5,
      includeDiagnosticCommands: config.includeDiagnosticCommands ?? true,
      includeDocLinks: config.includeDocLinks ?? true,
    };
  }

  /**
   * 为错误生成恢复建议
   */
  generate(error: EnhancedSCAError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    if (!this.config.enabled) {
      return suggestions;
    }

    // 根据分类生成建议
    switch (error.category) {
      case ErrorCategory.NETWORK:
        suggestions.push(...this.generateNetworkSuggestions(error));
        break;
      case ErrorCategory.DEPENDENCY:
        suggestions.push(...this.generateDependencySuggestions(error));
        break;
      case ErrorCategory.RESOURCE:
        suggestions.push(...this.generateResourceSuggestions(error));
        break;
      case ErrorCategory.VALIDATION:
        suggestions.push(...this.generateValidationSuggestions(error));
        break;
      case ErrorCategory.AUTH:
        suggestions.push(...this.generateAuthSuggestions(error));
        break;
      case ErrorCategory.TIMEOUT:
        suggestions.push(...this.generateTimeoutSuggestions(error));
        break;
      case ErrorCategory.EXTERNAL:
        suggestions.push(...this.generateExternalSuggestions(error));
        break;
      default:
        suggestions.push(...this.generateGenericSuggestions(error));
    }

    // 添加诊断命令
    if (this.config.includeDiagnosticCommands) {
      suggestions.push(...this.generateDiagnosticCommands(error));
    }

    return suggestions.slice(0, this.config.maxSuggestions);
  }

  /**
   * 生成网络错误建议
   */
  private generateNetworkSuggestions(error: EnhancedSCAError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [
      {
        action: '检查网络连接',
        details: '请确认网络连接稳定，可以访问目标服务',
      },
      {
        action: '重试操作',
        details: '网络问题可能是暂时的，尝试重新执行',
      },
    ];

    if (error.subCode === ErrorSubCode.CONNECTION_REFUSED) {
      suggestions.push({
        action: '检查服务是否运行',
        details: '目标服务可能未启动或端口配置错误',
      });
    } else if (error.subCode === ErrorSubCode.DNS_FAILURE) {
      suggestions.push({
        action: '检查 DNS 配置',
        details: '域名解析失败，请检查 DNS 设置或使用 IP 地址',
      });
    } else if (error.subCode === ErrorSubCode.SSL_ERROR) {
      suggestions.push({
        action: '检查 SSL 证书',
        details: 'SSL 证书无效或过期，请更新证书',
      });
    }

    return suggestions;
  }

  /**
   * 生成依赖错误建议
   */
  private generateDependencySuggestions(error: EnhancedSCAError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [
      {
        action: '检查依赖配置',
        details: '请确认所有必需的依赖已正确安装和配置',
      },
    ];

    if (error.subCode === ErrorSubCode.DEPENDENCY_NOT_FOUND) {
      suggestions.push({
        action: '安装缺失的依赖',
        details: error.diagnostics?.packageName
          ? `请安装缺失的包: ${error.diagnostics.packageName}`
          : '请检查 package.json 或依赖配置',
      });
    } else if (error.subCode === ErrorSubCode.CYCLIC_DEPENDENCY) {
      suggestions.push({
        action: '检查依赖循环',
        details: '存在循环依赖，请重构代码以消除循环',
      });
    }

    return suggestions;
  }

  /**
   * 生成资源错误建议
   */
  private generateResourceSuggestions(error: EnhancedSCAError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    if (error.subCode === ErrorSubCode.MEMORY_EXHAUSTED) {
      suggestions.push(
        {
          action: '增加可用内存',
          details: '系统内存不足，考虑增加内存或减少并发',
        },
        {
          action: '检查内存泄漏',
          details: '可能存在内存泄漏，请检查代码',
        }
      );
    } else if (error.subCode === ErrorSubCode.DISK_FULL) {
      suggestions.push(
        {
          action: '清理磁盘空间',
          details: '磁盘空间不足，请清理不必要的文件',
        },
        {
          action: '检查日志文件',
          details: '日志文件可能占用大量空间，考虑轮转或压缩',
        }
      );
    } else if (error.subCode === ErrorSubCode.PORT_IN_USE) {
      suggestions.push({
        action: '检查端口占用',
        details: '所需端口已被其他进程占用，请释放或使用其他端口',
      });
    }

    return suggestions;
  }

  /**
   * 生成验证错误建议
   */
  private generateValidationSuggestions(error: EnhancedSCAError): RecoverySuggestion[] {
    return [
      {
        action: '检查输入参数',
        details: '请验证所有输入参数符合预期格式和范围',
      },
      {
        action: '查看错误详情',
        details: error.diagnostics?.field
          ? `字段 "${error.diagnostics.field}" 的值无效`
          : '请仔细阅读错误消息中的字段信息',
      },
    ];
  }

  /**
   * 生成认证错误建议
   */
  private generateAuthSuggestions(error: EnhancedSCAError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    if (error.subCode === ErrorSubCode.TOKEN_EXPIRED) {
      suggestions.push({
        action: '刷新认证令牌',
        details: '访问令牌已过期，请重新获取',
      });
    } else if (error.subCode === ErrorSubCode.ACCESS_DENIED) {
      suggestions.push({
        action: '检查权限配置',
        details: '当前用户没有执行此操作的权限',
      });
    } else {
      suggestions.push({
        action: '重新认证',
        details: '请重新登录或刷新认证令牌',
      });
    }

    return suggestions;
  }

  /**
   * 生成超时错误建议
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateTimeoutSuggestions(_error: EnhancedSCAError): RecoverySuggestion[] {
    return [
      {
        action: '增加超时时间',
        details: '操作耗时超过预期，可以适当增加超时配置',
      },
      {
        action: '重试操作',
        details: '超时可能是由于临时负载造成的，稍后重试可能成功',
      },
      {
        action: '检查服务状态',
        details: '目标服务可能负载过高或响应缓慢',
      },
    ];
  }

  /**
   * 生成外部服务错误建议
   */
  private generateExternalSuggestions(error: EnhancedSCAError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];

    if (error.subCode === ErrorSubCode.API_RATE_LIMIT) {
      suggestions.push({
        action: '降低请求频率',
        details: 'API 调用频率超出限制，请实现请求限流',
      });
    } else if (error.subCode === ErrorSubCode.SERVICE_UNAVAILABLE) {
      suggestions.push({
        action: '等待服务恢复',
        details: '外部服务暂时不可用，请稍后重试',
      });
    } else {
      suggestions.push({
        action: '联系服务提供商',
        details: '外部服务出现问题，请查看服务状态页或联系支持',
      });
    }

    if (this.config.includeDocLinks) {
      suggestions.push({
        action: '查看 API 文档',
        docsUrl: 'https://docs.example.com/api',
      });
    }

    return suggestions;
  }

  /**
   * 生成通用建议
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateGenericSuggestions(_error: EnhancedSCAError): RecoverySuggestion[] {
    return [
      {
        action: '查看详细日志',
        details: '启用 debug 日志级别获取更多诊断信息',
      },
      {
        action: '重试操作',
        details: '某些错误是临时性的，重试可能成功',
      },
      {
        action: '联系支持',
        details: '如果问题持续存在，请联系技术支持',
      },
    ];
  }

  /**
   * 生成诊断命令
   */
  private generateDiagnosticCommands(error: EnhancedSCAError): RecoverySuggestion[] {
    const commands: RecoverySuggestion[] = [];

    if (error.category === ErrorCategory.NETWORK) {
      commands.push({
        action: '运行网络诊断',
        details: '执行以下命令检查网络: ping, traceroute, curl -v',
      });
    } else if (error.category === ErrorCategory.RESOURCE) {
      commands.push({
        action: '检查系统资源',
        details: '执行: top (Linux) 或 TaskManager (Windows)',
      });
    }

    return commands;
  }
}

export const autoRecoveryGenerator = new AutoRecoverySuggestionGenerator();

// ========== 便捷函数 =========/

/**
 * 创建增强错误
 */
export function createEnhancedError(
  message: string,
  options: {
    code?: ErrorCode;
    subCode?: ErrorSubCode;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    recoverable?: ErrorRecoverable;
    context?: EnhancedErrorContext;
    cause?: Error | unknown;
    diagnostics?: Record<string, unknown>;
    httpStatusCode?: number;
    requestId?: string;
  } = {}
): EnhancedSCAError {
  return new EnhancedSCAError(message, options);
}

/**
 * 判断错误是否可重试
 */
export function isRetryable(error: EnhancedSCAError): boolean {
  // 明确不可恢复的不重试
  if (error.recoverable === ErrorRecoverable.NO) {
    return false;
  }

  // 某些分类的错误不应重试
  const nonRetryableCategories = [
    ErrorCategory.VALIDATION,
    ErrorCategory.AUTH,
    ErrorCategory.CONFIG,
  ];

  if (nonRetryableCategories.includes(error.category)) {
    return false;
  }

  // 某些子码不应重试
  const nonRetryableSubCodes = [
    ErrorSubCode.CYCLIC_DEPENDENCY,
    ErrorSubCode.SCHEMA_MISMATCH,
    ErrorSubCode.NOT_IMPLEMENTED,
  ];

  if (error.subCode && nonRetryableSubCodes.includes(error.subCode)) {
    return false;
  }

  return true;
}

/**
 * 判断错误是否应该熔断
 */
export function shouldCircuitBreak(error: EnhancedSCAError, stats: ErrorStatistics): boolean {
  // 连续失败超过阈值
  if (stats.consecutiveFailures >= 5) {
    return true;
  }

  // 某些错误立即熔断
  const criticalSubCodes = [
    ErrorSubCode.MEMORY_EXHAUSTED,
    ErrorSubCode.DISK_FULL,
  ];

  if (error.subCode && criticalSubCodes.includes(error.subCode)) {
    return true;
  }

  return false;
}

export default {
  ErrorCategory,
  ErrorSubCode,
  EnhancedSCAError,
  ErrorStatisticsRegistry,
  errorStatisticsRegistry,
  AutoRecoverySuggestionGenerator,
  autoRecoveryGenerator,
  createEnhancedError,
  isRetryable,
  shouldCircuitBreak,
};
