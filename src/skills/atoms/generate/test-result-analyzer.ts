// test-result-analyzer.skill - 测试结果分析器

import { BaseSkill } from '../../base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

interface TestResultAnalyzerParams {
  testResult?: {
    passed?: number;
    failed?: number;
    skipped?: number;
    total?: number;
    cases?: Array<{
      name: string;
      status: 'pass' | 'fail' | 'skip';
      duration?: number;
      error?: string;
    }>;
    duration?: number;
  };
  testOutput?: string;
  testFramework?: string;
}

interface AnalyzedError {
  type: 'syntax' | 'type' | 'import' | 'reference' | 'logic' | 'runtime' | 'unknown';
  message: string;
  line?: number;
  column?: number;
  file?: string;
  suggestion?: string;
  severity: 'error' | 'warning';
}

interface AnalysisResult {
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  errors: AnalyzedError[];
  fixableErrors: AnalyzedError[];
  unfixableErrors: AnalyzedError[];
  errorPatterns: Record<string, number>;
  suggestedStrategy: 'retry' | 'manual' | 'regenerate' | 'ignore';
}

/**
 * 测试结果分析 Skill
 * 分析测试失败原因，提供针对性的修复建议
 */
export class TestResultAnalyzerSkill extends BaseSkill {
  readonly meta = {
    name: 'test-result-analyzer',
    description: '分析测试失败原因，提供针对性修复建议',
    category: 'generate' as const,
    version: '1.0.0',
    tags: ['test', 'analyze', 'debug', 'error-analysis'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as TestResultAnalyzerParams;
    const { testResult, testOutput, testFramework = 'jest' } = params;

    if (!testResult && !testOutput) {
      return this.fatalError('缺少测试结果 testResult 或测试输出 testOutput 参数');
    }

    try {
      // 解析测试结果
      let analysisResult: AnalysisResult;

      if (testResult) {
        analysisResult = this.analyzeTestResult(testResult, testFramework);
      } else if (testOutput) {
        const parsed = this.parseTestOutput(testOutput, testFramework);
        analysisResult = this.analyzeTestResult(parsed, testFramework);
      } else {
        return this.fatalError('无法解析测试结果');
      }

      // 生成摘要消息
      const summaryMsg = `测试分析: ${analysisResult.summary.passed}/${analysisResult.summary.total} 通过`;
      const errorMsg = analysisResult.errors.length > 0 
        ? `，发现 ${analysisResult.errors.length} 个错误，可修复 ${analysisResult.fixableErrors.length} 个`
        : '';

      if (analysisResult.fixableErrors.length > 0) {
        return this.success({
          analysis: analysisResult,
          fixableErrors: analysisResult.fixableErrors,
          suggestedStrategy: analysisResult.suggestedStrategy,
        }, summaryMsg + errorMsg);
      } else if (analysisResult.unfixableErrors.length > 0) {
        return {
          code: 300,
          data: {
            analysis: analysisResult,
            unfixableErrors: analysisResult.unfixableErrors,
            suggestedStrategy: analysisResult.suggestedStrategy,
          },
          message: summaryMsg + '，需要人工处理 ' + analysisResult.unfixableErrors.length + ' 个错误',
        };
      }

      return this.success({
        analysis: analysisResult,
        suggestedStrategy: analysisResult.suggestedStrategy,
      }, summaryMsg);

    } catch (error) {
      return this.fatalError(`测试结果分析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 分析测试结果
   */
  private analyzeTestResult(testResult: TestResultAnalyzerParams['testResult'], framework: string): AnalysisResult {
    const cases = testResult?.cases || [];
    const failedCases = cases.filter(c => c.status === 'fail');
    const errors: AnalyzedError[] = [];
    const errorPatterns: Record<string, number> = {};

    // 分析每个失败的测试
    for (const failedCase of failedCases) {
      const error = failedCase.error;
      if (!error) continue;

      // 解析错误
      const analyzedError = this.parseError(error, framework);
      errors.push(analyzedError);

      // 统计错误模式
      const patternKey = analyzedError.type;
      errorPatterns[patternKey] = (errorPatterns[patternKey] || 0) + 1;
    }

    // 分类错误
    const fixableErrors = errors.filter(e => this.isFixable(e));
    const unfixableErrors = errors.filter(e => !this.isFixable(e));

    // 确定修复策略
    const suggestedStrategy = this.determineStrategy(errors, fixableErrors, unfixableErrors);

    return {
      summary: {
        total: testResult?.total || cases.length,
        passed: testResult?.passed || cases.filter(c => c.status === 'pass').length,
        failed: testResult?.failed || failedCases.length,
        skipped: testResult?.skipped || cases.filter(c => c.status === 'skip').length,
      },
      errors,
      fixableErrors,
      unfixableErrors,
      errorPatterns,
      suggestedStrategy,
    };
  }

  /**
   * 解析测试输出
   */
  private parseTestOutput(output: string, framework: string): TestResultAnalyzerParams['testResult'] {
    const result: TestResultAnalyzerParams['testResult'] = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      cases: [],
      duration: 0,
    };

    if (framework === 'jest' || framework === 'vitest') {
      // 解析 Jest/Vitest 输出
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _passMatch = output.match(/PASS\s+(.+)/);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _failMatch = output.match(/FAIL\s+(.+)/);
      
      // 提取测试统计
      const statsMatch = output.match(/Tests:\s+(.+)/);
      if (statsMatch) {
        const stats = statsMatch[1];
        result.passed = this.extractNumber(stats, /(\d+)\s+passed/);
        result.failed = this.extractNumber(stats, /(\d+)\s+failed/);
        result.skipped = this.extractNumber(stats, /(\d+)\s+skipped/);
        result.total = (result.passed || 0) + (result.failed || 0) + (result.skipped || 0);
      }

      // 提取错误详情
      const errorMatches = output.matchAll(/● (.+?):\s*\n\s*(.+?)\n\s*at\s+(.+)/g);
      for (const match of errorMatches) {
        result.cases!.push({
          name: match[1],
          status: 'fail',
          error: match[2],
        });
      }

    } else if (framework === 'mocha') {
      // 解析 Mocha 输出
      const passingMatch = output.match(/passing\s+\((\d+)\)/);
      const failingMatch = output.match(/failing\s+\((\d+)\)/);
      
      if (passingMatch) result.passed = parseInt(passingMatch[1]);
      if (failingMatch) result.failed = parseInt(failingMatch[1]);
      result.total = (result.passed || 0) + (result.failed || 0);
    }

    return result;
  }

  /**
   * 提取数字
   */
  private extractNumber(text: string, regex: RegExp): number {
    const match = text.match(regex);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 解析错误信息
   */
  private parseError(error: string, _framework: string): AnalyzedError {
    const errorLower = error.toLowerCase();

    // 语法错误
    if (errorLower.includes('syntax error') || errorLower.includes('unexpected token')) {
      const lineCol = this.extractLineCol(error);
      return {
        type: 'syntax',
        message: error,
        line: lineCol?.line,
        column: lineCol?.col,
        severity: 'error',
        suggestion: '检查语法是否正确',
      };
    }

    // 类型错误
    if (errorLower.includes('type') && (errorLower.includes('error') || errorLower.includes('types'))) {
      const lineCol = this.extractLineCol(error);
      return {
        type: 'type',
        message: error,
        line: lineCol?.line,
        column: lineCol?.col,
        severity: 'error',
        suggestion: '检查类型定义是否正确',
      };
    }

    // 导入错误
    if (errorLower.includes('cannot find module') || errorLower.includes('import')) {
      const moduleMatch = error.match(/['"]?(@[\w/]+\/)?[\w-]+['"]?/);
      return {
        type: 'import',
        message: error,
        severity: 'error',
        suggestion: moduleMatch ? `检查模块 "${moduleMatch[0]}" 是否正确安装/导入` : '检查导入路径',
      };
    }

    // 引用错误
    if (errorLower.includes('is not defined') || errorLower.includes('cannot find name')) {
      const nameMatch = error.match(/['"]?(\w+)['"]? is not defined/);
      return {
        type: 'reference',
        message: error,
        severity: 'error',
        suggestion: nameMatch ? `声明或导入 "${nameMatch[1]}"` : '检查变量是否正确声明',
      };
    }

    // 运行时错误
    if (errorLower.includes('runtime') || errorLower.includes('exception')) {
      return {
        type: 'runtime',
        message: error,
        severity: 'error',
        suggestion: '检查运行时逻辑',
      };
    }

    // 逻辑错误
    if (errorLower.includes('expected') || errorLower.includes('received')) {
      return {
        type: 'logic',
        message: error,
        severity: 'error',
        suggestion: '检查测试断言是否正确',
      };
    }

    // 未知错误
    return {
      type: 'unknown',
      message: error,
      severity: 'error',
      suggestion: '需要人工分析',
    };
  }

  /**
   * 提取行号列号
   */
  private extractLineCol(error: string): { line?: number; col?: number } | null {
    const match = error.match(/:(\d+):(\d+)/);
    if (match) {
      return {
        line: parseInt(match[1]),
        col: parseInt(match[2]),
      };
    }
    return null;
  }

  /**
   * 判断错误是否可修复
   */
  private isFixable(error: AnalyzedError): boolean {
    const fixableTypes: AnalyzedError['type'][] = ['syntax', 'type', 'import', 'reference'];
    return fixableTypes.includes(error.type);
  }

  /**
   * 确定修复策略
   */
  private determineStrategy(
    errors: AnalyzedError[],
    fixableErrors: AnalyzedError[],
    unfixableErrors: AnalyzedError[]
  ): AnalysisResult['suggestedStrategy'] {
    if (errors.length === 0) {
      return 'ignore';
    }

    const fixableRatio = errors.length > 0 ? fixableErrors.length / errors.length : 0;

    if (fixableRatio >= 0.7) {
      return 'retry';
    } else if (fixableRatio >= 0.3) {
      return 'retry';
    } else if (unfixableErrors.length > 0) {
      return 'manual';
    }

    return 'regenerate';
  }
}

// 导出实例
export default new TestResultAnalyzerSkill();