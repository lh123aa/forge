// generate-code.skill - 生成代码

import { BaseSkill } from '../../../skills/base.skill.js';
import { LLMBridge } from '../../../mcp/llm-bridge.js';
import { FileStorage } from '../../../storage/index.js';
import { createLogger } from '../../../utils/logger.js';
import Handlebars from 'handlebars';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('GenerateCodeSkill');

/**
 * 代码生成参数
 */
interface CodeGenParams {
  demand?: string;
  type?: 'page' | 'api' | 'component';
  language?: string;
  framework?: string;
  template?: string;
  analysis?: Record<string, unknown>;
  componentName?: string;
  apiName?: string;
}

/**
 * 生成代码 Skill
 * 根据需求生成代码，支持模板和 LLM 两种模式
 */
export class GenerateCodeSkill extends BaseSkill {
  readonly meta = {
    name: 'generate-code',
    description: '根据需求生成代码，支持模板和 LLM 两种模式',
    category: 'generate' as const,
    version: '2.0.0',
    tags: ['generate', 'code', 'create', 'code-gen', 'template'],
  };

  private llmBridge: LLMBridge;
  private storage: FileStorage;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    super();
    this.llmBridge = new LLMBridge();
    this.storage = new FileStorage();
    this.registerHandlebarsHelpers();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as CodeGenParams;
    const { 
      demand,
      type = 'page',
      language = 'typescript',
      framework,
      template,
      analysis,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      componentName: _componentName,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      apiName: _apiName,
    } = params;

    if (!demand && !analysis) {
      return this.fatalError('缺少需求内容 demand 或 analysis 参数');
    }

    try {
      // 尝试使用模板生成
      if (template || this.hasTemplate(type, language, framework)) {
        return await this.generateFromTemplate(params);
      }

      // 使用 LLM 生成
      if (this.llmBridge.isAvailable()) {
        return await this.generateFromLLM(params);
      }

      // 降级：使用内置模板
      return await this.generateFromBuiltinTemplate(params);

    } catch (error) {
      logger.error('代码生成失败', { error });
      return this.retryableError(`代码生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 注册 Handlebars 辅助函数
   */
  private registerHandlebarsHelpers(): void {
    Handlebars.registerHelper('capitalize', (str: string) => {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    });

    Handlebars.registerHelper('camelCase', (str: string) => {
      return str ? str.replace(/[-_](.)/g, (_, c) => c.toUpperCase()) : '';
    });

    Handlebars.registerHelper('pascalCase', (str: string) => {
      const camel = str ? str.replace(/[-_](.)/g, (_, c) => c.toUpperCase()) : '';
      return camel ? camel.charAt(0).toUpperCase() + camel.slice(1) : '';
    });
  }

  /**
   * 检查是否有模板
   */
  private hasTemplate(type: string, language: string, framework?: string): boolean {
    // 内置模板映射
    const templateMap: Record<string, string[]> = {
      'page.tsx': ['page', 'typescript', 'react'],
      'component.tsx': ['component', 'typescript', 'react'],
      'api-express.ts': ['api', 'typescript', 'express'],
    };

    return Object.keys(templateMap).some(key => {
      const [t, l, f] = templateMap[key];
      return t === type && l === language && (!f || f === framework);
    });
  }

  /**
   * 从模板生成代码
   */
  private async generateFromTemplate(params: CodeGenParams): Promise<SkillOutput> {
    const { type, language, framework } = params;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _demand = params.demand;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _analysis = params.analysis;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _componentName = params.componentName;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _apiName = params.apiName;

    // 加载模板
    const templateName = this.getTemplateName(type || 'page', language || 'typescript', framework);
    const templateContent = await this.loadTemplate(templateName);

    if (!templateContent) {
      return this.generateFromBuiltinTemplate(params);
    }

    // 准备模板数据
    const templateData = this.prepareTemplateData(params);

    // 编译并渲染
    let compiledTemplate = this.templateCache.get(templateName);
    if (!compiledTemplate) {
      compiledTemplate = Handlebars.compile(templateContent);
      this.templateCache.set(templateName, compiledTemplate);
    }

    const code = compiledTemplate(templateData);

    return this.success({
      code,
      language,
      framework: framework || 'default',
      type,
      template: templateName,
      lines: code.split('\n').length,
      generatedAt: new Date().toISOString(),
    }, `代码生成完成: ${type} (${language})`);
  }

  /**
   * 从 LLM 生成代码
   * 注意：这里通过 LLMBridge 请求宿主 LLM 能力
   */
  private async generateFromLLM(params: CodeGenParams): Promise<SkillOutput> {
    const { type, language, framework } = params;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _demand = params.demand;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _analysis = params.analysis;

    // 构建让宿主 LLM 生成代码的提示
    const prompt = this.llmBridge.buildCodeGenerationPrompt({
      demand: this.buildLLMPrompt(params),
      type: type || 'page',
      language: language || 'typescript',
      framework,
    });

    // 请求宿主 LLM
    const code = await this.llmBridge.complete(prompt);

    // 后处理：清理可能的 markdown 代码块
    const cleanCode = this.cleanCodeBlock(code);

    return this.success({
      code: cleanCode,
      language,
      framework,
      type,
      method: 'llm',
      lines: cleanCode.split('\n').length,
      generatedAt: new Date().toISOString(),
    }, `代码生成完成 (LLM): ${type} (${language})`);
  }

  /**
   * 从内置模板生成
   */
  private async generateFromBuiltinTemplate(params: CodeGenParams): Promise<SkillOutput> {
    const { type = 'page', language = 'typescript', demand, componentName, apiName } = params;

    let code: string;
    const name = componentName || apiName || 'Generated';

    switch (type) {
      case 'page':
        code = this.generatePageCode(name, demand);
        break;
      case 'api':
        code = this.generateApiCode(name, demand);
        break;
      case 'component':
        code = this.generateComponentCode(name, demand);
        break;
      default:
        code = this.generateGenericCode(demand || '', type, language);
    }

    return this.success({
      code,
      language,
      type,
      method: 'builtin',
      lines: code.split('\n').length,
      generatedAt: new Date().toISOString(),
    }, `代码生成完成 (内置模板): ${type} (${language})`);
  }

  /**
   * 获取模板名称
   */
  private getTemplateName(type: string, language: string, _framework?: string): string {
    if (type === 'page' && language === 'typescript') return 'page.tsx.hbs';
    if (type === 'component' && language === 'typescript') return 'component.tsx.hbs';
    if (type === 'api' && language === 'typescript') return 'api-express.ts.hbs';
    return `${type}.${language}.hbs`;
  }

  /**
   * 加载模板文件
   */
  private async loadTemplate(templateName: string): Promise<string | null> {
    try {
      const templatePath = `data/templates/code/${templateName}`;
      const content = await this.storage.load(templatePath);
      return typeof content === 'string' ? content : null;
    } catch {
      logger.warn(`模板加载失败: ${templateName}`);
      return null;
    }
  }

  /**
   * 准备模板数据
   */
  private prepareTemplateData(params: CodeGenParams): Record<string, unknown> {
    const { demand, type, analysis, componentName, apiName } = params;

    const name = componentName || apiName || 'Generated';

    return {
      componentName: name,
      apiName: name,
      capitalizedName: name.charAt(0).toUpperCase() + name.slice(1),
      description: demand || 'Generated component',
      hasState: true,
      hasEffect: false,
      hasStyles: true,
      hasChildren: false,
      hasHeader: type === 'page',
      hasFooter: false,
      title: name,
      props: [
        { name: 'className', type: 'string', description: '自定义样式类名', required: false },
      ],
      stateFields: [],
      handlers: [],
      contentSections: [
        { className: 'content', content: '{/* TODO: 实现页面内容 */}' },
      ],
      ...analysis,
    };
  }

  /**
   * 构建 LLM 提示
   */
  private buildLLMPrompt(params: CodeGenParams): string {
    const { demand, type, language, framework, analysis } = params;

    let prompt = `请根据以下需求生成代码:\n\n需求: ${demand}`;

    if (analysis) {
      prompt += `\n\n分析结果:\n${JSON.stringify(analysis, null, 2)}`;
    }

    prompt += `\n\n要求:\n`;
    prompt += `- 代码类型: ${type}\n`;
    prompt += `- 编程语言: ${language}\n`;
    if (framework) prompt += `- 框架: ${framework}\n`;
    prompt += `- 代码完整可运行\n`;
    prompt += `- 包含必要的类型定义\n`;
    prompt += `- 遵循最佳实践`;

    return prompt;
  }

  /**
   * 清理代码块标记
   */
  private cleanCodeBlock(code: string): string {
    let clean = code.trim();
    if (clean.startsWith('```typescript')) {
      clean = clean.slice(12);
    } else if (clean.startsWith('```ts')) {
      clean = clean.slice(5);
    } else if (clean.startsWith('```javascript')) {
      clean = clean.slice(13);
    } else if (clean.startsWith('```js')) {
      clean = clean.slice(5);
    } else if (clean.startsWith('```')) {
      clean = clean.slice(3);
    }
    if (clean.endsWith('```')) {
      clean = clean.slice(0, -3);
    }
    return clean.trim();
  }

  /**
   * 生成页面代码
   */
  private generatePageCode(name: string, demand?: string): string {
    return `// ${name} Page
// ${demand || 'Generated page component'}

import React from 'react';
import styles from './${name}.module.css';

export interface ${name}Props {
  className?: string;
}

export const ${name}: React.FC<${name}Props> = ({ className }) => {
  return (
    <div className={\`\${styles.container} \${className || ''}\`.trim()}>
      <header className={styles.header}>
        <h1>${name}</h1>
      </header>
      
      <main className={styles.main}>
        {/* TODO: 实现页面内容 */}
        <p>${demand || '页面内容待实现'}</p>
      </main>
    </div>
  );
};

${name}.displayName = '${name}';

export default ${name};
`;
  }

  /**
   * 生成 API 代码
   */
  private generateApiCode(name: string, demand?: string): string {
    return `// ${name} API Handler
// ${demand || 'Generated API handler'}

import { Request, Response, NextFunction } from 'express';

export interface ${name}Request extends Request {
  body: {
    // TODO: 定义请求体结构
  };
}

export interface ${name}Response {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * ${name} API
 * ${demand || 'API handler'}
 */
export const ${name}Handler = async (
  req: ${name}Request,
  res: Response<${name}Response>,
  next: NextFunction
) => {
  try {
    // TODO: 实现业务逻辑
    
    res.json({
      code: 200,
      message: 'Success',
      data: null,
    });
  } catch (error) {
    next(error);
  }
};

export default ${name}Handler;
`;
  }

  /**
   * 生成组件代码
   */
  private generateComponentCode(name: string, demand?: string): string {
    return `// ${name} Component
// ${demand || 'Generated component'}

import React from 'react';
import styles from './${name}.module.css';

export interface ${name}Props {
  /** 自定义类名 */
  className?: string;
  /** 子元素 */
  children?: React.ReactNode;
}

/**
 * ${name} Component
 * ${demand || '组件描述'}
 */
export const ${name}: React.FC<${name}Props> = ({ 
  className, 
  children 
}) => {
  return (
    <div className={\`\${styles.container} \${className || ''}\`.trim()}>
      {/* TODO: 实现组件内容 */}
      {children}
    </div>
  );
};

${name}.displayName = '${name}';

export default ${name};
`;
  }

  /**
   * 生成通用代码
   */
  private generateGenericCode(demand: string, type: string, language: string): string {
    return `// Generated Code
// Type: ${type}
// Language: ${language}
// Demand: ${demand}

// TODO: Implement based on requirements
export function placeholder() {
  console.log('Implementation pending');
}
`;
  }
}

// 导出实例
export default new GenerateCodeSkill();
