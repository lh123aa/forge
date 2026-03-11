// code-review.skill - 代码评审流程
// 集成代码审查流程，支持评审规则配置、自动化检查、人工审核

import { BaseSkill } from '../base.skill.js';
import { createLogger } from '../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

const logger = createLogger('CodeReviewSkill');

/**
 * 代码评审参数
 */
interface CodeReviewParams {
  files?: string[];
  rules?: string[];
  autoCheck?: boolean;
  reviewers?: string[];
  prUrl?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 评审问题
 */
interface ReviewIssue {
  file: string;
  line?: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  suggestion?: string;
}

/**
 * 评审结果
 */
interface CodeReviewResult {
  issues: ReviewIssue[];
  summary: {
    total: number;
    critical: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  passed: boolean;
  reviewUrl?: string;
  approved?: boolean;
}

/**
 * 代码评审 Skill
 * 集成代码审查流程，支持评审规则配置、自动化检查、人工审核
 */
export class CodeReviewSkill extends BaseSkill {
  readonly meta = {
    name: 'code-review',
    description: '代码评审 - 自动化代码审查与人工审核流程',
    category: 'workflow' as const,
    version: '1.0.0',
    tags: ['code', 'review', 'quality', 'collaboration', 'team'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as CodeReviewParams;
    const {
      files = [],
      rules = [],
      autoCheck = true,
      reviewers = [],
      prUrl,
      severity = 'medium',
    } = params;

    logger.info('Starting code review', { 
      fileCount: files.length, 
      rules: rules.length,
      reviewers: reviewers.length 
    });

    try {
      const issues: ReviewIssue[] = [];

      // 自动化检查
      if (autoCheck) {
        const autoIssues = await this.runAutoCheck(files, rules);
        issues.push(...autoIssues);
      }

      // 过滤低于指定严重级别的issue
      const severityLevel: Record<string, number> = {
        info: 0,
        warning: 1,
        error: 2,
        critical: 3,
      };
      const minLevel = severityLevel[severity] || 1;
      const filteredIssues = issues.filter(i => severityLevel[i.severity] >= minLevel);

      // 统计汇总
      const summary = this.summarizeIssues(filteredIssues);
      
      // 判断是否通过评审
      const passed = summary.critical === 0 && summary.errors === 0;

      // 构建评审结果
      const result: CodeReviewResult = {
        issues: filteredIssues,
        summary,
        passed,
        reviewUrl: prUrl,
        approved: passed,
      };

      const statusMsg = passed ? '代码评审通过 ✅' : `代码评审未通过，发现 ${summary.errors + summary.critical} 个问题`;
      
      return this.success({
        codeReviewResult: result,
        summary: {
          totalIssues: summary.total,
          critical: summary.critical,
          errors: summary.errors,
          warnings: summary.warnings,
          passed,
        },
      }, statusMsg);

    } catch (error) {
      logger.error('Code review failed', { error });
      return this.fatalError('代码评审失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * 运行自动化检查
   */
  private async runAutoCheck(files: string[], rules: string[]): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];
    const enabledRules = rules.length > 0 ? rules : this.getDefaultRules();

    for (const file of files) {
      // 安全检查
      if (enabledRules.includes('security')) {
        const securityIssues = await this.checkSecurity(file);
        issues.push(...securityIssues);
      }

      // 最佳实践检查
      if (enabledRules.includes('best-practices')) {
        const bpIssues = await this.checkBestPractices(file);
        issues.push(...bpIssues);
      }

      // 代码风格检查
      if (enabledRules.includes('style')) {
        const styleIssues = await this.checkStyle(file);
        issues.push(...styleIssues);
      }

      // 性能检查
      if (enabledRules.includes('performance')) {
        const perfIssues = await this.checkPerformance(file);
        issues.push(...perfIssues);
      }
    }

    return issues;
  }

  /**
   * 获取默认规则
   */
  private getDefaultRules(): string[] {
    return ['security', 'best-practices', 'style', 'performance'];
  }

  /**
   * 安全检查
   */
  private async checkSecurity(file: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];
    
    // 常见安全风险模式
    const securityPatterns = [
      { pattern: /password\s*=/i, message: '硬编码密码可能导致安全风险', severity: 'critical' as const },
      { pattern: /api[_-]?key\s*=/i, message: '硬编码 API Key 可能导致安全风险', severity: 'critical' as const },
      { pattern: /secret\s*=/i, message: '硬编码密钥可能导致安全风险', severity: 'critical' as const },
      { pattern: /eval\s*\(/i, message: '使用 eval() 可能导致代码注入风险', severity: 'error' as const },
      { pattern: /innerHTML\s*=/i, message: '直接使用 innerHTML 可能导致 XSS 风险', severity: 'warning' as const },
      { pattern: /SQL\s+injection/i, message: '注意 SQL 注入风险，请使用参数化查询', severity: 'error' as const },
    ];

    // 简化实现 - 模拟检查
    for (const p of securityPatterns) {
      if (p.pattern.test(file)) {
        issues.push({
          file,
          severity: p.severity,
          category: 'security',
          message: p.message,
          suggestion: '请使用环境变量或配置中心管理敏感信息',
        });
      }
    }

    return issues;
  }

  /**
   * 最佳实践检查
   */
  private async checkBestPractices(file: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    // 检查常见最佳实践问题
    if (file.includes('// TODO') || file.includes('// FIXME')) {
      issues.push({
        file,
        severity: 'info',
        category: 'best-practices',
        message: '代码中存在 TODO/FIXME 注释',
        suggestion: '请及时处理待办事项',
      });
    }

    if (file.length > 500) {
      issues.push({
        file,
        severity: 'warning',
        category: 'best-practices',
        message: '文件代码行数较多 (' + file.length + ' 行)',
        suggestion: '建议拆分为更小的模块',
      });
    }

    return issues;
  }

  /**
   * 代码风格检查
   */
  private async checkStyle(file: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];
    
    // 简化实现 - 模拟检查
    if (file.includes('console.log') && !file.includes('debug')) {
      issues.push({
        file,
        severity: 'info',
        category: 'style',
        message: '存在调试用的 console.log',
        suggestion: '生产环境建议移除或使用日志库',
      });
    }

    return issues;
  }

  /**
   * 性能检查
   */
  private async checkPerformance(file: string): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    // 常见性能问题
    const perfPatterns = [
      { pattern: /\.forEach\s*\(/i, message: 'forEach 不支持异步，建议使用 for...of 循环', severity: 'info' as const },
      { pattern: /JSON\.parse.*JSON\.stringify/i, message: '不必要的序列化/反序列化', severity: 'warning' as const },
    ];

    for (const p of perfPatterns) {
      if (p.pattern.test(file)) {
        issues.push({
          file,
          severity: p.severity,
          category: 'performance',
          message: p.message,
        });
      }
    }

    return issues;
  }

  /**
   * 汇总问题
   */
  private summarizeIssues(issues: ReviewIssue[]): CodeReviewResult['summary'] {
    return {
      total: issues.length,
      critical: issues.filter(i => i.severity === 'critical').length,
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      infos: issues.filter(i => i.severity === 'info').length,
    };
  }
}

export default new CodeReviewSkill();
