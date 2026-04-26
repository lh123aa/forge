// demand-analysis.skill - 需求分析组合 Skill
// 基于澄清后的需求，生成专业的需求分析报告

import { BaseSkill } from '../base.skill.js';
import { createLogger } from '../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

const logger = createLogger('DemandAnalysisSkill');

/**
 * 需求分析报告结构
 */
interface DemandReport {
  // 基本信息
  id: string;
  projectName: string;
  projectType: string;
  version: string;
  createdAt: string;
  
  // 需求概述
  summary: string;
  originalDemand: string;
  
  // 目标与范围
  objectives: string[];
  scope: {
    included: string[];
    excluded: string[];
  };
  
  // 用户分析
  targetUsers: {
    primary: string;
    secondary?: string;
  };
  userScenarios: Array<{
    id: string;
    title: string;
    actor: string;
    steps: string[];
  }>;
  
  // 功能需求
  functionalRequirements: Array<{
    id: string;
    category: string;
    name: string;
    description: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    acceptance?: string[];
  }>;
  
  // 非功能需求
  nonFunctionalRequirements: {
    performance?: string;
    security?: string;
    compatibility?: string;
    accessibility?: string;
  };
  
  // 技术方案建议
  techRecommendations: {
    frontend?: string[];
    backend?: string[];
    storage?: string[];
    deployment?: string[];
  };
  
  // 风险评估
  risks: Array<{
    id: string;
    description: string;
    probability: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
  
  // 开发建议
  suggestions: string[];
  
  // 下一步
  nextSteps: string[];
}

/**
 * 需求分析 Skill
 * 
 * 分析流程：
 * 1. 整合澄清后的需求信息
 * 2. 识别功能需求和非功能需求
 * 3. 评估技术方案
 * 4. 识别风险和依赖
 * 5. 生成结构化报告
 */
export class DemandAnalysisSkill extends BaseSkill {
  readonly meta = {
    name: 'demand-analysis',
    description: '分析澄清后的需求，生成专业需求报告',
    category: 'analyze' as const,
    version: '2.0.0',
    tags: ['demand', 'analysis', 'report', 'specification'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _params = input.task.params;
    
    // 从上下文获取澄清后的需求
    const collectedDemand = input.context.readOnly.collectedDemand as Record<string, unknown> | undefined;
    const clarifiedAnswers = input.context.writable.clarifiedAnswers as Record<string, unknown> | undefined;
    
    // 合并需求数据
    const demandData = {
      ...(collectedDemand || {}),
      answers: {
        ...(collectedDemand?.answers || {}),
        ...(clarifiedAnswers || {}),
      },
    };

    if (!demandData || Object.keys(demandData).length === 0) {
      return this.fatalError('未找到已采集的需求数据，请先执行需求采集和澄清');
    }

    // 生成需求报告
    const report = this.generateReport(demandData);
    
    // 生成 Markdown 格式
    const reportMarkdown = this.renderMarkdown(report);

    logger.info('Demand analysis completed', {
      projectName: report.projectName,
      functionalReqsCount: report.functionalRequirements.length,
      risksCount: report.risks.length,
    });

    return this.success({
      report,
      reportMarkdown,
      analysisSummary: {
        objectivesCount: report.objectives.length,
        functionalReqsCount: report.functionalRequirements.length,
        risksCount: report.risks.length,
      },
      nextStage: 'demand-confirm',
    }, '需求分析完成，报告已生成');
  }

  /**
   * 生成需求报告
   */
  private generateReport(demandData: Record<string, unknown>): DemandReport {
    const projectType = (demandData.projectType as string) || 'page';
    const answers = demandData.answers as Record<string, unknown> || {};
    
    // 项目名称
    const projectName = this.extractProjectName(demandData, answers);
    
    // 生成报告各部分
    const report: DemandReport = {
      id: this.generateId(),
      projectName,
      projectType,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      
      summary: this.generateSummary(demandData, answers),
      originalDemand: (demandData.description as string) || (demandData.requirements as string) || '',
      
      objectives: this.extractObjectives(demandData, answers),
      scope: this.defineScope(demandData, answers),
      
      targetUsers: this.analyzeTargetUsers(answers),
      userScenarios: this.generateUserScenarios(demandData, answers),
      
      functionalRequirements: this.extractFunctionalRequirements(demandData, answers, projectType),
      nonFunctionalRequirements: this.analyzeNonFunctionalRequirements(answers),
      
      techRecommendations: this.generateTechRecommendations(demandData, answers, projectType),
      
      risks: this.identifyRisks(demandData, answers),
      suggestions: this.generateSuggestions(demandData, answers, projectType),
      
      nextSteps: [
        '确认需求报告',
        '拆解开发任务',
        '制定开发计划',
        '开始开发',
      ],
    };

    return report;
  }

  /**
   * 提取项目名称
   */
  private extractProjectName(
    demandData: Record<string, unknown>,
    _answers: Record<string, unknown>
  ): string {
    if (demandData.name) return demandData.name as string;
    
    // 从需求描述提取
    const desc = (demandData.description as string) || '';
    const firstLine = desc.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 30) {
      return firstLine;
    }
    
    return '未命名项目';
  }

  /**
   * 生成项目概述
   */
  private generateSummary(
    demandData: Record<string, unknown>,
    answers: Record<string, unknown>
  ): string {
    const parts: string[] = [];
    
    // 项目类型
    const typeMap: Record<string, string> = {
      page: '前端页面',
      api: 'API服务',
      component: '组件库',
      project: '完整项目',
    };
    parts.push(`项目类型：${typeMap[demandData.projectType as string] || '未知'}`);
    
    // 用途
    if (answers['page_purpose'] || answers['api_purpose'] || answers['comp_usage'] || answers['proj_type']) {
      const purpose = answers['page_purpose'] || answers['api_purpose'] || answers['comp_usage'] || answers['proj_type'];
      parts.push(`主要用途：${purpose}`);
    }
    
    // 目标用户
    if (answers['page_users'] || answers['api_consumers'] || answers['proj_users']) {
      const users = answers['page_users'] || answers['api_consumers'] || answers['proj_users'];
      parts.push(`目标用户：${users}`);
    }
    
    return parts.join('；');
  }

  /**
   * 提取项目目标
   */
  private extractObjectives(
    demandData: Record<string, unknown>,
    answers: Record<string, unknown>
  ): string[] {
    const objectives: string[] = [];
    
    // 从描述提取
    const desc = (demandData.description as string) || '';
    
    // 识别目标关键词
    if (desc.includes('实现') || desc.includes('开发') || desc.includes('创建')) {
      objectives.push('完成核心功能开发');
    }
    if (desc.includes('优化') || desc.includes('提升')) {
      objectives.push('提升用户体验');
    }
    if (desc.includes('管理') || desc.includes('系统')) {
      objectives.push('实现数据管理功能');
    }
    
    // 从回答中提取
    if (answers['page_purpose']) {
      objectives.push(`实现${answers['page_purpose']}功能`);
    }
    if (answers['proj_modules']) {
      objectives.push(`完成模块：${answers['proj_modules']}`);
    }
    
    // 默认目标
    if (objectives.length === 0) {
      objectives.push('完成项目开发');
    }
    
    return objectives;
  }

  /**
   * 定义范围
   */
  private defineScope(
    demandData: Record<string, unknown>,
    answers: Record<string, unknown>
  ): { included: string[]; excluded: string[] } {
    const included: string[] = [];
    const excluded: string[] = [];
    
    // 根据回答确定范围
    const storage = answers['page_data'] || answers['api_storage'];
    if (storage && !String(storage).includes('无')) {
      included.push('数据存储与管理');
    } else {
      excluded.push('后端数据存储');
    }
    
    const auth = answers['api_auth'] || answers['proj_users'];
    if (auth && !String(auth).includes('无需') && !String(auth).includes('不需要')) {
      included.push('用户认证授权');
    } else {
      excluded.push('用户系统');
    }
    
    const responsive = answers['page_responsive'];
    if (responsive && !String(responsive).includes('仅桌面')) {
      included.push('响应式设计');
    }
    
    // 从描述提取功能
    const features = demandData.features as string[] || [];
    included.push(...features.slice(0, 5));
    
    return { included, excluded };
  }

  /**
   * 分析目标用户
   */
  private analyzeTargetUsers(answers: Record<string, unknown>): { primary: string; secondary?: string } {
    const users = answers['page_users'] || answers['api_consumers'] || answers['proj_users'];
    
    if (users) {
      return { primary: String(users) };
    }
    
    return { primary: '普通用户' };
  }

  /**
   * 生成用户场景
   */
  private generateUserScenarios(
    demandData: Record<string, unknown>,
    _answers: Record<string, unknown>
  ): DemandReport['userScenarios'] {
    const scenarios: DemandReport['userScenarios'] = [];
    const projectType = demandData.projectType as string;
    
    // 基于项目类型生成默认场景
    if (projectType === 'page') {
      scenarios.push({
        id: 'UC-001',
        title: '用户访问页面',
        actor: '普通用户',
        steps: [
          '打开页面',
          '浏览内容',
          '进行交互操作',
          '查看结果',
        ],
      });
    }
    
    if (projectType === 'api') {
      scenarios.push({
        id: 'UC-001',
        title: 'API调用',
        actor: '前端应用',
        steps: [
          '发送请求',
          '认证验证',
          '处理业务逻辑',
          '返回响应',
        ],
      });
    }
    
    return scenarios;
  }

  /**
   * 提取功能需求
   */
  private extractFunctionalRequirements(
    demandData: Record<string, unknown>,
    answers: Record<string, unknown>,
    projectType: string
  ): DemandReport['functionalRequirements'] {
    const requirements: DemandReport['functionalRequirements'] = [];
    let reqId = 1;
    
    // 从 features 提取
    const features = demandData.features as string[] || [];
    for (const feature of features) {
      requirements.push({
        id: `FR-${String(reqId++).padStart(3, '0')}`,
        category: '核心功能',
        name: feature.slice(0, 20),
        description: feature,
        priority: 'P1',
      });
    }
    
    // 根据项目类型添加默认功能需求
    const defaultReqs = this.getDefaultFunctionalRequirements(projectType, answers);
    for (const req of defaultReqs) {
      requirements.push({
        ...req,
        id: `FR-${String(reqId++).padStart(3, '0')}`,
      });
    }
    
    // 根据回答添加功能需求
    if (answers['page_interactive']) {
      requirements.push({
        id: `FR-${String(reqId++).padStart(3, '0')}`,
        category: '交互功能',
        name: '用户交互',
        description: `支持${answers['page_interactive']}交互`,
        priority: 'P1',
      });
    }
    
    return requirements;
  }

  /**
   * 获取默认功能需求
   */
  private getDefaultFunctionalRequirements(
    projectType: string,
    answers: Record<string, unknown>
  ): Array<Omit<DemandReport['functionalRequirements'][0], 'id'>> {
    const reqs: Array<Omit<DemandReport['functionalRequirements'][0], 'id'>> = [];
    
    // 画布/画板特殊功能
    const desc = String((answers as Record<string, unknown>).originalDemand || '');
    if (desc.includes('画布') || desc.includes('画板')) {
      reqs.push(
        {
          category: '核心功能',
          name: '无限画布',
          description: '支持无限滚动和缩放的画布',
          priority: 'P0',
        },
        {
          category: '核心功能',
          name: '绘图工具',
          description: '基础绘图工具：画笔、橡皮、选择',
          priority: 'P0',
        },
        {
          category: '交互功能',
          name: '缩放平移',
          description: '支持鼠标滚轮缩放和拖拽平移',
          priority: 'P1',
        }
      );
      
      // 根据用途添加特定功能
      const usage = answers['用途'] || answers['page_purpose'];
      if (String(usage).includes('绘画')) {
        reqs.push(
          {
            category: '绘图功能',
            name: '画笔设置',
            description: '画笔颜色、粗细、透明度设置',
            priority: 'P1',
          },
          {
            category: '绘图功能',
            name: '图层管理',
            description: '图层创建、切换、排序',
            priority: 'P2',
          }
        );
      }
      
      if (String(usage).includes('AI') || String(usage).includes('生成')) {
        reqs.push({
          category: 'AI功能',
          name: 'AI生成',
          description: '基于提示词生成图片',
          priority: 'P1',
        });
      }
      
      if (String(usage).includes('协作')) {
        reqs.push({
          category: '协作功能',
          name: '实时协作',
          description: '多人实时同步编辑',
          priority: 'P1',
        });
      }
    }
    
    // 通用功能需求
    switch (projectType) {
      case 'page':
        reqs.push({
          category: 'UI功能',
          name: '响应式布局',
          description: '适配不同屏幕尺寸',
          priority: 'P2',
        });
        break;
      case 'api':
        reqs.push({
          category: 'API功能',
          name: '错误处理',
          description: '统一的错误响应格式',
          priority: 'P1',
        });
        break;
      case 'component':
        reqs.push({
          category: '组件功能',
          name: 'Props支持',
          description: '支持外部配置参数',
          priority: 'P0',
        });
        break;
    }
    
    return reqs;
  }

  /**
   * 分析非功能需求
   */
  private analyzeNonFunctionalRequirements(
    answers: Record<string, unknown>
  ): DemandReport['nonFunctionalRequirements'] {
    const nfr: DemandReport['nonFunctionalRequirements'] = {};
    
    // 性能需求
    const scale = answers['api_scale'] || answers['proj_scale'];
    if (scale) {
      nfr.performance = `支持${scale}规模`;
    }
    
    // 安全需求
    const auth = answers['api_auth'] || answers['proj_users'];
    if (auth && !String(auth).includes('无需')) {
      nfr.security = `采用${auth}认证方式`;
    }
    
    // 兼容性
    const responsive = answers['page_responsive'];
    if (responsive) {
      nfr.compatibility = `支持${responsive}`;
    }
    
    return nfr;
  }

  /**
   * 生成技术方案建议
   */
  private generateTechRecommendations(
    demandData: Record<string, unknown>,
    answers: Record<string, unknown>,
    projectType: string
  ): DemandReport['techRecommendations'] {
    const rec: DemandReport['techRecommendations'] = {};
    
    // 前端技术
    const frontendTech = answers['page_tech_stack'] || answers['comp_framework'] || answers['proj_tech_stack'];
    if (frontendTech) {
      rec.frontend = [String(frontendTech)];
    } else {
      rec.frontend = projectType === 'component' 
        ? ['React/Vue（根据团队偏好）']
        : ['React + TypeScript（推荐）'];
    }
    
    // 后端技术
    if (projectType === 'api' || projectType === 'project') {
      const backendTech = answers['api_tech_stack'] || answers['proj_tech_stack'];
      rec.backend = backendTech ? [String(backendTech)] : ['Node.js/Python（根据需求选择）'];
    }
    
    // 存储
    const storage = answers['api_storage'] || answers['page_data'];
    if (storage && !String(storage).includes('静态') && !String(storage).includes('无')) {
      rec.storage = [String(storage)];
    }
    
    // 部署
    const deploy = answers['proj_deploy'];
    if (deploy) {
      rec.deployment = [String(deploy)];
    }
    
    // 特殊技术建议：画布
    const desc = (demandData.description as string) || '';
    if (desc.includes('画布') || desc.includes('画板')) {
      rec.frontend = ['HTML5 Canvas / Fabric.js / Konva.js'];
      if (rec.frontend?.length === 1) {
        rec.frontend.push('用于实现高性能绘图功能');
      }
    }
    
    return rec;
  }

  /**
   * 识别风险
   */
  private identifyRisks(
    demandData: Record<string, unknown>,
    answers: Record<string, unknown>
  ): DemandReport['risks'] {
    const risks: DemandReport['risks'] = [];
    let riskId = 1;
    
    // 需求清晰度风险
    const desc = (demandData.description as string) || '';
    if (desc.length < 50) {
      risks.push({
        id: `R-${String(riskId++).padStart(3, '0')}`,
        description: '需求描述较为简略，可能存在理解偏差',
        probability: 'medium',
        impact: 'medium',
        mitigation: '在开发前与需求方确认细节',
      });
    }
    
    // 技术风险
    if (desc.includes('画布') || desc.includes('画板')) {
      risks.push({
        id: `R-${String(riskId++).padStart(3, '0')}`,
        description: '画布性能优化复杂度较高',
        probability: 'medium',
        impact: 'high',
        mitigation: '采用成熟的绘图库（如Fabric.js），进行性能测试',
      });
    }
    
    // 集成风险
    const integrations = answers['proj_integrations'];
    if (integrations && String(integrations).length > 0) {
      risks.push({
        id: `R-${String(riskId++).padStart(3, '0')}`,
        description: '第三方服务集成可能存在兼容性问题',
        probability: 'medium',
        impact: 'medium',
        mitigation: '提前调研API文档，准备备用方案',
      });
    }
    
    return risks;
  }

  /**
   * 生成建议
   */
  private generateSuggestions(
    demandData: Record<string, unknown>,
    answers: Record<string, unknown>,
    projectType: string
  ): string[] {
    const suggestions: string[] = [];
    
    // 项目类型特定建议
    switch (projectType) {
      case 'page':
        suggestions.push('建议先完成UI设计稿评审');
        suggestions.push('考虑移动端适配方案');
        break;
      case 'api':
        suggestions.push('建议先定义API接口文档');
        suggestions.push('考虑API版本管理策略');
        break;
      case 'component':
        suggestions.push('建议先编写组件Props接口定义');
        suggestions.push('编写Storybook文档');
        break;
      case 'project':
        suggestions.push('建议先搭建项目骨架');
        suggestions.push('配置统一的代码规范和CI/CD');
        break;
    }
    
    // 技术栈建议
    const tech = answers['page_tech_stack'] || answers['proj_tech_stack'];
    if (String(tech).includes('React')) {
      suggestions.push('推荐使用TypeScript提高代码质量');
    }
    
    return suggestions;
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `REQ-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * 渲染 Markdown 格式报告
   */
  private renderMarkdown(report: DemandReport): string {
    const lines: string[] = [];
    
    // 标题
    lines.push(`# ${report.projectName}`);
    lines.push('');
    lines.push('> 需求分析报告');
    lines.push(`> 版本: ${report.version} | 生成时间: ${new Date(report.createdAt).toLocaleString('zh-CN')}`);
    lines.push('');
    
    // 概述
    lines.push('## 📋 项目概述');
    lines.push('');
    lines.push(report.summary);
    lines.push('');
    
    if (report.originalDemand) {
      lines.push('**原始需求**');
      lines.push('');
      lines.push(`> ${report.originalDemand}`);
      lines.push('');
    }
    
    // 目标
    lines.push('## 🎯 项目目标');
    lines.push('');
    report.objectives.forEach((obj, i) => {
      lines.push(`${i + 1}. ${obj}`);
    });
    lines.push('');
    
    // 范围
    lines.push('## 📦 项目范围');
    lines.push('');
    lines.push('**包含**');
    lines.push('');
    report.scope.included.forEach(item => {
      lines.push(`- ✅ ${item}`);
    });
    lines.push('');
    lines.push('**不包含**');
    lines.push('');
    report.scope.excluded.forEach(item => {
      lines.push(`- ❌ ${item}`);
    });
    lines.push('');
    
    // 目标用户
    lines.push('## 👥 目标用户');
    lines.push('');
    lines.push(`**主要用户**: ${report.targetUsers.primary}`);
    if (report.targetUsers.secondary) {
      lines.push(`**次要用户**: ${report.targetUsers.secondary}`);
    }
    lines.push('');
    
    // 功能需求
    lines.push('## 🔧 功能需求');
    lines.push('');
    lines.push('| ID | 分类 | 名称 | 描述 | 优先级 |');
    lines.push('|----|------|------|------|--------|');
    report.functionalRequirements.forEach(req => {
      lines.push(`| ${req.id} | ${req.category} | ${req.name} | ${req.description.slice(0, 30)}${req.description.length > 30 ? '...' : ''} | ${req.priority} |`);
    });
    lines.push('');
    
    // 非功能需求
    if (Object.keys(report.nonFunctionalRequirements).length > 0) {
      lines.push('## ⚙️ 非功能需求');
      lines.push('');
      const nfr = report.nonFunctionalRequirements;
      if (nfr.performance) lines.push(`- **性能**: ${nfr.performance}`);
      if (nfr.security) lines.push(`- **安全**: ${nfr.security}`);
      if (nfr.compatibility) lines.push(`- **兼容性**: ${nfr.compatibility}`);
      if (nfr.accessibility) lines.push(`- **无障碍**: ${nfr.accessibility}`);
      lines.push('');
    }
    
    // 技术方案
    lines.push('## 🛠️ 技术方案建议');
    lines.push('');
    const tech = report.techRecommendations;
    if (tech.frontend) {
      lines.push(`**前端**: ${tech.frontend.join(', ')}`);
    }
    if (tech.backend) {
      lines.push(`**后端**: ${tech.backend.join(', ')}`);
    }
    if (tech.storage) {
      lines.push(`**存储**: ${tech.storage.join(', ')}`);
    }
    if (tech.deployment) {
      lines.push(`**部署**: ${tech.deployment.join(', ')}`);
    }
    lines.push('');
    
    // 风险
    if (report.risks.length > 0) {
      lines.push('## ⚠️ 风险评估');
      lines.push('');
      report.risks.forEach(risk => {
        lines.push(`### ${risk.id}: ${risk.description}`);
        lines.push('');
        lines.push(`- **概率**: ${risk.probability}`);
        lines.push(`- **影响**: ${risk.impact}`);
        lines.push(`- **缓解措施**: ${risk.mitigation}`);
        lines.push('');
      });
    }
    
    // 建议
    lines.push('## 💡 开发建议');
    lines.push('');
    report.suggestions.forEach(s => {
      lines.push(`- ${s}`);
    });
    lines.push('');
    
    // 下一步
    lines.push('## 📌 下一步');
    lines.push('');
    report.nextSteps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push('');
    
    // 页脚
    lines.push('---');
    lines.push(`*报告ID: ${report.id}*`);
    
    return lines.join('\n');
  }
}

// 导出实例
export default new DemandAnalysisSkill();