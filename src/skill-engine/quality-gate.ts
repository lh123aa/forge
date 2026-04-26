// 质量门禁配置与执行器
// 定义质量检查规则，支持在关键节点自动触发质量验证

import { createLogger } from '../utils/logger.js';
import { securityAnalyzer, type SecurityScanResult } from '../utils/security-analyzer.js';
import type { SkillInput, SkillOutput } from '../types/index.js';
import { SkillRegistry } from './registry.js';
import { SkillExecutor } from './executor.js';

const logger = createLogger('QualityGate');

/**
 * 门禁检查类型
 */
export type GateType = 'lint' | 'type-check' | 'test' | 'security' | 'custom';

/**
 * 门禁配置
 */
export interface GateConfig {
  /** 门禁名称 */
  name: string;
  /** 检查类型 */
  type: GateType;
  /** Skill 名称（用于自定义检查） */
  skillName?: string;
  /** 门禁参数 */
  params?: Record<string, unknown>;
  /** 失败阈值 */
  thresholds?: {
    /** 最低分数 */
    minScore?: number;
    /** 最大错误数 */
    maxErrors?: number;
    /** 最大警告数 */
    maxWarnings?: number;
  };
  /** 是否启用自动修复 */
  autoFix?: boolean;
  /** 是否阻断流程 */
  blocking?: boolean;
}

/**
 * 门禁检查点配置
 */
export interface GateCheckpoint {
  /** 检查点名称 */
  name: string;
  /** 触发条件：skill 名称匹配模式 */
  triggerOnSkillPattern?: string[];
  /** 门禁列表 */
  gates: GateConfig[];
}

/**
 * 门禁检查结果
 */
export interface GateResult {
  gate: string;
  type: GateType;
  passed: boolean;
  score?: number;
  duration: number;
  errors: number;
  warnings: number;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * 门禁检查汇总结果
 */
export interface GateSummary {
  passed: boolean;
  totalGates: number;
  passedGates: number;
  failedGates: number;
  results: GateResult[];
  duration: number;
  blockingFailures: GateResult[];
}

/**
 * 单个失败的门禁检查
 */
export interface FailedGateCheck {
  name: string;
  type: GateType;
  actual: number;
  threshold: {
    minScore?: number;
    maxErrors?: number;
    maxWarnings?: number;
  };
  blocking: boolean;
}

/**
 * 门禁检查结果（WorkflowExecutor 使用）
 */
export interface GateCheckResult {
  passed: boolean;
  skillName: string;
  checkpoints: string[];
  failedChecks: FailedGateCheck[];
}

/**
 * 门禁检查器
 * 在关键节点自动执行质量检查
 */
export class QualityGate {
  private registry: SkillRegistry;
  private executor: SkillExecutor;
  
  /** 默认检查点配置 */
  private checkpoints: GateCheckpoint[] = [
    {
      name: 'after-code-generation',
      triggerOnSkillPattern: ['generate-code', 'generate-interface'],
      gates: [
        {
          name: 'lint-check',
          type: 'lint',
          thresholds: { maxErrors: 0, maxWarnings: 10 },
          blocking: true,
        },
        {
          name: 'type-check',
          type: 'type-check',
          thresholds: { maxErrors: 0 },
          blocking: true,
        },
      ],
    },
    {
      name: 'after-test',
      triggerOnSkillPattern: ['unit-test', 'integration-test', 'acceptance-test'],
      gates: [
        {
          name: 'test-pass',
          type: 'test',
          thresholds: { minScore: 80 },
          blocking: true,
        },
      ],
    },
  ];

  constructor(registry: SkillRegistry, executor: SkillExecutor) {
    this.registry = registry;
    this.executor = executor;
  }

  /**
   * 添加检查点
   */
  addCheckpoint(checkpoint: GateCheckpoint): void {
    this.checkpoints.push(checkpoint);
    logger.info(`Added gate checkpoint: ${checkpoint.name}`);
  }

  /**
   * 移除检查点
   */
  removeCheckpoint(name: string): void {
    this.checkpoints = this.checkpoints.filter(c => c.name !== name);
    logger.info(`Removed gate checkpoint: ${name}`);
  }

  /**
   * 获取所有检查点
   */
  getCheckpoints(): GateCheckpoint[] {
    return [...this.checkpoints];
  }

  /**
   * 执行质量门禁检查（供 WorkflowExecutor 调用）
   */
  async check(
    skillName: string,
    skillResult: SkillOutput,
    skillInput: SkillInput
  ): Promise<GateCheckResult> {
    const matchingCheckpoints = this.getMatchingCheckpoints(skillName);
    
    if (matchingCheckpoints.length === 0) {
      return {
        passed: true,
        skillName,
        checkpoints: [],
        failedChecks: [],
      };
    }

    const failedChecks: FailedGateCheck[] = [];

    for (const checkpoint of matchingCheckpoints) {
      for (const gate of checkpoint.gates) {
        const result = await this.runSingleGateCheck(gate, skillResult, skillInput);
        
        if (!result.passed) {
          failedChecks.push({
            name: gate.name,
            type: gate.type,
            actual: result.actual,
            threshold: gate.thresholds || {},
            blocking: gate.blocking || false,
          });

          if (gate.blocking) {
            logger.warn(`Blocking gate failed: ${gate.name} for skill ${skillName}`);
          }
        }
      }
    }

    return {
      passed: failedChecks.filter(c => c.blocking).length === 0,
      skillName,
      checkpoints: matchingCheckpoints.map(c => c.name),
      failedChecks,
    };
  }

  /**
   * 运行单个门禁检查
   */
  private async runSingleGateCheck(
    gate: GateConfig,
    skillResult: SkillOutput,
    skillInput: SkillInput
  ): Promise<{ passed: boolean; actual: number }> {
    const startTime = Date.now();
    
    // 根据门禁类型执行相应检查
    let result: GateResult;
    
    switch (gate.type) {
      case 'lint':
        result = await this.runLintGate(gate, skillInput, startTime);
        break;
      case 'type-check':
        result = await this.runTypeCheckGate(gate, skillInput, startTime);
        break;
      case 'test':
        result = await this.runTestGate(gate, skillInput, startTime);
        break;
      case 'security':
        result = await this.runSecurityGate(gate, skillInput, startTime);
        break;
      case 'custom':
        result = await this.runCustomGate(gate, skillInput, startTime);
        break;
      default:
        return { passed: true, actual: 0 };
    }

    // 检查是否通过阈值
    const thresholds = gate.thresholds || {};
    
    if (thresholds.maxErrors !== undefined && result.errors > thresholds.maxErrors) {
      return { passed: false, actual: result.errors };
    }
    
    if (thresholds.maxWarnings !== undefined && result.warnings > thresholds.maxWarnings) {
      return { passed: false, actual: result.warnings };
    }
    
    if (thresholds.minScore !== undefined && result.score !== undefined && result.score < thresholds.minScore) {
      return { passed: false, actual: result.score };
    }

    return { passed: result.passed, actual: result.score || 0 };
  }

  /**
   * 根据 skill 名称获取匹配的检查点
   */
  private getMatchingCheckpoints(skillName: string): GateCheckpoint[] {
    return this.checkpoints.filter(checkpoint => {
      if (!checkpoint.triggerOnSkillPattern) {
        return false;
      }
      return checkpoint.triggerOnSkillPattern.some(pattern => {
        // 支持通配符匹配
        if (pattern === '*') {
          return true;
        }
        if (pattern.endsWith('*')) {
          const prefix = pattern.slice(0, -1);
          return skillName.startsWith(prefix);
        }
        return skillName === pattern;
      });
    });
  }

  /**
   * 执行门禁检查
   */
  async execute(input: SkillInput, skillName: string): Promise<GateSummary> {
    const matchingCheckpoints = this.getMatchingCheckpoints(skillName);
    
    if (matchingCheckpoints.length === 0) {
      logger.debug(`No gate checkpoints for skill: ${skillName}`);
      return {
        passed: true,
        totalGates: 0,
        passedGates: 0,
        failedGates: 0,
        results: [],
        duration: 0,
        blockingFailures: [],
      };
    }

    const allResults: GateResult[] = [];
    const blockingFailures: GateResult[] = [];
    const startTime = Date.now();

    logger.info(`Executing gate checks for skill: ${skillName}`, {
      checkpoints: matchingCheckpoints.map(c => c.name),
    });

    // 执行每个匹配的检查点
    for (const checkpoint of matchingCheckpoints) {
      for (const gate of checkpoint.gates) {
        const result = await this.executeGate(gate, input);
        allResults.push(result);
        
        if (!result.passed && gate.blocking) {
          blockingFailures.push(result);
        }
      }
    }

    const duration = Date.now() - startTime;
    const passedGates = allResults.filter(r => r.passed).length;
    const failedGates = allResults.filter(r => !r.passed).length;

    const summary: GateSummary = {
      passed: blockingFailures.length === 0,
      totalGates: allResults.length,
      passedGates,
      failedGates,
      results: allResults,
      duration,
      blockingFailures,
    };

    logger.info(`Gate check completed for ${skillName}`, {
      total: summary.totalGates,
      passedGates: summary.passedGates,
      failedGates: summary.failedGates,
      blocking: summary.blockingFailures.length,
      duration,
    });

    return summary;
  }

  /**
   * 执行单个门禁检查
   */
  private async executeGate(gate: GateConfig, input: SkillInput): Promise<GateResult> {
    const startTime = Date.now();
    
    try {
      switch (gate.type) {
        case 'lint':
          return await this.runLintGate(gate, input, startTime);
        case 'type-check':
          return await this.runTypeCheckGate(gate, input, startTime);
        case 'test':
          return await this.runTestGate(gate, input, startTime);
        case 'security':
          return await this.runSecurityGate(gate, input, startTime);
        case 'custom':
          return await this.runCustomGate(gate, input, startTime);
        default:
          return {
            gate: gate.name,
            type: gate.type,
            passed: true,
            duration: 0,
            errors: 0,
            warnings: 0,
            message: `Unknown gate type: ${gate.type}`,
          };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        gate: gate.name,
        type: gate.type,
        passed: false,
        duration,
        errors: 1,
        warnings: 0,
        message: `Gate execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 运行 Lint 门禁
   */
  private async runLintGate(gate: GateConfig, input: SkillInput, startTime: number): Promise<GateResult> {
    // 获取需要检查的文件
    const files = (input.context.writable as Record<string, unknown>).generatedFiles as string[] 
      || ['src/**/*.ts'];
    
    const params = {
      ...gate.params,
      files,
      fix: gate.autoFix || false,
    };

    // 调用 lint skill
    const result = await this.executeSkill('lint', input, params);
    const duration = Date.now() - startTime;

    // 解析结果
    const testResult = result.data?.testResult as Record<string, unknown> | undefined;
    const passed = result.code === 200;
    const errors = (testResult?.summary as Record<string, number>)?.errorCount || 0;
    const warnings = (testResult?.summary as Record<string, number>)?.warningCount || 0;
    const score = testResult?.score as number || 0;

    // 检查阈值
    const thresholds = gate.thresholds || {};
    let thresholdPassed = true;
    let thresholdMessage = '';

    if (thresholds.maxErrors !== undefined && errors > thresholds.maxErrors) {
      thresholdPassed = false;
      thresholdMessage = `Errors (${errors}) exceed max (${thresholds.maxErrors})`;
    }
    if (thresholds.maxWarnings !== undefined && warnings > thresholds.maxWarnings) {
      thresholdPassed = false;
      thresholdMessage = `Warnings (${warnings}) exceed max (${thresholds.maxWarnings})`;
    }
    if (thresholds.minScore !== undefined && score < thresholds.minScore) {
      thresholdPassed = false;
      thresholdMessage = `Score (${score}) below min (${thresholds.minScore})`;
    }

    const finalPassed = passed && thresholdPassed;

    return {
      gate: gate.name,
      type: 'lint',
      passed: finalPassed,
      score,
      duration,
      errors,
      warnings,
      message: finalPassed 
        ? `Lint check passed: ${score}分, ${errors}错误, ${warnings}警告`
        : `Lint check failed: ${thresholdMessage || '检查未通过'}`,
      details: testResult,
    };
  }

  /**
   * 运行 Type-Check 门禁
   */
  private async runTypeCheckGate(gate: GateConfig, input: SkillInput, startTime: number): Promise<GateResult> {
    const files = (input.context.writable as Record<string, unknown>).generatedFiles as string[] 
      || ['src/**/*.ts'];
    
    const params = {
      ...gate.params,
      files,
    };

    const result = await this.executeSkill('type-check', input, params);
    const duration = Date.now() - startTime;

    const testResult = result.data?.testResult as Record<string, unknown> | undefined;
    const passed = result.code === 200;
    const errors = (testResult?.summary as Record<string, number>)?.errorCount || 0;
    const warnings = (testResult?.summary as Record<string, number>)?.warningCount || 0;

    const thresholds = gate.thresholds || {};
    let thresholdPassed = true;
    let thresholdMessage = '';

    if (thresholds.maxErrors !== undefined && errors > thresholds.maxErrors) {
      thresholdPassed = false;
      thresholdMessage = `Type errors (${errors}) exceed max (${thresholds.maxErrors})`;
    }

    const finalPassed = passed && thresholdPassed;

    return {
      gate: gate.name,
      type: 'type-check',
      passed: finalPassed,
      duration,
      errors,
      warnings,
      message: finalPassed 
        ? `Type check passed: ${errors} errors, ${warnings} warnings`
        : `Type check failed: ${thresholdMessage || '检查未通过'}`,
      details: testResult,
    };
  }

  /**
   * 运行 Test 门禁
   */
  private async runTestGate(gate: GateConfig, input: SkillInput, startTime: number): Promise<GateResult> {
    const params = gate.params || {};
    
    // 尝试调用单元测试或集成测试 skill
    let skillName = 'unit-test';
    if ((params.testType as string) === 'integration') {
      skillName = 'integration-test';
    }

    const result = await this.executeSkill(skillName, input, params);
    const duration = Date.now() - startTime;

    const testResult = result.data?.testResult as Record<string, unknown> | undefined;
    const passed = result.code === 200;
    const passedTests = (testResult?.summary as Record<string, number>)?.passed || 0;
    const failedTests = (testResult?.summary as Record<string, number>)?.failed || 0;
    const score = testResult?.score as number || (passed ? 100 : 0);

    const thresholds = gate.thresholds || {};
    let thresholdPassed = true;
    let thresholdMessage = '';

    if (thresholds.minScore !== undefined && score < thresholds.minScore) {
      thresholdPassed = false;
      thresholdMessage = `Test score (${score}) below min (${thresholds.minScore})`;
    }

    const finalPassed = passed && thresholdPassed;

    return {
      gate: gate.name,
      type: 'test',
      passed: finalPassed,
      score,
      duration,
      errors: failedTests,
      warnings: 0,
      message: finalPassed 
        ? `Test passed: ${passedTests} passed, score ${score}`
        : `Test failed: ${thresholdMessage || `${failedTests} tests failed`}`,
      details: testResult,
    };
  }

  /**
   * 运行 Security 门禁
   * 使用 Semgrep 或正则模式检测安全漏洞
   */
  private async runSecurityGate(gate: GateConfig, input: SkillInput, startTime: number): Promise<GateResult> {
    // 从输入中提取代码内容进行检查
    const codeToCheck = this.extractCodeFromInput(input);

    // 使用安全分析器扫描
    const scanResult: SecurityScanResult = await securityAnalyzer.scan(codeToCheck, {
      useSemgrep: gate.params?.useSemgrep !== false,
      minSeverity: (gate.params?.minSeverity as 'error' | 'warning' | 'info') || 'info',
    });

    // 检查阈值
    const thresholds = gate.thresholds || {};
    const maxErrors = thresholds.maxErrors ?? 0;
    const maxWarnings = thresholds.maxWarnings ?? 10;

    const passed = scanResult.errorCount <= maxErrors && scanResult.warningCount <= maxWarnings;
    const duration = Date.now() - startTime;

    if (!passed) {
      logger.warn(`Security gate failed: ${scanResult.errorCount} errors, ${scanResult.warningCount} warnings`);
    }

    return {
      gate: gate.name,
      type: 'security',
      passed,
      duration,
      errors: scanResult.errorCount,
      warnings: scanResult.warningCount,
      message: scanResult.passed
        ? `Security check passed (${scanResult.scanMethod}): ${scanResult.errorCount} errors, ${scanResult.warningCount} warnings`
        : `Security check failed: ${scanResult.errorCount} errors, ${scanResult.warningCount} warnings`,
      details: {
        vulnerabilities: scanResult.vulnerabilities,
        scanMethod: scanResult.scanMethod,
      },
    };
  }

  /**
   * 从输入中提取代码内容
   */
  private extractCodeFromInput(input: SkillInput): string {
    const parts: string[] = [];

    // 检查 task.target 字段（任务核心目标）
    if (input.task?.target) {
      parts.push(input.task.target);
    }

    // 检查 task.params 参数
    if (input.task?.params) {
      for (const value of Object.values(input.task.params)) {
        if (typeof value === 'string') {
          parts.push(value);
        } else if (typeof value === 'object' && value !== null) {
          try {
            parts.push(JSON.stringify(value));
          } catch {
            // 忽略序列化失败
          }
        }
      }
    }

    // 检查 config 中的额外字段
    if (input.config) {
      for (const value of Object.values(input.config)) {
        if (typeof value === 'string') {
          parts.push(value);
        } else if (typeof value === 'object' && value !== null) {
          try {
            parts.push(JSON.stringify(value));
          } catch {
            // 忽略序列化失败
          }
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 运行自定义门禁
   */
  private async runCustomGate(gate: GateConfig, input: SkillInput, startTime: number): Promise<GateResult> {
    if (!gate.skillName) {
      return {
        gate: gate.name,
        type: 'custom',
        passed: false,
        duration: 0,
        errors: 1,
        warnings: 0,
        message: 'Custom gate requires skillName',
      };
    }

    const result = await this.executeSkill(gate.skillName, input, gate.params || {});
    const duration = Date.now() - startTime;
    const passed = result.code === 200;

    return {
      gate: gate.name,
      type: 'custom',
      passed,
      duration,
      errors: passed ? 0 : 1,
      warnings: 0,
      message: passed ? `Custom gate "${gate.name}" passed` : `Custom gate "${gate.name}" failed: ${result.message}`,
      details: result.data,
    };
  }

  /**
   * 执行 Skill
   */
  private async executeSkill(skillName: string, input: SkillInput, params: Record<string, unknown>): Promise<SkillOutput> {
    // 检查 skill 是否存在
    const skill = this.registry.get(skillName);
    if (!skill) {
      logger.warn(`Skill not found for gate: ${skillName}`);
      return {
        code: 500,
        data: {},
        message: `Skill not found: ${skillName}`,
      };
    }

    // 创建新的输入
    const skillInput: SkillInput = {
      ...input,
      task: {
        ...input.task,
        taskName: skillName,
        target: skillName,
        params: {
          ...input.task.params,
          ...params,
        },
      },
    };

    // 执行 skill
    return await this.executor.execute(skillName, skillInput, {
      timeout: 60000,
      maxRetries: 0,
    });
  }

  /**
   * 创建默认门禁检查器
   */
  static createDefault(registry: SkillRegistry, executor: SkillExecutor): QualityGate {
    return new QualityGate(registry, executor);
  }
}

export default QualityGate;
