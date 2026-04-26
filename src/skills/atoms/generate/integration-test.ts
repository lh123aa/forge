// integration-test.skill - 集成测试

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _logger = createLogger('IntegrationTestSkill');

interface IntegrationTestParams {
  projectPath?: string;
  testType?: 'build' | 'start' | 'dependency' | 'api' | 'full';
  timeout?: number;
  skipInstall?: boolean;
}

interface IntegrationResult {
  passed: boolean;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    message?: string;
    duration: number;
  }>;
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  duration: number;
}

/**
 * 集成测试 Skill
 * 执行项目集成测试：依赖检查、构建检查、启动检查等
 */
export class IntegrationTestSkill extends BaseSkill {
  readonly meta = {
    name: 'integration-test',
    description: '执行集成测试，检查项目依赖、构建、启动',
    category: 'generate' as const,
    version: '1.0.0',
    tags: ['test', 'integration', 'build', 'dependency'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as IntegrationTestParams;
    const { projectPath = '.', testType = 'full', timeout = 60000, skipInstall = false } = params;

    try {
      const result = await this.runIntegrationTests({
        projectPath,
        testType,
        timeout,
        skipInstall,
      });

      if (result.summary.failed > 0) {
        return {
          code: 400,
          data: {
            projectPath,
            testType,
            result,
          },
          message: `[${this.meta.name}] 集成测试失败: ${result.summary.failed} 项检查未通过`,
        };
      }

      return this.success(
        {
          projectPath,
          testType,
          result,
        },
        `集成测试完成: ${result.summary.passed} 项检查通过`
      );
    } catch (error) {
      return this.fatalError(
        `集成测试执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 运行集成测试
   */
  private async runIntegrationTests(config: {
    projectPath: string;
    testType: string;
    timeout: number;
    skipInstall: boolean;
  }): Promise<IntegrationResult> {
    const startTime = Date.now();
    const checks: IntegrationResult['checks'] = [];

    // 根据测试类型执行不同检查
    if (config.testType === 'full' || config.testType === 'dependency') {
      checks.push(await this.checkDependencies(config.projectPath, config.skipInstall));
    }

    if (config.testType === 'full' || config.testType === 'build') {
      checks.push(await this.checkBuild(config.projectPath));
    }

    if (config.testType === 'full' || config.testType === 'start') {
      checks.push(await this.checkStart(config.projectPath, config.timeout));
    }

    if (config.testType === 'full' || config.testType === 'api') {
      checks.push(await this.checkAPI(config.projectPath));
    }

    const summary = {
      passed: checks.filter((c) => c.status === 'pass').length,
      failed: checks.filter((c) => c.status === 'fail').length,
      warnings: checks.filter((c) => c.status === 'warn').length,
      skipped: checks.filter((c) => c.status === 'skip').length,
    };

    return {
      passed: summary.failed === 0,
      checks,
      summary,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 检查依赖
   */
  private async checkDependencies(
    projectPath: string,
    skipInstall: boolean
  ): Promise<IntegrationResult['checks'][0]> {
    const startTime = Date.now();

    try {
      // 检查 package.json 是否存在
      const hasPackageJson = await this.fileExists(projectPath, 'package.json');

      if (!hasPackageJson) {
        return {
          name: 'dependencies',
          status: 'fail',
          message: 'package.json not found',
          duration: Date.now() - startTime,
        };
      }

      // 检查 node_modules
      const hasNodeModules = await this.dirExists(projectPath, 'node_modules');

      if (!hasNodeModules && !skipInstall) {
        return {
          name: 'dependencies',
          status: 'warn',
          message: 'node_modules not found, run npm install',
          duration: Date.now() - startTime,
        };
      }

      return {
        name: 'dependencies',
        status: 'pass',
        message: 'Dependencies OK',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'dependencies',
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查构建
   */
  private async checkBuild(projectPath: string): Promise<IntegrationResult['checks'][0]> {
    const startTime = Date.now();

    try {
      // 检查 TypeScript 配置
      const hasTsConfig = await this.fileExists(projectPath, 'tsconfig.json');

      if (!hasTsConfig) {
        return {
          name: 'build',
          status: 'warn',
          message: 'tsconfig.json not found',
          duration: Date.now() - startTime,
        };
      }

      // 检查构建脚本
      const hasBuildScript = await this.hasBuildScript(projectPath);

      if (!hasBuildScript) {
        return {
          name: 'build',
          status: 'warn',
          message: 'No build script found in package.json',
          duration: Date.now() - startTime,
        };
      }

      return {
        name: 'build',
        status: 'pass',
        message: 'Build configuration OK',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'build',
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查启动
   */
  private async checkStart(
    projectPath: string,
    _timeout: number
  ): Promise<IntegrationResult['checks'][0]> {
    const startTime = Date.now();

    try {
      // 检查启动脚本
      const hasStartScript = await this.hasStartScript(projectPath);

      if (!hasStartScript) {
        return {
          name: 'start',
          status: 'skip',
          message: 'No start script found',
          duration: Date.now() - startTime,
        };
      }

      // 注意：实际不应该真正启动服务，这里只是配置检查
      return {
        name: 'start',
        status: 'pass',
        message: 'Start configuration OK',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'start',
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查 API
   */
  private async checkAPI(projectPath: string): Promise<IntegrationResult['checks'][0]> {
    const startTime = Date.now();

    try {
      // 检查 API 路由文件
      const hasAPIRoutes = await this.hasAPIRoutes(projectPath);

      if (!hasAPIRoutes) {
        return {
          name: 'api',
          status: 'skip',
          message: 'No API routes found',
          duration: Date.now() - startTime,
        };
      }

      return {
        name: 'api',
        status: 'pass',
        message: 'API routes OK',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'api',
        status: 'fail',
        message: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(basePath: string, fileName: string): Promise<boolean> {
    const { access } = await import('fs/promises');
    const { join } = await import('path');

    try {
      await access(join(basePath, fileName));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查目录是否存在
   */
  private async dirExists(basePath: string, dirName: string): Promise<boolean> {
    const { access } = await import('fs/promises');
    const { join } = await import('path');

    try {
      await access(join(basePath, dirName));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查构建脚本
   */
  private async hasBuildScript(projectPath: string): Promise<boolean> {
    try {
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const pkgJsonPath = join(projectPath, 'package.json');
      const content = await readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      return !!pkg.scripts?.build;
    } catch {
      return false;
    }
  }

  /**
   * 检查启动脚本
   */
  private async hasStartScript(projectPath: string): Promise<boolean> {
    try {
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const pkgJsonPath = join(projectPath, 'package.json');
      const content = await readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      return !!(pkg.scripts?.start || pkg.scripts?.dev);
    } catch {
      return false;
    }
  }

  /**
   * 检查 API 路由
   */
  private async hasAPIRoutes(projectPath: string): Promise<boolean> {
    const { access } = await import('fs/promises');
    const { join } = await import('path');

    // 常见的 API 路由目录
    const apiDirs = ['routes', 'api', 'endpoints', 'handlers', 'controllers'];

    for (const dir of apiDirs) {
      try {
        const dirPath = join(projectPath, 'src', dir);
        await access(dirPath);
        return true;
      } catch {
        // 继续检查下一个目录
      }
    }

    return false;
  }
}

// 导出实例
export default new IntegrationTestSkill();
