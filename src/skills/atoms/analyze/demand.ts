// analyze-demand.skill - 分析需求

import { BaseSkill } from '../../../skills/base.skill.js';
import { LLMBridge } from '../../../mcp/llm-bridge.js';
import { FileStorage } from '../../../storage/index.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('AnalyzeDemandSkill');

/**
 * 需求分析结果
 */
interface AnalysisResult {
  projectType: string;
  background: string;
  coreTarget: string;
  targetUser: string;
  coreFunctions: Array<{ name: string; description: string }>;
  secondaryFunctions: Array<{ name: string; description: string }>;
  technicalRequirements: {
    techStack: string;
    language: string;
    uiLibrary?: string;
    runtimeEnv?: string;
  };
  acceptanceCriteria: string[];
  testCases: Array<{
    caseId: string;
    caseName: string;
    input: string;
    expectedOutput: string;
    testSteps: string[];
  }>;
  boundaryConstraints: {
    boundaryConditions: string[];
    constraints: string[];
  };
  risks: Array<{
    riskLevel: 'high' | 'medium' | 'low';
    riskDescription: string;
    suggestion: string;
  }>;
}

/**
 * 分析需求 Skill
 * 
 * 职责：
 * 1. 基础数据提取（总是执行）
 * 2. 如果宿主支持 sampling，使用 LLM 深度分析
 * 3. 返回结构化数据，供宿主或后续 Skill 使用
 */
export class AnalyzeDemandSkill extends BaseSkill {
  readonly meta = {
    name: 'analyze-demand',
    description: '分析用户需求，提取关键信息并生成结构化分析',
    category: 'analyze' as const,
    version: '2.0.0',
    tags: ['analyze', 'demand', 'parse', 'extract'],
  };

  private llmBridge: LLMBridge;
  private storage: FileStorage;

  constructor() {
    super();
    // 使用 template 模式：当宿主不支持 sampling 时，返回提示让宿主处理
    this.llmBridge = new LLMBridge({ fallbackMode: 'template' });
    this.storage = new FileStorage();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { demand, projectType, collectedData } = input.task.params as {
      demand?: string;
      projectType?: string;
      collectedData?: Record<string, unknown>;
    };

    // 合并需求来源
    const fullDemand = this.mergeDemandSources(demand, collectedData);
    
    if (!fullDemand) {
      return this.fatalError('缺少需求内容');
    }

    // 确定项目类型
    const determinedType = projectType || this.detectType(fullDemand);

    try {
      // 加载问题库（用于参考）
      const questionLib = await this.loadQuestionLib(determinedType);

      // 使用 LLM 进行深度分析
      const analysis = await this.analyzeWithLLM(fullDemand, determinedType, questionLib);

      // 生成测试用例
      analysis.testCases = this.generateTestCases(analysis);

      return this.success({
        originalDemand: fullDemand,
        projectType: determinedType,
        analysis,
        questionLib: questionLib ? { type: questionLib.type, questionCount: questionLib.questions.length } : null,
        analyzedAt: new Date().toISOString(),
      }, '需求深度分析完成');
    } catch (error) {
      logger.error('需求分析失败', { error });
      
      // 降级：使用基础分析
      const basicAnalysis = this.basicAnalysis(fullDemand, determinedType);
      return this.success({
        originalDemand: fullDemand,
        projectType: determinedType,
        analysis: basicAnalysis,
        analysisMethod: 'basic',
        warning: 'LLM 不可用，使用基础分析',
      }, '需求基础分析完成（LLM 不可用）');
    }
  }

  /**
   * 合并需求来源
   */
  private mergeDemandSources(
    demand?: string,
    collectedData?: Record<string, unknown>
  ): string | null {
    if (collectedData) {
      const parts: string[] = [];
      if (collectedData.name) parts.push(`项目名称: ${collectedData.name}`);
      if (collectedData.description) parts.push(`描述: ${collectedData.description}`);
      if (collectedData.requirements) parts.push(`需求: ${collectedData.requirements}`);
      if (collectedData.features && Array.isArray(collectedData.features)) {
        parts.push(`功能点: ${collectedData.features.join(', ')}`);
      }
      if (demand) parts.push(`补充说明: ${demand}`);
      return parts.join('\n');
    }
    return demand || null;
  }

  /**
   * 加载问题库
   */
  private async loadQuestionLib(type: string): Promise<QuestionLib | null> {
    try {
      const libPath = `data/question-lib/${type}.json`;
      const content = await this.storage.load(libPath);
      return content as QuestionLib;
    } catch {
      logger.warn(`问题库加载失败: ${type}`);
      return null;
    }
  }

  /**
   * 使用 LLM 分析
   */
  private async analyzeWithLLM(
    demand: string,
    projectType: string,
    questionLib: QuestionLib | null
  ): Promise<AnalysisResult> {
    const prompt = this.buildAnalysisPrompt(demand, projectType, questionLib);
    
    const result = await this.llmBridge.structuredOutput<AnalysisResult>(prompt, {
      type: 'object',
      properties: {
        projectType: { type: 'string' },
        background: { type: 'string' },
        coreTarget: { type: 'string' },
        targetUser: { type: 'string' },
        coreFunctions: { type: 'array' },
        technicalRequirements: { type: 'object' },
        acceptanceCriteria: { type: 'array' },
        risks: { type: 'array' },
      },
    });

    return {
      ...result,
      projectType,
    };
  }

  /**
   * 构建分析提示
   */
  private buildAnalysisPrompt(
    demand: string,
    projectType: string,
    questionLib: QuestionLib | null
  ): string {
    const typeLabels: Record<string, string> = {
      page: '页面开发',
      api: '接口开发',
      component: '组件封装',
      project: '项目初始化',
    };

    let prompt = `请深入分析以下需求，生成结构化的需求分析报告。

项目类型: ${typeLabels[projectType] || projectType}

需求内容:
${demand}

请返回 JSON 格式的分析结果，包含以下字段:
- background: 需求背景（为什么需要这个功能）
- coreTarget: 核心目标（主要解决什么问题）
- targetUser: 目标用户（谁会使用）
- coreFunctions: 核心功能列表 [{ name: 功能名称, description: 功能描述 }]
- secondaryFunctions: 辅助功能列表
- technicalRequirements: 技术要求 { techStack, language, uiLibrary?, runtimeEnv? }
- acceptanceCriteria: 验收标准列表
- boundaryConstraints: { boundaryConditions: [], constraints: [] }
- risks: 风险提示 [{ riskLevel: 'high'|'medium'|'low', riskDescription, suggestion }]`;

    if (questionLib) {
      prompt += `\n\n参考问题维度:\n${questionLib.questions.slice(0, 10).map(q => `- ${q.question}`).join('\n')}`;
    }

    return prompt;
  }

  /**
   * 基础分析（降级方案）
   */
  private basicAnalysis(demand: string, projectType: string): AnalysisResult {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _keywords = this.extractKeywords(demand);
    const functions = this.extractFunctions(demand);

    return {
      projectType,
      background: '用户需要开发一个新功能',
      coreTarget: '实现需求描述的功能',
      targetUser: '开发人员',
      coreFunctions: functions,
      secondaryFunctions: [],
      technicalRequirements: {
        techStack: this.detectTechStack(demand),
        language: 'TypeScript',
      },
      acceptanceCriteria: ['功能正常运行', '代码符合规范', '测试通过'],
      testCases: [],
      boundaryConstraints: {
        boundaryConditions: [],
        constraints: [],
      },
      risks: [],
    };
  }

  /**
   * 检测需求类型
   */
  private detectType(demand: string): string {
    const lower = demand.toLowerCase();
    
    if (lower.includes('页面') || lower.includes('page') || lower.includes('ui') || lower.includes('界面')) {
      return 'page';
    }
    if (lower.includes('接口') || lower.includes('api') || lower.includes('后端')) {
      return 'api';
    }
    if (lower.includes('组件') || lower.includes('component')) {
      return 'component';
    }
    if (lower.includes('项目') || lower.includes('project') || lower.includes('初始化')) {
      return 'project';
    }
    
    return 'page';
  }

  /**
   * 提取关键词
   */
  private extractKeywords(demand: string): string[] {
    const techKeywords = ['react', 'vue', 'angular', 'node', 'python', 'java', 'api', '数据库', '前端', '后端', 'typescript', 'javascript'];
    const found: string[] = [];
    
    for (const kw of techKeywords) {
      if (demand.toLowerCase().includes(kw.toLowerCase())) {
        found.push(kw);
      }
    }
    
    return found;
  }

  /**
   * 提取功能点
   */
  private extractFunctions(demand: string): Array<{ name: string; description: string }> {
    const functions: Array<{ name: string; description: string }> = [];
    
    if (demand.includes('增删改查') || demand.includes('CRUD')) {
      functions.push({ name: 'CRUD', description: '完整的增删改查功能' });
    }
    if (demand.includes('登录') || demand.includes('auth')) {
      functions.push({ name: '认证', description: '用户登录认证功能' });
    }
    if (demand.includes('权限')) {
      functions.push({ name: '权限', description: '权限控制功能' });
    }
    if (demand.includes('搜索') || demand.includes('查询')) {
      functions.push({ name: '搜索', description: '搜索查询功能' });
    }
    
    if (functions.length === 0) {
      functions.push({ name: '核心功能', description: '根据需求实现的核心功能' });
    }
    
    return functions;
  }

  /**
   * 检测技术栈
   */
  private detectTechStack(demand: string): string {
    const lower = demand.toLowerCase();
    if (lower.includes('vue')) return 'Vue';
    if (lower.includes('angular')) return 'Angular';
    if (lower.includes('react')) return 'React';
    if (lower.includes('next')) return 'Next.js';
    if (lower.includes('node')) return 'Node.js';
    return 'React';
  }

  /**
   * 生成测试用例
   */
  private generateTestCases(analysis: AnalysisResult): AnalysisResult['testCases'] {
    const testCases: AnalysisResult['testCases'] = [];
    
    analysis.coreFunctions.forEach((func, index) => {
      testCases.push({
        caseId: `TC-${String(index + 1).padStart(3, '0')}`,
        caseName: `${func.name}功能测试`,
        input: `执行${func.name}操作`,
        expectedOutput: `${func.name}功能正常工作`,
        testSteps: [
          `准备${func.name}测试环境`,
          `执行${func.name}操作`,
          '验证结果符合预期',
        ],
      });
    });

    return testCases;
  }
}

/**
 * 问题库结构
 */
interface QuestionLib {
  type: string;
  description: string;
  questions: Array<{
    id: string;
    category: string;
    question: string;
    required: boolean;
    options?: string[];
    placeholder?: string;
  }>;
}

// 导出实例
export default new AnalyzeDemandSkill();
