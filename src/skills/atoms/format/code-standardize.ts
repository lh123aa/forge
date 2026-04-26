// code-format.skill - 代码标准化

import { BaseSkill } from '../../base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

interface FormatParams {
  code?: string;
  language?: string;
  style?: 'default' | 'compact' | 'expanded';
  indent?: number;
  semicolons?: boolean;
  quotes?: 'single' | 'double';
  trailingComma?: boolean;
  maxLineLength?: number;
}

interface FormatResult {
  originalCode: string;
  formattedCode: string;
  changes: Array<{
    type: string;
    description: string;
    before?: string;
    after?: string;
  }>;
  stats: {
    originalLines: number;
    formattedLines: number;
    originalLength: number;
    formattedLength: number;
  };
}

/**
 * 代码标准化 Skill
 * 规范化代码格式，统一编码风格
 */
export class CodeFormatSkill extends BaseSkill {
  readonly meta = {
    name: 'code-format',
    description: '标准化代码格式，统一编码风格',
    category: 'format' as const,
    version: '2.0.0',
    tags: ['format', 'standardize', 'style', 'prettier', 'lint'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as FormatParams;
    const {
      code,
      language = 'typescript',
      style = 'default',
      indent = 2,
      semicolons = true,
      quotes = 'single',
      trailingComma = true,
      maxLineLength = 100,
    } = params;

    if (!code) {
      return this.fatalError('缺少代码 code 参数');
    }

    try {
      const result = this.formatCode({
        code,
        language,
        style,
        indent,
        semicolons,
        quotes,
        trailingComma,
        maxLineLength,
      });

      return this.success({
        originalCode: result.originalCode,
        formattedCode: result.formattedCode,
        changes: result.changes,
        stats: result.stats,
        changeCount: result.changes.length,
      }, `代码标准化完成，应用了 ${result.changes.length} 项规范化`);

    } catch (error) {
      return this.fatalError(`代码标准化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 格式化代码
   */
  private formatCode(params: {
    code: string;
    language: string;
    style: string;
    indent: number;
    semicolons: boolean;
    quotes: string;
    trailingComma: boolean;
    maxLineLength: number;
  }): FormatResult {
    const { code, indent, semicolons, quotes, trailingComma, maxLineLength } = params;
    let formattedCode = code;
    const changes: FormatResult['changes'] = [];

    // 1. 规范化缩进
    const indentResult = this.normalizeIndent(formattedCode, indent);
    if (indentResult.changed) {
      formattedCode = indentResult.code;
      changes.push({
        type: 'indent',
        description: `缩进统一为 ${indent} 空格`,
      });
    }

    // 2. 规范化行尾空白
    const trimResult = this.trimLines(formattedCode);
    if (trimResult.changed) {
      formattedCode = trimResult.code;
      changes.push({
        type: 'trim',
        description: '移除行尾多余空白',
      });
    }

    // 3. 规范化空行
    const blankResult = this.normalizeBlankLines(formattedCode);
    if (blankResult.changed) {
      formattedCode = blankResult.code;
      changes.push({
        type: 'blank',
        description: '规范化连续空行',
      });
    }

    // 4. 规范化引号
    if (quotes === 'single') {
      const quoteResult = this.normalizeQuotes(formattedCode, 'single');
      if (quoteResult.changed) {
        formattedCode = quoteResult.code;
        changes.push({
          type: 'quotes',
          description: '引号统一为单引号',
          before: quoteResult.before,
          after: quoteResult.after,
        });
      }
    }

    // 5. 规范化分号
    if (!semicolons) {
      const semiResult = this.removeSemicolons(formattedCode);
      if (semiResult.changed) {
        formattedCode = semiResult.code;
        changes.push({
          type: 'semicolons',
          description: '移除不必要的分号',
        });
      }
    }

    // 6. 尾随逗号
    if (trailingComma) {
      const commaResult = this.addTrailingComma(formattedCode, params.language);
      if (commaResult.changed) {
        formattedCode = commaResult.code;
        changes.push({
          type: 'trailing-comma',
          description: '添加尾随逗号',
        });
      }
    }

    // 7. 最大行长度检查
    const lineLengthResult = this.checkLineLength(formattedCode, maxLineLength);
    if (lineLengthResult.warnings.length > 0) {
      changes.push({
        type: 'line-length',
        description: `发现 ${lineLengthResult.warnings.length} 行超过最大长度限制`,
      });
    }

    return {
      originalCode: code,
      formattedCode,
      changes,
      stats: {
        originalLines: code.split('\n').length,
        formattedLines: formattedCode.split('\n').length,
        originalLength: code.length,
        formattedLength: formattedCode.length,
      },
    };
  }

  /**
   * 规范化缩进
   */
  private normalizeIndent(code: string, indentSize: number): { code: string; changed: boolean } {
    const lines = code.split('\n');
    let changed = false;

    const normalizedLines = lines.map((line, _index) => {
      // 计算当前缩进级别
      const tabMatches = line.match(/^\t*/);
      const spaceMatches = line.match(/^ */);
      
      let currentIndent = 0;
      if (tabMatches && tabMatches[0]) {
        currentIndent = tabMatches[0].length;
      } else if (spaceMatches && spaceMatches[0]) {
        currentIndent = Math.floor(spaceMatches[0].length / indentSize);
      }

      // 生成新的缩进
      const newIndent = ' '.repeat(currentIndent * indentSize);
      const content = line.trimStart();
      const newLine = newIndent + content;

      if (newLine !== line) {
        changed = true;
      }

      return newLine;
    });

    return {
      code: normalizedLines.join('\n'),
      changed,
    };
  }

  /**
   * 规范化行尾空白
   */
  private trimLines(code: string): { code: string; changed: boolean } {
    const lines = code.split('\n');
    let changed = false;

    const trimmedLines = lines.map(line => {
      const trimmed = line.replace(/\s+$/, '');
      if (trimmed !== line) {
        changed = true;
      }
      return trimmed;
    });

    return {
      code: trimmedLines.join('\n'),
      changed,
    };
  }

  /**
   * 规范化空行
   */
  private normalizeBlankLines(code: string): { code: string; changed: boolean } {
    const normalized = code.replace(/\n{3,}/g, '\n\n');
    return {
      code: normalized,
      changed: normalized !== code,
    };
  }

  /**
   * 规范化引号
   */
  private normalizeQuotes(code: string, quoteStyle: 'single' | 'double'): { code: string; changed: boolean; before?: string; after?: string } {
    let changed = false;
    let result = code;

    // 避免替换字符串内部的引号
    const pattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
    
    const beforeLength = result.length;
    result = result.replace(pattern, (match) => {
      // 跳过 already correct
      if (
        (quoteStyle === 'single' && match.startsWith("'")) ||
        (quoteStyle === 'double' && match.startsWith('"'))
      ) {
        return match;
      }

      // 跳过包含转义引号的字符串
      if (match.includes("\\'") || match.includes('\\"')) {
        return match;
      }

      changed = true;
      const inner = match.slice(1, -1);
      return quoteStyle === 'single' ? `'${inner}'` : `"${inner}"`;
    });

    return {
      code: result,
      changed,
      before: beforeLength !== result.length ? quoteStyle === 'single' ? '双引号' : '单引号' : undefined,
      after: beforeLength !== result.length ? quoteStyle === 'single' ? '单引号' : '双引号' : undefined,
    };
  }

  /**
   * 移除不必要的分号
   */
  private removeSemicolons(code: string): { code: string; changed: boolean } {
    let changed = false;
    
    // 移除行尾的分号（不在字符串内部）
    const lines = code.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      
      // 跳过空行和只有分号的行
      if (!trimmed || trimmed === ';') {
        return line;
      }

      // 跳过注释行
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        return line;
      }

      // 移除分号
      if (trimmed.endsWith(';')) {
        changed = true;
        return line.replace(/;(\s*)$/, '$1');
      }

      return line;
    });

    return {
      code: processedLines.join('\n'),
      changed,
    };
  }

  /**
   * 添加尾随逗号
   */
  private addTrailingComma(code: string, _language: string): { code: string; changed: boolean } {
    let changed = false;
    let result = code;

    // 数组和对象字面量添加尾随逗号
    // 简单实现：检测 } 和 ] 前面没有逗号的情况
    const patterns = [
      { regex: /\[([^\]]+)\]/g, replacement: this.addCommaToArray },
      { regex: /\{([^}]+)\}/g, replacement: this.addCommaToObject },
    ];

    for (const { regex, replacement } of patterns) {
      const beforeLength = result.length;
      result = result.replace(regex, replacement);
      if (result.length !== beforeLength) {
        changed = true;
      }
    }

    return {
      code: result,
      changed,
    };
  }

  /**
   * 为数组添加尾随逗号
   */
  private addCommaToArray(match: string, content: string): string {
    if (content.includes(',')) {
      const parts = content.split(',').map(p => p.trim()).filter(p => p);
      if (parts.length > 1 && !content.trim().endsWith(',')) {
        return '[' + parts.join(', ') + ', ]';
      }
    }
    return match;
  }

  /**
   * 为对象添加尾随逗号
   */
  private addCommaToObject(match: string, content: string): string {
    if (content.includes(':')) {
      const parts = content.split(',').map(p => p.trim()).filter(p => p);
      if (parts.length > 1 && !content.trim().endsWith(',')) {
        return '{' + parts.join(', ') + ', }';
      }
    }
    return match;
  }

  /**
   * 检查行长度
   */
  private checkLineLength(code: string, maxLength: number): { warnings: Array<{ line: number; length: number }> } {
    const lines = code.split('\n');
    const warnings: Array<{ line: number; length: number }> = [];

    lines.forEach((line, index) => {
      if (line.length > maxLength) {
        warnings.push({
          line: index + 1,
          length: line.length,
        });
      }
    });

    return { warnings };
  }
}

// 导出实例
export default new CodeFormatSkill();