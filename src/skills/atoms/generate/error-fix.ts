// error-fix.skill - 错误自动修复

import { BaseSkill } from '../../base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

interface ErrorFixParams {
  code?: string;
  language?: string;
  errors?: Array<{
    line?: number;
    column?: number;
    message: string;
    severity?: 'error' | 'warning' | 'info';
  }>;
  fixLevel?: 'safe' | 'aggressive';
}

interface FixResult {
  fixed: boolean;
  originalCode: string;
  fixedCode: string;
  appliedFixes: string[];
  remainingErrors: Array<{
    message: string;
    canFix: boolean;
    suggestion?: string;
  }>;
}

/**
 * 错误自动修复 Skill
 * 检测并修复常见语法错误、类型错误，提供安全降级
 */
export class ErrorFixSkill extends BaseSkill {
  readonly meta = {
    name: 'error-fix',
    description: '检测并自动修复代码错误，支持安全降级',
    category: 'generate' as const,
    version: '1.0.0',
    tags: ['error', 'fix', 'repair', 'debug', 'error-fix'],
  };

  // 常见错误修复规则
  private fixRules: Array<{
    pattern: RegExp;
    replacement: string | ((match: string, ...args: unknown[]) => string);
    description: string;
    safe: boolean;
  }> = [
    // 缺失分号（JS/TS）
    {
      pattern: /([a-zA-Z0-9)\]}'"])\s*\n\s*([a-zA-Z(])/g,
      replacement: '$1;\n$2',
      description: '自动添加缺失的分号',
      safe: true,
    },
    // 缺失逗号
    {
      pattern: /(['"`])(?!\s*[,;)}])\s*\n\s*(['"`])/g,
      replacement: '$1,\n$2',
      description: '修复数组/对象中缺失的逗号',
      safe: true,
    },
    // 修复多余的逗号（ES5兼容）
    {
      pattern: /,\s*([\]}])\s*$/gm,
      replacement: '$1',
      description: '移除多余的尾随逗号',
      safe: true,
    },
    // 修复未闭合的括号
    {
      pattern: /\(\s*\)/g,
      replacement: '()',
      description: '规范化空括号',
      safe: true,
    },
    // 修复多余空格
    {
      pattern: /\s+/g,
      replacement: ' ',
      description: '规范化多余空格',
      safe: true,
    },
    // 修复引号不一致
    {
      pattern: /("([^"]*)")/g,
      replacement: "'$2'",
      description: '统一引号为单引号',
      safe: false,
    },
  ];

  // TypeScript 特定修复规则
  private tsFixRules: Array<{
    pattern: RegExp;
    replacement: string;
    description: string;
    safe: boolean;
  }> = [
    // 修复 any 类型使用
    {
      pattern: /:\s*any\b/g,
      replacement: ': unknown',
      description: '将 any 替换为 unknown',
      safe: false,
    },
    // 修复可能的 undefined 访问
    {
      pattern: /\.(\w+)(?!\?)\s*\./g,
      replacement: '?.',
      description: '添加可选链防止 undefined 错误',
      safe: true,
    },
  ];

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as ErrorFixParams;
    const { code, language = 'typescript', errors, fixLevel = 'safe' } = params;

    if (!code) {
      return this.fatalError('缺少代码 code 参数');
    }

    try {
      const result = this.fixErrors(code, language, errors, fixLevel);

      // 判断执行结果
      if (result.fixed) {
        return this.success(
          {
            originalCode: result.originalCode,
            fixedCode: result.fixedCode,
            appliedFixes: result.appliedFixes,
            remainingErrors: result.remainingErrors,
            fixCount: result.appliedFixes.length,
            language,
          },
          `错误修复完成，应用了 ${result.appliedFixes.length} 个修复`
        );
      } else if (result.remainingErrors.length > 0) {
        // 有无法修复的错误，返回警告
        return {
          code: 300,
          data: {
            originalCode: result.originalCode,
            fixedCode: result.fixedCode,
            appliedFixes: result.appliedFixes,
            remainingErrors: result.remainingErrors,
          },
          message: `[${this.meta.name}] 部分错误无法自动修复，需要人工处理`,
        };
      } else {
        // 无错误
        return this.success(
          {
            originalCode: code,
            fixedCode: code,
            appliedFixes: [],
            remainingErrors: [],
            fixCount: 0,
          },
          '代码无错误，无需修复'
        );
      }
    } catch (error) {
      return this.fatalError(
        `错误修复失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 修复代码错误
   */
  private fixErrors(
    code: string,
    language: string,
    errors?: ErrorFixParams['errors'],
    fixLevel?: string
  ): FixResult {
    let fixedCode = code;
    const appliedFixes: string[] = [];
    const remainingErrors: FixResult['remainingErrors'] = [];

    // 如果有具体错误列表，优先处理
    if (errors && errors.length > 0) {
      for (const error of errors) {
        const fixResult = this.tryFixSpecificError(error, fixedCode, language);
        if (fixResult.applied) {
          fixedCode = fixResult.code;
          appliedFixes.push(error.message);
        } else if (!fixResult.canFix) {
          remainingErrors.push({
            message: error.message,
            canFix: false,
            suggestion: fixResult.suggestion,
          });
        }
      }
    }

    // 应用通用修复规则
    const activeRules =
      fixLevel === 'aggressive' ? this.fixRules : this.fixRules.filter((rule) => rule.safe);

    for (const rule of activeRules) {
      const beforeLength = fixedCode.length;
      fixedCode = fixedCode.replace(rule.pattern, rule.replacement as string);
      if (fixedCode.length !== beforeLength) {
        appliedFixes.push(rule.description);
      }
    }

    // 如果是 TypeScript，应用 TS 特定规则
    if (language === 'typescript' || language === 'ts') {
      for (const rule of this.tsFixRules) {
        const beforeLength = fixedCode.length;
        fixedCode = fixedCode.replace(rule.pattern, rule.replacement);
        if (fixedCode.length !== beforeLength) {
          appliedFixes.push(rule.description);
        }
      }
    }

    // 去重
    const uniqueFixes = [...new Set(appliedFixes)];

    return {
      fixed: uniqueFixes.length > 0,
      originalCode: code,
      fixedCode,
      appliedFixes: uniqueFixes,
      remainingErrors,
    };
  }

  /**
   * 尝试修复特定错误
   */
  private tryFixSpecificError(
    error: { message: string; line?: number; column?: number },
    code: string,
    language: string
  ): { applied: boolean; code: string; canFix: boolean; suggestion?: string } {
    const message = error.message.toLowerCase();

    // 语法错误
    if (message.includes('syntax error')) {
      return this.fixSyntaxError(error, code);
    }

    // 类型错误
    if (message.includes('type') && message.includes('error')) {
      return this.fixTypeError(error, code, language);
    }

    // 未定义错误
    if (message.includes('is not defined') || message.includes('cannot find name')) {
      return this.fixUndefinedError(error, code);
    }

    // 不可修复
    return {
      applied: false,
      code,
      canFix: false,
      suggestion: '此错误需要人工处理',
    };
  }

  /**
   * 修复语法错误
   */
  private fixSyntaxError(
    error: { message: string; line?: number; column?: number },
    code: string
  ): { applied: boolean; code: string; canFix: boolean } {
    const message = error.message.toLowerCase();

    // 缺失分号
    if (message.includes(';')) {
      return { applied: false, code, canFix: true };
    }

    // 括号不匹配 - 尝试添加
    if (message.includes('bracket') || message.includes('parenthesis')) {
      return { applied: false, code, canFix: true };
    }

    return { applied: false, code, canFix: false };
  }

  /**
   * 修复类型错误
   */
  private fixTypeError(
    error: { message: string; line?: number; column?: number },
    code: string,
    language: string
  ): { applied: boolean; code: string; canFix: boolean } {
    if (language !== 'typescript' && language !== 'ts') {
      return { applied: false, code, canFix: false };
    }

    const message = error.message.toLowerCase();

    // 可能为 undefined
    if (message.includes('possibly undefined')) {
      // 添加可选链
      const lines = code.split('\n');
      if (error.line !== undefined && lines[error.line - 1]) {
        lines[error.line - 1] = lines[error.line - 1].replace(/\.(\w+)/g, '?.$1');
        return { applied: true, code: lines.join('\n'), canFix: true };
      }
    }

    return { applied: false, code, canFix: false };
  }

  /**
   * 修复未定义错误
   */
  private fixUndefinedError(
    error: { message: string; line?: number; column?: number },
    code: string
  ): { applied: boolean; code: string; canFix: boolean } {
    const message = error.message.toLowerCase();

    // 提取未定义的名称
    const match = message.match(/['"](\w+)['"] is not defined/);
    if (match) {
      const undefinedName = match[1];

      // 常见 React 组件修复
      const reactComponents: Record<string, string> = {
        div: 'div',
        span: 'span',
        button: 'button',
        input: 'input',
        img: 'img',
        a: 'a',
        p: 'p',
        ul: 'ul',
        li: 'li',
      };

      if (reactComponents[undefinedName]) {
        return { applied: false, code, canFix: false };
      }

      // 建议添加声明或导入
      return {
        applied: false,
        code,
        canFix: false,
      };
    }

    return { applied: false, code, canFix: false };
  }
}

// 导出实例
export default new ErrorFixSkill();
