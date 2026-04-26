// Security Analyzer - 安全静态分析工具
// 支持 Semgrep 和内置正则检测

import { execSync } from 'child_process';
import { createLogger } from './logger.js';

const logger = createLogger('SecurityAnalyzer');

/**
 * 安全漏洞类型
 */
export interface SecurityVulnerability {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  file?: string;
  line?: number;
  code?: string;
  fix?: string;
}

/**
 * 安全扫描结果
 */
export interface SecurityScanResult {
  passed: boolean;
  vulnerabilities: SecurityVulnerability[];
  scanMethod: 'semgrep' | 'regex' | 'hybrid';
  duration: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Semgrep 规则 ID 映射
 */
const SEMGREP_RULES: Record<string, { severity: 'error' | 'warning' | 'info'; message: string }> = {
  'javascript.lang.security.detect-eval-with-dom': {
    severity: 'error',
    message: '使用 eval() 可能导致代码注入攻击',
  },
  'javascript.lang.security.detect-new-function-with-string': {
    severity: 'error',
    message: '使用 Function 构造函数可能导致代码注入',
  },
  'typescript.lang.security.audit-unvalidated-redirection': {
    severity: 'warning',
    message: '检测到未验证的重定向',
  },
  'typescript.node.security.detect-sql-injection': {
    severity: 'error',
    message: '检测到可能的 SQL 注入漏洞',
  },
  'typescript.node.security.detect-eval-with-user-input': {
    severity: 'error',
    message: 'eval 使用了用户输入，可能导致代码注入',
  },
  'javascript.xss.no-innerhtml': {
    severity: 'error',
    message: '直接使用 innerHTML 可能导致 XSS 攻击',
  },
  'typescript.lang.security.detect-hardcoded-credentials': {
    severity: 'error',
    message: '检测到硬编码的凭据',
  },
  'javascript.lang.security.detect-possible-timing-attacks': {
    severity: 'info',
    message: '可能的时序攻击风险',
  },
};

/**
 * 内置危险模式检测（正则）
 */
const DANGEROUS_PATTERNS: Array<{
  pattern: RegExp;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
}> = [
  // 代码注入
  {
    pattern: /\beval\s*\(/gi,
    severity: 'error',
    category: 'code-injection',
    message: '使用 eval() 可能导致代码注入攻击',
  },
  {
    pattern: /\bnew\s+Function\s*\(/gi,
    severity: 'error',
    category: 'code-injection',
    message: '使用 Function 构造函数可能导致代码注入',
  },
  {
    pattern: /\bexec\s*\(/gi,
    severity: 'error',
    category: 'command-injection',
    message: '使用 exec() 可能导致命令注入',
  },
  {
    pattern: /\bexecSync\s*\(/gi,
    severity: 'error',
    category: 'command-injection',
    message: '使用 execSync() 可能导致命令注入',
  },
  {
    pattern: /\bsystem\s*\(/gi,
    severity: 'error',
    category: 'command-injection',
    message: '使用 system() 可能导致命令注入',
  },
  {
    pattern: /\bspawn\s*\(/gi,
    severity: 'warning',
    category: 'command-injection',
    message: '使用 spawn() 请确保输入已验证',
  },
  {
    pattern: /\bspawnSync\s*\(/gi,
    severity: 'warning',
    category: 'command-injection',
    message: '使用 spawnSync() 请确保输入已验证',
  },

  // 路径遍历
  {
    pattern: /\.\.\/[^/\\]*/g,
    severity: 'warning',
    category: 'path-traversal',
    message: '检测到路径遍历模式，可能存在路径遍历漏洞',
  },
  {
    pattern: /\bfs\.(readFile|writeFile|readFileSync|writeFileSync)\s*\([^)]*\+[^)]*\)/g,
    severity: 'warning',
    category: 'path-traversal',
    message: '文件操作中字符串拼接可能导致路径遍历',
  },

  // 敏感信息
  {
    pattern: /password\s*=\s*['"][^'"]{1,}/gi,
    severity: 'error',
    category: 'hardcoded-credentials',
    message: '检测到硬编码密码',
  },
  {
    pattern: /api[_-]?key\s*=\s*['"][^'"]{8,}/gi,
    severity: 'error',
    category: 'hardcoded-credentials',
    message: '检测到硬编码 API Key',
  },
  {
    pattern: /secret\s*=\s*['"][^'"]{8,}/gi,
    severity: 'error',
    category: 'hardcoded-credentials',
    message: '检测到硬编码 Secret',
  },
  {
    pattern: /token\s*=\s*['"][^'"]{10,}/gi,
    severity: 'warning',
    category: 'hardcoded-credentials',
    message: '检测到可能的硬编码 Token',
  },
  {
    pattern: /-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g,
    severity: 'error',
    category: 'hardcoded-credentials',
    message: '检测到私钥硬编码',
  },
  {
    pattern: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/g,
    severity: 'error',
    category: 'hardcoded-credentials',
    message: '检测到 PGP 私钥硬编码',
  },

  // SQL 注入
  {
    pattern: /SELECT.*\+.*FROM|INSERT.*\+.*VALUES|UPDATE.*\+.*SET.*WHERE/gi,
    severity: 'error',
    category: 'sql-injection',
    message: '检测到 SQL 语句字符串拼接，存在 SQL 注入风险',
  },

  // XSS
  {
    pattern: /innerHTML\s*=/gi,
    severity: 'error',
    category: 'xss',
    message: '直接设置 innerHTML 可能导致 XSS 攻击',
  },
  {
    pattern: /outerHTML\s*=/gi,
    severity: 'error',
    category: 'xss',
    message: '直接设置 outerHTML 可能导致 XSS 攻击',
  },
  {
    pattern: /document\.write\s*\(/gi,
    severity: 'warning',
    category: 'xss',
    message: '使用 document.write 可能导致 XSS 攻击',
  },
  {
    pattern: /\.insertAdjacentHTML\(/gi,
    severity: 'warning',
    category: 'xss',
    message: '使用 insertAdjacentHTML 可能导致 XSS 攻击',
  },

  // 弱加密
  {
    pattern: /\bmd5\s*\(|MD5\s*\(/gi,
    severity: 'warning',
    category: 'weak-crypto',
    message: 'MD5 是弱哈希算法，建议使用 SHA-256 或更强算法',
  },
  {
    pattern: /\bsha1\s*\(|SHA1\s*\(/gi,
    severity: 'warning',
    category: 'weak-crypto',
    message: 'SHA-1 是弱哈希算法，建议使用 SHA-256 或更强算法',
  },
  {
    pattern: /\bdes\s*\(|\bDES\s*\(/gi,
    severity: 'warning',
    category: 'weak-crypto',
    message: 'DES 是不安全的加密算法，建议使用 AES',
  },
  {
    pattern: /\brc4\s*\(|\bRC4\s*\(/gi,
    severity: 'warning',
    category: 'weak-crypto',
    message: 'RC4 是不安全的加密算法，已被废弃',
  },

  // 不安全的随机数
  {
    pattern: /\bMath\.random\s*\(/gi,
    severity: 'info',
    category: 'weak-random',
    message: 'Math.random() 不是加密安全的随机数生成器',
  },

  // 不安全的 TLS
  {
    pattern: /tls\.createServer\s*\(\s*\{[^}]*rejectUnauthorized:\s*false/gi,
    severity: 'warning',
    category: 'insecure-tls',
    message: '禁用证书验证会导致 TLS 安全风险',
  },
  {
    pattern: /process\.env\.NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/gi,
    severity: 'error',
    category: 'insecure-tls',
    message: '禁用 TLS 证书验证会导致安全风险',
  },

  // 潜在的文件包含
  {
    pattern: /import\s*\(\s*.*\+.*\s*\)/gi,
    severity: 'warning',
    category: 'dynamic-import',
    message: '动态导入使用字符串拼接，可能存在注入风险',
  },
  {
    pattern: /require\s*\(\s*.*\+.*\s*\)/gi,
    severity: 'warning',
    category: 'dynamic-require',
    message: '动态 require 使用字符串拼接，可能存在注入风险',
  },

  // 调试代码残留
  {
    pattern: /\bconsole\.log\s*\(\s*(?:password|passwd|pwd|secret|token|api[_-]?key)\s*/gi,
    severity: 'warning',
    category: 'debug-code',
    message: '在控制台输出敏感信息可能泄露机密',
  },
  {
    pattern: /debugger\s*;/gi,
    severity: 'info',
    category: 'debug-code',
    message: '调试器断点代码残留可能影响性能',
  },
];

/**
 * 安全分析器类
 */
export class SecurityAnalyzer {
  private semgrepAvailable: boolean | null = null;

  /**
   * 检查 Semgrep 是否可用
   */
  async checkSemgrep(): Promise<boolean> {
    if (this.semgrepAvailable !== null) {
      return this.semgrepAvailable;
    }

    try {
      execSync('semgrep --version', { encoding: 'utf-8', stdio: 'pipe' });
      this.semgrepAvailable = true;
      logger.info('Semgrep is available');
      return true;
    } catch {
      this.semgrepAvailable = false;
      logger.info('Semgrep is not available, using regex-based detection');
      return false;
    }
  }

  /**
   * 扫描代码或文件
   */
  async scan(target: string | string[], options?: {
    useSemgrep?: boolean;
    minSeverity?: 'error' | 'warning' | 'info';
  }): Promise<SecurityScanResult> {
    const startTime = Date.now();
    const minSeverity = options?.minSeverity || 'info';

    // 检查 Semgrep
    const useSemgrep = options?.useSemgrep !== false && await this.checkSemgrep();

    let vulnerabilities: SecurityVulnerability[] = [];

    if (useSemgrep && typeof target === 'string') {
      // 使用 Semgrep 扫描
      vulnerabilities = await this.scanWithSemgrep(target);
    } else if (useSemgrep && Array.isArray(target)) {
      // 多文件 Semgrep 扫描
      vulnerabilities = await this.scanMultipleWithSemgrep(target);
    } else {
      // 使用正则扫描
      vulnerabilities = this.scanWithRegex(target);
    }

    // 过滤低级别漏洞
    const severityOrder = { error: 3, warning: 2, info: 1 };
    vulnerabilities = vulnerabilities.filter(
      (v) => severityOrder[v.severity] >= severityOrder[minSeverity]
    );

    const errorCount = vulnerabilities.filter((v) => v.severity === 'error').length;
    const warningCount = vulnerabilities.filter((v) => v.severity === 'warning').length;
    const infoCount = vulnerabilities.filter((v) => v.severity === 'info').length;

    return {
      passed: errorCount === 0,
      vulnerabilities,
      scanMethod: useSemgrep ? 'semgrep' : 'regex',
      duration: Date.now() - startTime,
      errorCount,
      warningCount,
      infoCount,
    };
  }

  /**
   * 使用 Semgrep 扫描
   */
  private async scanWithSemgrep(targetPath: string): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      // 运行 Semgrep 扫描
      const output = execSync(
        `semgrep --json --quiet --config=auto "${targetPath}"`,
        { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
      );

      const result = JSON.parse(output);

      if (result.results && Array.isArray(result.results)) {
        for (const finding of result.results) {
          const ruleId = finding.check_id || 'unknown';
          const ruleInfo = SEMGREP_RULES[ruleId] || {
            severity: 'info',
            message: finding.extra?.message || 'Unknown security issue',
          };

          vulnerabilities.push({
            id: ruleId,
            severity: ruleInfo.severity,
            category: this.getCategoryFromRuleId(ruleId),
            message: ruleInfo.message,
            file: finding.path,
            line: finding.start?.line,
            code: finding.extra?.lines,
            fix: finding.extra?.fix,
          });
        }
      }

      logger.info(`Semgrep found ${vulnerabilities.length} vulnerabilities`);
    } catch (error) {
      // Semgrep 失败时记录错误但不中断流程
      logger.warn(`Semgrep scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return vulnerabilities;
  }

  /**
   * 多文件 Semgrep 扫描
   */
  private async scanMultipleWithSemgrep(targetPaths: string[]): Promise<SecurityVulnerability[]> {
    const allVulnerabilities: SecurityVulnerability[] = [];

    for (const targetPath of targetPaths) {
      const vulnerabilities = await this.scanWithSemgrep(targetPath);
      allVulnerabilities.push(...vulnerabilities);
    }

    return allVulnerabilities;
  }

  /**
   * 使用正则扫描
   */
  private scanWithRegex(target: string | string[]): SecurityVulnerability[] {
    const vulnerabilities: SecurityVulnerability[] = [];
    const codeFiles = Array.isArray(target) ? target : [target];

    for (const code of codeFiles) {
      for (const { pattern, severity, category, message } of DANGEROUS_PATTERNS) {
        // 重置正则状态
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(code)) !== null) {
          vulnerabilities.push({
            id: `regex-${category}-${match.index}`,
            severity,
            category,
            message,
            code: this.extractCodeContext(code, match.index, 50),
            fix: this.getFixSuggestion(category),
          });

          // 防止无限循环
          if (match.index === pattern.lastIndex) {
            pattern.lastIndex++;
          }
        }
      }
    }

    return vulnerabilities;
  }

  /**
   * 提取代码上下文
   */
  private extractCodeContext(code: string, index: number, radius: number): string {
    const start = Math.max(0, index - radius);
    const end = Math.min(code.length, index + radius);
    let context = code.substring(start, end);

    if (start > 0) context = '...' + context;
    if (end < code.length) context = context + '...';

    return context.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  }

  /**
   * 根据规则 ID 获取类别
   */
  private getCategoryFromRuleId(ruleId: string): string {
    if (ruleId.includes('injection')) return 'injection';
    if (ruleId.includes('xss')) return 'xss';
    if (ruleId.includes('sql')) return 'sql-injection';
    if (ruleId.includes('credential')) return 'hardcoded-credentials';
    if (ruleId.includes('crypto')) return 'weak-crypto';
    if (ruleId.includes('tls')) return 'insecure-tls';
    return 'security';
  }

  /**
   * 获取修复建议
   */
  private getFixSuggestion(category: string): string {
    const suggestions: Record<string, string> = {
      'code-injection': '使用 JSON.parse() 解析 JSON 数据，或使用模板引擎',
      'command-injection': '使用 child_process.execFile() 替代 exec()，并验证所有输入',
      'sql-injection': '使用参数化查询或 ORM',
      'xss': '使用 textContent 或 DOMPurify 库',
      'hardcoded-credentials': '使用环境变量或密钥管理服务',
      'weak-crypto': '使用 crypto 模块的现代算法',
      'path-traversal': '使用 path.resolve() 和验证路径',
      'insecure-tls': '启用证书验证',
      'weak-random': '使用 crypto.randomBytes()',
      'debug-code': '移除调试代码',
    };

    return suggestions[category] || '请审查并修复此问题';
  }

  /**
   * 生成报告
   */
  generateReport(result: SecurityScanResult): string {
    const lines: string[] = [];

    lines.push('=== 安全扫描报告 ===');
    lines.push(`扫描方法: ${result.scanMethod}`);
    lines.push(`扫描耗时: ${result.duration}ms`);
    lines.push(`状态: ${result.passed ? '✅ 通过' : '❌ 失败'}`);
    lines.push('');

    if (result.errorCount > 0) {
      lines.push(`🔴 严重错误: ${result.errorCount}`);
    }
    if (result.warningCount > 0) {
      lines.push(`🟡 警告: ${result.warningCount}`);
    }
    if (result.infoCount > 0) {
      lines.push(`🔵 信息: ${result.infoCount}`);
    }

    if (result.vulnerabilities.length > 0) {
      lines.push('');
      lines.push('--- 漏洞详情 ---');

      const grouped = this.groupByCategory(result.vulnerabilities);
      for (const [category, vulns] of Object.entries(grouped)) {
        lines.push(`\n📁 ${category} (${vulns.length})`);
        for (const vuln of vulns) {
          const icon = vuln.severity === 'error' ? '🔴' : vuln.severity === 'warning' ? '🟡' : '🔵';
          lines.push(`  ${icon} ${vuln.message}`);
          if (vuln.file) {
            lines.push(`     位置: ${vuln.file}${vuln.line ? `:${vuln.line}` : ''}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 按类别分组漏洞
   */
  private groupByCategory(vulnerabilities: SecurityVulnerability[]): Record<string, SecurityVulnerability[]> {
    const grouped: Record<string, SecurityVulnerability[]> = {};

    for (const vuln of vulnerabilities) {
      if (!grouped[vuln.category]) {
        grouped[vuln.category] = [];
      }
      grouped[vuln.category].push(vuln);
    }

    return grouped;
  }
}

// 导出单例
export const securityAnalyzer = new SecurityAnalyzer();

export default securityAnalyzer;
