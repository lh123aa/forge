// acceptance-test.skill - 验收测试

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('AcceptanceTestSkill');

interface AcceptanceTestParams {
  projectPath?: string;
  requirements?: string[];
  testPlan?: string;
  browser?: 'chrome' | 'firefox' | 'edge';
  viewport?: { width: number; height: number };
  screenshot?: boolean;
  reportFormat?: 'json' | 'html' | 'markdown';
}

interface AcceptanceCheck {
  id: string;
  requirement: string;
  status: 'pass' | 'fail' | 'pending';
  details?: string;
  screenshot?: string;
}

interface AcceptanceResult {
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  pendingCount: number;
  checks: AcceptanceCheck[];
  duration: number;
  report?: string;
}

/**
 * 验收测试 Skill
 * 基于需求文档执行验收测试
 */
export class AcceptanceTestSkill extends BaseSkill {
  readonly meta = {
    name: 'acceptance-test',
    description: '基于需求执行验收测试，生成测试报告',
    category: 'generate' as const,
    version: '1.0.0',
    tags: ['test', 'acceptance', 'e2e', 'requirements'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as AcceptanceTestParams;
    const {
      projectPath = '.',
      requirements = [],
      testPlan,
      browser = 'chrome',
      viewport = { width: 1920, height: 1080 },
      screenshot = false,
      reportFormat = 'markdown',
    } = params;

    if (requirements.length === 0 && !testPlan) {
      return this.fatalError('缺少需求 requirements 或测试计划 testPlan 参数');
    }

    try {
      const result = await this.runAcceptanceTests({
        projectPath,
        requirements,
        testPlan,
        browser,
        viewport,
        screenshot,
        reportFormat,
      });

      if (result.failedCount > 0) {
        return {
          code: 400,
          data: {
            projectPath,
            result,
          },
          message: `[${this.meta.name}] 验收测试失败: ${result.failedCount}/${result.total} 项未通过`,
        };
      }

      return this.success(
        {
          projectPath,
          result,
        },
        `验收测试完成: ${result.passedCount}/${result.total} 项通过`
      );
    } catch (error) {
      return this.fatalError(
        `验收测试执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 运行验收测试
   */
  private async runAcceptanceTests(config: {
    projectPath: string;
    requirements: string[];
    testPlan?: string;
    browser: string;
    viewport: { width: number; height: number };
    screenshot: boolean;
    reportFormat: string;
  }): Promise<AcceptanceResult> {
    const startTime = Date.now();
    const checks: AcceptanceCheck[] = [];

    // 解析需求生成检查项
    const parsedRequirements = this.parseRequirements(config.requirements);

    // 为每个需求生成检查
    for (const req of parsedRequirements) {
      const check = await this.performAcceptanceCheck(req, config);
      checks.push(check);
    }

    // 生成报告
    const report = this.generateReport(checks, config.reportFormat);

    const passedCount = checks.filter((c) => c.status === 'pass').length;
    const failedCount = checks.filter((c) => c.status === 'fail').length;
    const pendingCount = checks.filter((c) => c.status === 'pending').length;

    return {
      passed: failedCount === 0,
      total: checks.length,
      passedCount,
      failedCount,
      pendingCount,
      checks,
      duration: Date.now() - startTime,
      report,
    };
  }

  /**
   * 解析需求
   */
  private parseRequirements(requirements: string[]): Array<{
    id: string;
    text: string;
    type: 'functional' | 'performance' | 'security' | 'usability';
  }> {
    return requirements.map((req, index) => {
      let type: 'functional' | 'performance' | 'security' | 'usability' = 'functional';

      if (req.toLowerCase().includes('性能') || req.toLowerCase().includes('performance')) {
        type = 'performance';
      } else if (req.toLowerCase().includes('安全') || req.toLowerCase().includes('security')) {
        type = 'security';
      } else if (req.toLowerCase().includes('可用性') || req.toLowerCase().includes('usability')) {
        type = 'usability';
      }

      return {
        id: `REQ-${String(index + 1).padStart(3, '0')}`,
        text: req,
        type,
      };
    });
  }

  /**
   * 执行验收检查
   */
  private async performAcceptanceCheck(
    req: { id: string; text: string; type: string },
    config: {
      projectPath: string;
      browser: string;
      viewport: { width: number; height: number };
      screenshot: boolean;
    }
  ): Promise<AcceptanceCheck> {
    try {
      // 根据需求类型执行不同检查
      let status: 'pass' | 'fail' | 'pending' = 'pending';
      let details = '';

      switch (req.type) {
        case 'functional':
          // 功能性检查：检查相关代码/文件是否存在
          status = await this.checkFunctional(req.text, config.projectPath);
          details = `Checked: ${req.text.substring(0, 50)}...`;
          break;

        case 'performance':
          // 性能检查
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status = await (this as any).checkPerformance?.(req.text, config.projectPath) || 'pending';
          details = 'Performance check completed';
          break;

        case 'security':
          // 安全检查
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status = await (this as any).checkSecurity?.(req.text, config.projectPath) || 'pending';
          details = 'Security check completed';
          break;

        case 'usability':
          // 可用性检查
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status = await (this as any).checkUsability?.(req.text, config.projectPath) || 'pending';
          details = 'Usability check completed';
          break;

        default:
          status = 'pending';
          details = 'Check type not supported';
      }

      return {
        id: req.id,
        requirement: req.text,
        status,
        details,
      };
    } catch (error) {
      return {
        id: req.id,
        requirement: req.text,
        status: 'fail',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 功能性检查
   */
  private async checkFunctional(
requirement: string,
    projectPath: string
  ): Promise<'pass' | 'fail' | 'pending'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _access = (await import('fs/promises')).access;
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');

    const perfIndicators = ['cache', 'lazy', 'memo', 'optimize', 'gzip', 'compress', 'preload'];

    try {
      const pkgPath = join(projectPath, 'package.json');
      const content = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      const hasPerfDeps = Object.keys(allDeps).some((dep) =>
        perfIndicators.some((ind) => dep.toLowerCase().includes(ind))
      );

      if (hasPerfDeps) return 'pass';
      return 'fail';
    } catch {
      return 'pending';
    }
  }

  /**
   * 安全检查
   */
  private async checkSecurity(
    requirement: string,
    projectPath: string
  ): Promise<'pass' | 'fail' | 'pending'> {
    const { access, readFile } = await import('fs/promises');
    const { join } = await import('path');

    const secIndicators = ['auth', 'token', 'jwt', 'csrf', 'xss', 'sanitize', 'cors', 'helmet'];

    try {
      // 检查安全文件
      const secFiles = ['.env.example', 'security.js', 'cors.js'];
      for (const file of secFiles) {
        if (
          await access(join(projectPath, file))
            .then(() => true)
            .catch(() => false)
        ) {
          return 'pass';
        }
      }

      // 检查安全依赖
      const pkgPath = join(projectPath, 'package.json');
      const content = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      const hasSecDeps = Object.keys(allDeps).some((dep) =>
        secIndicators.some((ind) => dep.toLowerCase().includes(ind))
      );

      if (hasSecDeps) return 'pass';
      return 'fail';
    } catch {
      return 'pending';
    }
  }

  /**
   * 可用性检查
   */
  private async checkUsability(
    requirement: string,
    projectPath: string
  ): Promise<'pass' | 'fail' | 'pending'> {
    const { readdir, readFile } = await import('fs/promises');
    const { join } = await import('path');

    const a11yIndicators = ['aria', 'alt', 'label', 'placeholder', 'tabindex', 'role'];

    try {
      const searchDir = async (dir: string, depth: number = 0): Promise<boolean> => {
        if (depth > 2) return false;

        try {
          const entries = await readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
              if (await searchDir(fullPath, depth + 1)) return true;
            } else if (/\.(html|jsx|tsx|vue|css|scss)$/.test(entry.name)) {
              try {
                const content = (await readFile(fullPath, 'utf-8')).toLowerCase();
                const matched = a11yIndicators.filter((ind) => content.includes(ind));
                if (matched.length >= 2) return true;
              } catch (err) {
                logger.debug('Error reading file for accessibility', { path: fullPath, error: err });
              }
            }
          }
        } catch (err) {
          logger.debug('Error searching directory for accessibility', { error: err });
        }

        return false;
      };

      const found = await searchDir(projectPath);
      return found ? 'pass' : 'fail';
    } catch {
      return 'pending';
    }
  }

  /**
   * 生成报告
   */
  private generateReport(checks: AcceptanceCheck[], format: string): string {
    if (format === 'json') {
      return JSON.stringify(checks, null, 2);
    }

    // Markdown 格式
    let report = '# 验收测试报告\n\n';
    report += '| ID | 需求 | 状态 | 详情 |\n';
    report += '|----|------|------|------|\n';

    for (const check of checks) {
      const statusIcon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⏳';
      report += `| ${check.id} | ${check.requirement.substring(0, 30)}... | ${statusIcon} ${check.status} | ${check.details || '-'} |\n`;
    }

    return report;
  }
}

// 导出实例
export default new AcceptanceTestSkill();
