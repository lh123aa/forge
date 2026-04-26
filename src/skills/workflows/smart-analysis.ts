// smart-analysis.skill - 智能需求分析 Skill
// 结合本地知识库和Web搜索的智能分析

import { BaseSkill } from '../base.skill.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

/**
 * 智能需求分析 Skill
 * 
 * 分析流程：
 * 1. 先搜索本地知识库
 * 2. 如果没有找到，触发Web搜索
 * 3. 学习搜索结果
 * 4. 进行需求分析
 */
export class SmartAnalysisSkill extends BaseSkill {
  readonly meta = {
    name: 'smart-analysis',
    description: '智能需求分析 - 结合知识库学习和Web搜索',
    category: 'analyze' as const,
    version: '1.0.0',
    tags: ['analyze', 'smart', 'learning', 'knowledge', 'workflow'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { 
      demand, 
      projectType,
      enableLearning = true,
    } = input.task.params as {
      demand?: string;
      projectType?: string;
      enableLearning?: boolean;
    };

    if (!demand) {
      return this.fatalError('缺少需求内容 demand 参数');
    }

    // 步骤1: 搜索本地知识库
    const localKnowledge = await this.searchLocalKnowledge(input, demand);
    
    // 步骤2: 如果没有找到相关知识，且启用了学习，则进行Web搜索
    let webKnowledge = null;
    if (!localKnowledge && enableLearning) {
      webKnowledge = await this.searchWeb(input, demand);
    }

    // 步骤3: 进行需求分析
    const analysis = this.analyzeDemand(demand, projectType, localKnowledge, webKnowledge);

    return this.success({
      analysis,
      localKnowledgeFound: !!localKnowledge,
      webKnowledgeFound: !!webKnowledge,
      learned: webKnowledge !== null,
      nextStage: 'demand-confirm',
    }, '智能需求分析完成');
  }

  /**
   * 搜索本地知识库
   */
  private async searchLocalKnowledge(input: SkillInput, _demand: string): Promise<Record<string, unknown> | null> {
    // 从上下文获取知识库搜索结果
    const knowledgeResult = input.context.readOnly.knowledgeSearchResult;
    if (knowledgeResult) {
      return knowledgeResult as Record<string, unknown>;
    }
    return null;
  }

  /**
   * 进行Web搜索
   */
  private async searchWeb(input: SkillInput, _demand: string): Promise<Record<string, unknown> | null> {
    // 从上下文获取Web搜索结果
    const webResult = input.context.readOnly.webSearchResult;
    if (webResult) {
      // 触发学习
      return webResult as Record<string, unknown>;
    }
    return null;
  }

  /**
   * 分析需求
   */
  private analyzeDemand(
    demand: string, 
    projectType: string | undefined,
    localKnowledge: Record<string, unknown> | null,
    webKnowledge: Record<string, unknown> | null
  ): Record<string, unknown> {
    // 基于知识和需求进行分析
    const analysis: Record<string, unknown> = {
      originalDemand: demand,
      detectedType: projectType || this.detectType(demand),
      keywords: this.extractKeywords(demand),
      requirements: this.extractRequirements(demand),
      complexity: this.assessComplexity(demand),
      risks: this.identifyRisks(demand),
      suggestions: this.generateSuggestions(demand, localKnowledge, webKnowledge),
    };

    // 如果有相关知识，添加知识引用
    if (localKnowledge) {
      (analysis).referencedKnowledge = {
        topic: localKnowledge.topic,
        source: 'local',
      };
    }

    if (webKnowledge) {
      (analysis).webKnowledge = {
        topic: (webKnowledge).topic,
        source: 'web',
      };
    }

    return analysis;
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
    
    return 'unknown';
  }

  /**
   * 提取关键词
   */
  private extractKeywords(demand: string): string[] {
    const keywords: string[] = [];
    const techKeywords = ['react', 'vue', 'angular', 'node', 'python', 'java', 'api', '数据库', '前端', '后端'];
    
    for (const kw of techKeywords) {
      if (demand.toLowerCase().includes(kw.toLowerCase())) {
        keywords.push(kw);
      }
    }
    
    return keywords;
  }

  /**
   * 提取需求
   */
  private extractRequirements(demand: string): string[] {
    const requirements: string[] = [];
    
    if (demand.includes('增删改查') || demand.includes('crud')) {
      requirements.push('CRUD完整功能');
    }
    if (demand.includes('登录') || demand.includes('auth')) {
      requirements.push('用户认证');
    }
    if (demand.includes('权限')) {
      requirements.push('权限控制');
    }
    if (demand.includes('实时') || demand.includes('websocket')) {
      requirements.push('实时通信');
    }
    
    return requirements;
  }

  /**
   * 评估复杂度
   */
  private assessComplexity(demand: string): string {
    const length = demand.length;
    if (length > 500) return 'high';
    if (length > 200) return 'medium';
    return 'low';
  }

  /**
   * 识别风险
   */
  private identifyRisks(demand: string): string[] {
    const risks: string[] = [];
    
    if (demand.length < 50) {
      risks.push('需求描述较为简略');
    }
    
    return risks;
  }

  /**
   * 生成建议
   */
  private generateSuggestions(
    demand: string, 
    localKnowledge: Record<string, unknown> | null,
    webKnowledge: Record<string, unknown> | null
  ): string[] {
    const suggestions: string[] = [];

    // 如果有相关知识，给出引用提示
    if (localKnowledge) {
      suggestions.push('已参考本地知识库中的相关经验');
    }

    if (webKnowledge) {
      suggestions.push('已学习外部最佳实践');
    }

    // 基于需求类型给出建议
    const type = this.detectType(demand);
    switch (type) {
      case 'page':
        suggestions.push('建议先进行 UI 设计评审');
        break;
      case 'api':
        suggestions.push('建议先定义接口文档');
        break;
      case 'component':
        suggestions.push('建议先编写组件接口定义');
        break;
    }

    return suggestions;
  }
}

// 导出实例
export default new SmartAnalysisSkill();
