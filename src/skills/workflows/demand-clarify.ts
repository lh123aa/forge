// demand-clarify.skill - 需求澄清 Skill
// 分析初始需求，识别关键点，生成专业澄清问题

import { BaseSkill } from '../base.skill.js';
import { FileStorage } from '../../storage/index.js';
import { createLogger } from '../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../types/index.js';

const logger = createLogger('DemandClarifySkill');

/**
 * 澄清问题结构
 */
interface ClarificationQuestion {
  id: string;
  category: 'core' | 'tech' | 'ux' | 'business' | 'constraint';
  priority: 'critical' | 'important' | 'optional';
  question: string;
  why: string; // 为什么这个问题重要
  options?: string[];
  defaultAnswer?: string;
  followUp?: string[];
}

/**
 * 需求分析结果
 */
interface DemandAnalysis {
  originalDemand: string;
  projectType: string;
  detectedKeywords: string[];
  ambiguousPoints: string[]; // 模糊点
  missingInfo: string[]; // 缺失信息
  technicalConsiderations: string[]; // 技术考虑点
  questions: ClarificationQuestion[];
}

/**
 * 项目类型特定的分析规则
 */
const PROJECT_TYPE_ANALYSIS: Record<string, {
  keywords: string[];
  criticalQuestions: string[];
  techConsiderations: string[];
}> = {
  page: {
    keywords: ['页面', '界面', 'UI', '前端', '展示', '表单', '列表'],
    criticalQuestions: [
      '目标用户是谁？',
      '主要交互方式是什么？',
      '是否需要响应式设计？',
      '数据来源是什么？',
    ],
    techConsiderations: ['UI框架选择', '状态管理', '数据请求方式', 'SEO需求'],
  },
  api: {
    keywords: ['接口', 'API', '后端', '服务', 'REST', 'GraphQL'],
    criticalQuestions: [
      '接口的主要消费者是谁？',
      '预期并发量是多少？',
      '是否需要认证授权？',
      '数据存储方式？',
    ],
    techConsiderations: ['数据库选型', '缓存策略', '限流熔断', '日志监控'],
  },
  component: {
    keywords: ['组件', 'Component', '复用', '封装', '库'],
    criticalQuestions: [
      '组件的使用场景是什么？',
      '需要支持哪些配置项？',
      '是否需要主题定制？',
      '兼容性要求？',
    ],
    techConsiderations: ['Props设计', '事件设计', '样式方案', '文档生成'],
  },
  project: {
    keywords: ['项目', '系统', '平台', '应用', '初始化'],
    criticalQuestions: [
      '项目的核心功能模块有哪些？',
      '技术栈偏好是什么？',
      '是否需要用户系统？',
      '部署环境要求？',
    ],
    techConsiderations: ['架构设计', '模块划分', '技术选型', 'CI/CD'],
  },
};

/**
 * 需求澄清 Skill
 * 
 * 职责：
 * 1. 分析初始需求，识别项目类型
 * 2. 提取关键词和关键概念
 * 3. 识别模糊点和缺失信息
 * 4. 生成专业的澄清问题列表
 */
export class DemandClarifySkill extends BaseSkill {
  readonly meta = {
    name: 'demand-clarify',
    description: '分析需求关键点，生成专业澄清问题',
    category: 'analyze' as const,
    version: '1.0.0',
    tags: ['demand', 'clarify', 'analysis', 'questions', 'interactive'],
  };

  private storage: FileStorage;

  constructor() {
    super();
    this.storage = new FileStorage();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { params } = input.task;
    const { 
      initialDemand,
      projectType: providedType,
      collectedAnswers,
    } = params as {
      initialDemand?: string;
      projectType?: string;
      collectedAnswers?: Record<string, unknown>;
    };

    // 从上下文获取初始需求
    const demand = initialDemand || input.context.writable.initialDemand as string;
    
    if (!demand) {
      return this.fatalError('缺少初始需求，无法进行澄清分析');
    }

    // 如果已有收集的答案，进行下一轮分析
    if (collectedAnswers && Object.keys(collectedAnswers).length > 0) {
      return this.analyzeWithAnswers(demand, collectedAnswers, providedType);
    }

    // 首次分析
    return this.initialAnalysis(demand, providedType);
  }

  /**
   * 首次分析 - 生成初始澄清问题
   */
  private async initialAnalysis(
    demand: string, 
    providedType?: string
  ): Promise<SkillOutput> {
    // 检测项目类型
    const projectType = providedType || this.detectProjectType(demand);
    
    // 获取该类型的分析规则
    const typeRules = PROJECT_TYPE_ANALYSIS[projectType] || PROJECT_TYPE_ANALYSIS.page;
    
    // 提取关键词
    const keywords = this.extractKeywords(demand, typeRules.keywords);
    
    // 识别模糊点
    const ambiguousPoints = this.identifyAmbiguousPoints(demand, projectType);
    
    // 识别缺失信息
    const missingInfo = this.identifyMissingInfo(demand, projectType, typeRules);
    
    // 生成澄清问题
    const questions = this.generateQuestions(
      demand, 
      projectType, 
      ambiguousPoints, 
      missingInfo,
      typeRules
    );

    const analysis: DemandAnalysis = {
      originalDemand: demand,
      projectType,
      detectedKeywords: keywords,
      ambiguousPoints,
      missingInfo,
      technicalConsiderations: typeRules.techConsiderations,
      questions,
    };

    logger.info('Demand clarification analysis completed', {
      projectType,
      keywordsCount: keywords.length,
      questionsCount: questions.length,
    });

    // 返回需要用户输入的澄清问题
    return this.needInput({
      analysis,
      currentQuestion: questions[0],
      questionIndex: 0,
      totalQuestions: questions.length,
      clarifyingProgress: {
        answered: 0,
        total: questions.length,
        criticalAnswered: 0,
        criticalTotal: questions.filter(q => q.priority === 'critical').length,
      },
    }, `需求澄清：请回答以下问题以帮助我更好地理解您的需求`);
  }

  /**
   * 带答案分析 - 继续下一轮澄清
   */
  private async analyzeWithAnswers(
    demand: string,
    answers: Record<string, unknown>,
    providedType?: string
  ): Promise<SkillOutput> {
    const projectType = providedType || this.detectProjectType(demand);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _typeRules = PROJECT_TYPE_ANALYSIS[projectType] || PROJECT_TYPE_ANALYSIS.page;
    
    // 根据已有答案，生成后续问题
    const followUpQuestions = this.generateFollowUpQuestions(demand, answers, projectType);
    
    if (followUpQuestions.length === 0) {
      // 澄清完成，进入下一阶段
      return this.success({
        clarified: true,
        originalDemand: demand,
        projectType,
        answers,
        nextStage: 'demand-analysis',
      }, '需求澄清完成，已收集关键信息');
    }

    // 还有问题需要澄清
    return this.needInput({
      analysis: {
        originalDemand: demand,
        projectType,
        questions: followUpQuestions,
      },
      currentQuestion: followUpQuestions[0],
      questionIndex: 0,
      totalQuestions: followUpQuestions.length,
      previousAnswers: answers,
      clarifyingProgress: {
        answered: Object.keys(answers).length,
        total: Object.keys(answers).length + followUpQuestions.length,
        criticalAnswered: this.countCriticalAnswered(answers),
        criticalTotal: followUpQuestions.filter(q => q.priority === 'critical').length + this.countCriticalAnswered(answers),
      },
    }, `需求澄清：还有一些问题需要确认`);
  }

  /**
   * 检测项目类型
   */
  private detectProjectType(demand: string): string {
    const lower = demand.toLowerCase();
    
    for (const [type, rules] of Object.entries(PROJECT_TYPE_ANALYSIS)) {
      const matchCount = rules.keywords.filter(kw => 
        lower.includes(kw.toLowerCase())
      ).length;
      
      if (matchCount >= 2) {
        return type;
      }
    }
    
    // 默认根据关键词判断
    if (lower.includes('画布') || lower.includes('画板') || lower.includes('编辑器')) {
      return 'page';
    }
    if (lower.includes('接口') || lower.includes('api') || lower.includes('服务')) {
      return 'api';
    }
    if (lower.includes('组件') || lower.includes('component')) {
      return 'component';
    }
    
    return 'page';
  }

  /**
   * 提取关键词
   */
  private extractKeywords(demand: string, typeKeywords: string[]): string[] {
    const keywords: string[] = [];
    const lower = demand.toLowerCase();
    
    // 提取类型相关关键词
    for (const kw of typeKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        keywords.push(kw);
      }
    }
    
    // 提取技术关键词
    const techKeywords = [
      'react', 'vue', 'angular', 'node', 'python', 'typescript', 'javascript',
      'canvas', 'webgl', 'svg', 'html', 'css', 'websocket', 'rest', 'graphql',
      'mysql', 'mongodb', 'redis', 'docker', 'k8s',
    ];
    
    for (const kw of techKeywords) {
      if (lower.includes(kw)) {
        keywords.push(kw);
      }
    }
    
    return [...new Set(keywords)];
  }

  /**
   * 识别模糊点
   */
  private identifyAmbiguousPoints(demand: string, projectType: string): string[] {
    const points: string[] = [];
    
    // 模糊词检测
    const vagueTerms = [
      { term: '类似', issue: '未明确具体参考对象' },
      { term: '简单', issue: '"简单"的定义不明确' },
      { term: '好看', issue: '审美标准不明确' },
      { term: '快速', issue: '性能指标不明确' },
      { term: '方便', issue: '易用性标准不明确' },
      { term: '一些', issue: '数量不明确' },
      { term: '大概', issue: '规格不明确' },
      { term: '等功能', issue: '具体功能列表不完整' },
    ];
    
    for (const { term, issue } of vagueTerms) {
      if (demand.includes(term)) {
        points.push(`"${term}" - ${issue}`);
      }
    }
    
    // 项目类型特定的模糊点
    if (projectType === 'page' && !demand.includes('响应式') && !demand.includes('移动端')) {
      points.push('未明确是否需要响应式设计或移动端适配');
    }
    
    if (demand.includes('画布') || demand.includes('画板')) {
      if (!demand.includes('绘图') && !demand.includes('生成') && !demand.includes('协作')) {
        points.push('画布用途不明确：是用于绘图、AI生成、还是协作白板？');
      }
    }
    
    return points;
  }

  /**
   * 识别缺失信息
   */
  private identifyMissingInfo(
    demand: string,
    _projectType: string,
    _typeRules: typeof PROJECT_TYPE_ANALYSIS.page
  ): string[] {
    const missing: string[] = [];
    const lower = demand.toLowerCase();
    
    // 通用缺失信息检测
    if (!lower.includes('用户') && !lower.includes('谁用')) {
      missing.push('目标用户群体');
    }
    
    if (!lower.includes('数据') && !lower.includes('存储') && !lower.includes('保存')) {
      missing.push('数据存储和处理方式');
    }
    
    // 类型特定缺失
    switch (_projectType) {
      case 'page':
        if (!lower.includes('交互') && !lower.includes('操作')) {
          missing.push('主要交互方式');
        }
        break;
      case 'api':
        if (!lower.includes('认证') && !lower.includes('授权') && !lower.includes('登录')) {
          missing.push('认证授权需求');
        }
        break;
      case 'component':
        if (!lower.includes('props') && !lower.includes('参数') && !lower.includes('配置')) {
          missing.push('组件配置项和参数');
        }
        break;
      case 'project':
        if (!lower.includes('模块') && !lower.includes('功能')) {
          missing.push('功能模块划分');
        }
        break;
    }
    
    return missing;
  }

  /**
   * 生成澄清问题
   */
  private generateQuestions(
    demand: string,
    projectType: string,
    ambiguousPoints: string[],
    missingInfo: string[],
    typeRules: typeof PROJECT_TYPE_ANALYSIS.page
  ): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    let questionId = 1;

    // 针对模糊点生成问题
    for (const point of ambiguousPoints) {
      questions.push(this.createQuestionFromAmbiguity(point, questionId++));
    }

    // 针对缺失信息生成问题
    for (const info of missingInfo) {
      questions.push(this.createQuestionFromMissing(info, questionId++));
    }

    // 添加类型特定的关键问题
    for (const criticalQ of typeRules.criticalQuestions) {
      questions.push({
        id: `q_${questionId++}`,
        category: 'core',
        priority: 'critical',
        question: criticalQ,
        why: '这是该类项目的关键决策点，直接影响技术方案',
      });
    }

    // 特殊场景问题
    const specialQuestions = this.generateSpecialQuestions(demand, projectType);
    questions.push(...specialQuestions.map((q, i) => ({
      ...q,
      id: `q_${questionId + i}`,
    })));

    // 按优先级排序
    return questions.sort((a, b) => {
      const priorityOrder = { critical: 0, important: 1, optional: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 从模糊点创建问题
   */
  private createQuestionFromAmbiguity(point: string, id: number): ClarificationQuestion {
    // 根据模糊点内容生成具体问题
    if (point.includes('画布用途')) {
      return {
        id: `q_${id}`,
        category: 'core',
        priority: 'critical',
        question: '这个画布/画板的主要用途是什么？',
        why: '用途决定核心功能设计：绘图工具需要画笔/颜色，AI生成需要提示词输入，协作白板需要多人同步',
        options: [
          '自由绘画（画笔、涂鸦、插图）',
          'AI 图片生成（输入提示词生成）',
          '协作白板（多人实时协作）',
          '思维导图/流程图',
          '其他用途',
        ],
      };
    }
    
    if (point.includes('响应式')) {
      return {
        id: `q_${id}`,
        category: 'ux',
        priority: 'important',
        question: '是否需要支持移动端或响应式设计？',
        why: '影响UI设计和布局方案',
        options: ['仅桌面端', '需要响应式', '移动端优先'],
      };
    }

    // 通用模糊点问题
    return {
      id: `q_${id}`,
      category: 'business',
      priority: 'important',
      question: `关于"${point.split(' - ')[0]}"，能否提供更具体的说明？`,
      why: point.split(' - ')[1] || '需要更明确的定义以避免理解偏差',
    };
  }

  /**
   * 从缺失信息创建问题
   */
  private createQuestionFromMissing(info: string, id: number): ClarificationQuestion {
    const questionMap: Record<string, ClarificationQuestion> = {
      '目标用户群体': {
        id: `q_${id}`,
        category: 'business',
        priority: 'critical',
        question: '这个产品主要面向什么类型的用户？',
        why: '用户群体影响交互设计、UI风格和功能优先级',
        options: ['普通消费者', '企业用户', '专业用户', '开发者', '不确定/所有用户'],
      },
      '数据存储和处理方式': {
        id: `q_${id}`,
        category: 'tech',
        priority: 'important',
        question: '用户创建的内容需要保存吗？如何保存？',
        why: '决定是否需要后端服务、数据库和用户系统',
        options: ['仅本地存储', '需要云端存储', '需要用户账户系统', '不需要保存'],
      },
      '主要交互方式': {
        id: `q_${id}`,
        category: 'ux',
        priority: 'critical',
        question: '用户主要通过什么方式与界面交互？',
        why: '影响交互设计和事件处理',
        options: ['鼠标操作', '触屏操作', '键盘快捷键', '语音/手势'],
      },
      '认证授权需求': {
        id: `q_${id}`,
        category: 'tech',
        priority: 'important',
        question: 'API需要用户认证吗？',
        why: '决定是否需要实现登录、Token管理等',
        options: ['公开API，无需认证', '需要简单的API Key', '需要用户登录系统'],
      },
      '组件配置项和参数': {
        id: `q_${id}`,
        category: 'core',
        priority: 'critical',
        question: '组件需要支持哪些可配置项？',
        why: '决定组件的灵活性和复用范围',
      },
      '功能模块划分': {
        id: `q_${id}`,
        category: 'core',
        priority: 'critical',
        question: '项目包含哪些主要功能模块？',
        why: '影响项目架构和开发计划',
      },
    };

    return questionMap[info] || {
      id: `q_${id}`,
      category: 'core',
      priority: 'important',
      question: `关于"${info}"，具体需求是什么？`,
      why: '这是重要的需求信息，需要明确',
    };
  }

  /**
   * 生成特殊场景问题
   */
  private generateSpecialQuestions(demand: string, _projectType: string): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    const lower = demand.toLowerCase();

    // 画布/画板特殊问题
    if (lower.includes('画布') || lower.includes('画板') || lower.includes('canvas')) {
      questions.push(
        {
          id: '',
          category: 'tech',
          priority: 'important',
          question: '画布是否需要支持无限滚动/缩放？',
          why: '影响画布实现方案（Canvas vs DOM）',
          options: ['固定大小', '可缩放但有限', '无限画布'],
        },
        {
          id: '',
          category: 'tech',
          priority: 'important',
          question: '是否需要撤销/重做功能？',
          why: '需要实现操作历史栈',
          options: ['需要', '不需要', '仅简单撤销'],
        }
      );
    }

    // 编辑器相关
    if (lower.includes('编辑器') || lower.includes('editor')) {
      questions.push({
        id: '',
        category: 'core',
        priority: 'critical',
        question: '编辑器主要编辑什么类型的内容？',
        why: '决定编辑器核心实现',
        options: ['富文本', '代码', '图片', '表格', '混合内容'],
      });
    }

    return questions;
  }

  /**
   * 生成后续问题
   */
  private generateFollowUpQuestions(
    demand: string,
    answers: Record<string, unknown>,
    _projectType: string
  ): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];

    // 根据答案生成深入问题
    // 例如：如果选择了"自由绘画"，追问绘画工具细节
    for (const [_questionId, answer] of Object.entries(answers)) {
      const answerStr = String(answer).toLowerCase();
      
      if (answerStr.includes('绘画') || answerStr.includes('画笔')) {
        questions.push({
          id: 'follow_brush',
          category: 'core',
          priority: 'important',
          question: '绘画工具需要支持哪些功能？',
          why: '决定绘画核心功能实现',
          options: [
            '基础画笔/橡皮',
            '多种笔刷效果',
            '图层支持',
            '压感支持',
            '颜色选择器',
          ],
        });
      }
      
      if (answerStr.includes('ai') || answerStr.includes('生成')) {
        questions.push({
          id: 'follow_ai',
          category: 'core',
          priority: 'critical',
          question: 'AI图片生成使用哪个服务？',
          why: '决定API集成方案',
          options: ['OpenAI DALL-E', 'Stable Diffusion', 'Midjourney', '自建服务', '待定'],
        });
      }
      
      if (answerStr.includes('协作')) {
        questions.push({
          id: 'follow_collab',
          category: 'tech',
          priority: 'critical',
          question: '实时协作需要支持多少人同时在线？',
          why: '影响WebSocket架构设计',
          options: ['2-5人', '5-20人', '20-100人', '不限'],
        });
      }
    }

    return questions;
  }

  /**
   * 统计已回答的关键问题数量
   */
  private countCriticalAnswered(answers: Record<string, unknown>): number {
    // 简化实现，实际可以根据问题ID判断
    return Object.keys(answers).length;
  }
}

// 导出实例
export default new DemandClarifySkill();
