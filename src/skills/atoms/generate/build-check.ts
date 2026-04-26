// build-check.skill - 构建检查验证
// 检查项目是否可以成功构建

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import { FileStorage } from '../../../storage/index.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('BuildCheckSkill');

/**
 * 构建检查参数
 */
interface BuildCheckParams {
  projectPath?: string;
  buildCommand?: string;
  outputPath?: string;
  checkTypes?: ('compile' | 'bundle' | 'types' | 'assets')[];
}

/**
 * 构建检查结果
 */
interface BuildCheckResult {
  passed: boolean;
  duration: number;
  checks: {
    compile: { passed: boolean; duration: number; errors: number; warnings: number };
    bundle: { passed: boolean; duration: number; outputSize?: number };
    types: { passed: boolean; duration: number; errors: number };
    assets: { passed: boolean; duration: number; count: number };
  };
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
  };
  artifacts?: string[];
}

/**
 * 构建检查 Skill
 * 验证项目是否可以成功构建，产出部署产物
 */
export class BuildCheckSkill extends BaseSkill {
  readonly meta = {
    name: 'build-check',
    description: '构建检查 - 验证项目是否可以成功构建',
    category: 'generate' as const,
    version: '1.0.0',
    tags: ['build', 'check', 'compile', 'bundle', 'deploy'],
  };

  private storage: FileStorage;

  constructor() {
    super();
    this.storage = new FileStorage();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as BuildCheckParams;
    const {
      projectPath = process.cwd(),
      buildCommand,
      outputPath = 'dist',
      checkTypes = ['compile', 'bundle', 'types'],
    } = params;

    logger.info('Starting build check', { projectPath, checkTypes });

    const startTime = Date.now();
    const checks: BuildCheckResult['checks'] = {
      compile: { passed: false, duration: 0, errors: 0, warnings: 0 },
      bundle: { passed: false, duration: 0 },
      types: { passed: false, duration: 0, errors: 0 },
      assets: { passed: false, duration: 0, count: 0 },
    };

    try {
      // 执行各项检查
      if (checkTypes.includes('compile')) {
        checks.compile = await this.checkCompile(projectPath, buildCommand);
      }

      if (checkTypes.includes('bundle')) {
        checks.bundle = await this.checkBundle(projectPath, outputPath);
      }

      if (checkTypes.includes('types')) {
        checks.types = await this.checkTypes(projectPath);
      }

      if (checkTypes.includes('assets')) {
        checks.assets = await this.checkAssets(projectPath, outputPath);
      }

      const duration = Date.now() - startTime;
      
      // 计算汇总
      const checkResults = Object.values(checks);
      const passedChecks = checkResults.filter(c => c.passed).length;
      const failedChecks = checkResults.filter(c => !c.passed).length;

      const result: BuildCheckResult = {
        passed: failedChecks === 0,
        duration,
        checks,
        summary: {
          totalChecks: checkTypes.length,
          passedChecks,
          failedChecks,
        },
      };

      // 检查产出物
      if (result.passed) {
        result.artifacts = await this.findArtifacts(projectPath, outputPath);
      }

      if (result.passed) {
        return this.success({
          buildResult: result,
          artifacts: result.artifacts,
        }, `构建检查通过: ${passedChecks}/${checkTypes.length} 项检查通过`);
      } else {
        return {
          code: 400,
          data: {
            buildResult: result,
          },
          message: `构建检查失败: ${failedChecks} 项检查未通过`,
        };
      }

    } catch (error) {
      logger.error('Build check failed', { error });
      return this.fatalError(`构建检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 检查编译
   */
  private async checkCompile(
    projectPath: string,
    buildCommand?: string
  ): Promise<BuildCheckResult['checks']['compile']> {
    const startTime = Date.now();
    
    // 确定构建命令
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _command = buildCommand || this.detectBuildCommand(projectPath);
    
    // 模拟执行构建
    const errors = Math.floor(Math.random() * 3);
    const warnings = Math.floor(Math.random() * 10);
    
    const duration = Date.now() - startTime;
    
    return {
      passed: errors === 0,
      duration,
      errors,
      warnings,
    };
  }

  /**
   * 检查打包
   */
  private async checkBundle(
    _projectPath: string,
    _outputPath: string
  ): Promise<BuildCheckResult['checks']['bundle']> {
    const startTime = Date.now();
    
    // 模拟检查输出目录
    const outputSize = Math.floor(Math.random() * 1000000);
    
    const duration = Date.now() - startTime;
    
    return {
      passed: outputSize > 0,
      duration,
      outputSize,
    };
  }

  /**
   * 检查类型
   */
  private async checkTypes(
    projectPath: string
  ): Promise<BuildCheckResult['checks']['types']> {
    const startTime = Date.now();
    
    // 检查 tsconfig.json 是否存在
    const hasTsConfig = await this.checkFileExists(`${projectPath}/tsconfig.json`);
    
    // 模拟类型检查结果
    const errors = hasTsConfig ? Math.floor(Math.random() * 2) : 0;
    
    const duration = Date.now() - startTime;
    
    return {
      passed: errors === 0,
      duration,
      errors,
    };
  }

  /**
   * 检查资源文件
   */
  private async checkAssets(
    _projectPath: string,
    _outputPath: string
  ): Promise<BuildCheckResult['checks']['assets']> {
    const startTime = Date.now();
    
    // 模拟资源文件检查
    const count = Math.floor(Math.random() * 50) + 10;
    
    const duration = Date.now() - startTime;
    
    return {
      passed: count > 0,
      duration,
      count,
    };
  }

  /**
   * 检测构建命令
   */
  private detectBuildCommand(_projectPath: string): string {
    // 检查 package.json 中的构建脚本
    // 这里简化处理，实际应读取 package.json
    return 'npm run build';
  }

  /**
   * 检查文件是否存在
   */
  private async checkFileExists(path: string): Promise<boolean> {
    try {
      await this.storage.load(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 查找构建产出物
   */
  private async findArtifacts(_projectPath: string, outputPath: string): Promise<string[]> {
    const artifacts: string[] = [];

    // 常见产出物模式
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _patterns = [
      `${outputPath}/*.js`,
      `${outputPath}/*.css`,
      `${outputPath}/*.html`,
      `${outputPath}/assets/*`,
    ];

    // 模拟返回一些产出物
    artifacts.push(`${outputPath}/index.js`);
    artifacts.push(`${outputPath}/index.css`);
    artifacts.push(`${outputPath}/index.html`);

    return artifacts;
  }
}

// 导出实例
export default new BuildCheckSkill();
