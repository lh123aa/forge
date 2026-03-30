// Smart Code Agent 插件主类

import { v4 as uuidv4 } from 'uuid';
import { FileStorage } from './storage/index.js';
import { Logger } from './utils/logger.js';
import { SkillRegistry } from './skill-engine/registry.js';
import { SkillExecutor } from './skill-engine/executor.js';
import { SkillComposer } from './skill-engine/composer.js';
import { WorkflowExecutor } from './skill-engine/workflow-executor.js';
import { WorkflowStateManager } from './skill-engine/state.js';
import { KnowledgeBase } from './knowledge/base.js';
import { ObserverRecorder } from './observer/recorder.js';
import { ObserverReporter } from './observer/reporter.js';
import { UserModificationRecorder } from './observer/user-modifications.js';
import { LLMBridge } from './mcp/llm-bridge.js';

// 导入所有原子 Skills（实例）
import askQuestionSkill from './skills/atoms/ask/question.js';
import askClarifySkill from './skills/atoms/ask/clarify.js';
import askConfirmSkill from './skills/atoms/ask/confirm.js';
import readFileSkill from './skills/atoms/io/read-file.js';
import writeFileSkill from './skills/atoms/io/write-file.js';
import listDirSkill from './skills/atoms/io/list-dir.js';
import analyzeDemandSkill from './skills/atoms/analyze/demand.js';
import generateCodeSkill from './skills/atoms/generate/code.js';
import generateInterfaceSkill from './skills/atoms/generate/interface.js';
import generateTestSkill from './skills/atoms/generate/test.js';
import errorFixSkill from './skills/atoms/generate/error-fix.js';
import unitTestSkill from './skills/atoms/generate/unit-test.js';
import integrationTestSkill from './skills/atoms/generate/integration-test.js';
import acceptanceTestSkill from './skills/atoms/generate/acceptance-test.js';
import testResultAnalyzerSkill from './skills/atoms/generate/test-result-analyzer.js';
import lintSkill from './skills/atoms/generate/lint.js';
import typeCheckSkill from './skills/atoms/generate/type-check.js';
import buildCheckSkill from './skills/atoms/generate/build-check.js';
import formatCodeSkill from './skills/atoms/format/code.js';
import codeFormatSkill from './skills/atoms/format/code-standardize.js';
import prettierFormatSkill from './skills/atoms/format/prettier-format.js';
import fileIOSkill from './skills/atoms/io/file-io.js';
import observeRecordSkill from './skills/atoms/observe/record.js';
import observeReportSkill from './skills/atoms/observe/report.js';
import waitSkill from './skills/atoms/utility/wait.js';
import retrySkill from './skills/atoms/utility/retry.js';
import branchSkill from './skills/atoms/utility/branch.js';
import parallelSkill from './skills/atoms/utility/parallel.js';
import mockServerSkill from './skills/atoms/utility/mock-server.js';
import versionManagerSkill from './skills/atoms/utility/version-manager.js';
import deploySkill from './skills/atoms/utility/deploy.js';

// 导入组合 Skills（实例）
import demandCollectSkill from './skills/workflows/demand-collect.js';
import demandAnalysisSkill from './skills/workflows/demand-analysis.js';
import demandConfirmSkill from './skills/workflows/demand-confirm.js';
import smartAnalysisSkill from './skills/workflows/smart-analysis.js';

// 导入新增的组合 Skills
import demandClarifySkill from './skills/workflows/demand-clarify.js';
import taskDecomposeSkill from './skills/workflows/task-decompose.js';
import taskPlanSkill from './skills/workflows/task-plan.js';
import taskConfirmSkill from './skills/workflows/task-confirm.js';

// 导入测试相关 Skills
import testOrchestratorSkill from './skills/workflows/test-orchestrator.js';
import testPlanSkill from './skills/workflows/test-plan.js';
import testConfirmSkill from './skills/workflows/test-confirm.js';
import qualityScorerSkill from './skills/workflows/quality-scorer.js';
import testFixLoopSkill from './skills/workflows/test-fix-loop.js';

// 导入团队协作相关 Skills
import taskAssignSkill from './skills/workflows/task-assign.js';
import codeReviewSkill from './skills/workflows/code-review.js';

// 导入工作流
import { 
  transparentDevelopmentWorkflow, 
  demandOnlyWorkflow,
  taskPlanningWorkflow,
  fullDemandAnalysisWorkflow, 
  demandCollectionWorkflow 
} from './skill-engine/workflows/development.js';
import { fullCodeGenerationWorkflow, testDrivenDevelopmentWorkflow } from './skill-engine/workflows/code-gen.js';

// 导入自我迭代引擎
import { SelfIterationEngine } from './core/self-iteration/index.js';
import { SkillSource } from './core/types.js';

import type { 
  StartParams, 
  RunResult, 
  UserFeedback,
  SkillInput,
  Workflow,
  ProgressCallbackArgs,
} from './types/index.js';

const logger = new Logger('SmartCodeAgent');

/**
 * Smart Code Agent 插件主类
 */
export class SmartCodeAgent {
  // 核心组件
  private storage: FileStorage;
  private skillRegistry: SkillRegistry;
  private skillExecutor: SkillExecutor;
  private skillComposer: SkillComposer;
  private workflowExecutor: WorkflowExecutor;
  private workflowStateManager: WorkflowStateManager;
  
  // 功能模块
  private knowledgeBase: KnowledgeBase;
  private observerRecorder: ObserverRecorder;
  private observerReporter: ObserverReporter;
  private userModificationRecorder: UserModificationRecorder;
  private llmBridge: LLMBridge;
  private selfIterationEngine: SelfIterationEngine;

  // 工作流注册表
  private workflows: Map<string, Workflow> = new Map();

  // 状态
  private initialized: boolean = false;

  // 进度回调
  private progressCallback?: (args: ProgressCallbackArgs) => void;

  constructor() {
    // 初始化存储
    this.storage = new FileStorage();

    // 初始化 Skill 引擎
    this.skillRegistry = new SkillRegistry();
    this.skillExecutor = new SkillExecutor(this.skillRegistry);
    this.skillComposer = new SkillComposer(this.skillRegistry);
    this.workflowStateManager = new WorkflowStateManager(this.storage);
    
    // 初始化工作流执行器（带自我迭代回调）
    this.workflowExecutor = new WorkflowExecutor(
      this.skillRegistry,
      this.skillExecutor,
      { 
        stateManager: this.workflowStateManager,
        onWorkflowComplete: async (result, execution) => {
          // 记录工作流完成日志用于自我迭代分析
          // 注意：详细步骤日志由各 Skill 执行时自行记录
          await this.selfIterationEngine.logExecution({
            traceId: execution.traceId,
            workflowName: execution.workflowName,
            stepName: execution.workflowName, // 记录工作流级别
            skillName: execution.workflowName,
            source: SkillSource.AIOS,
            duration: execution.endTime ? execution.endTime - execution.startTime : 0,
            success: result.code === 200,
            retryCount: 0,
            error: result.code !== 200 ? result.message : undefined,
          });
          
          // 检查是否应该自动优化
          if (this.selfIterationEngine.shouldAutoOptimize()) {
            logger.info('Triggering auto-optimization via self-iteration engine');
            await this.selfIterationEngine.optimize('auto');
          }
        },
      }
    );

    // 初始化功能模块
    this.knowledgeBase = new KnowledgeBase(this.storage);
    this.observerRecorder = new ObserverRecorder(this.storage);
    this.observerReporter = new ObserverReporter(this.storage);
    this.userModificationRecorder = new UserModificationRecorder(this.storage);
    this.llmBridge = new LLMBridge();
    this.selfIterationEngine = new SelfIterationEngine();

    // 注册工作流
    this.registerWorkflows();
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback: (args: ProgressCallbackArgs) => void): void {
    this.progressCallback = callback;
    // 重新创建工作流执行器，带进度回调
    this.workflowExecutor = new WorkflowExecutor(
      this.skillRegistry,
      this.skillExecutor,
      { 
        stateManager: this.workflowStateManager,
        onProgress: callback,
        onWorkflowComplete: async (result, execution) => {
          // 记录工作流完成日志用于自我迭代分析
          await this.selfIterationEngine.logExecution({
            traceId: execution.traceId,
            workflowName: execution.workflowName,
            stepName: execution.workflowName,
            skillName: execution.workflowName,
            source: SkillSource.AIOS,
            duration: execution.endTime ? execution.endTime - execution.startTime : 0,
            success: result.code === 200,
            retryCount: 0,
            error: result.code !== 200 ? result.message : undefined,
          });
          
          // 检查是否应该自动优化
          if (this.selfIterationEngine.shouldAutoOptimize()) {
            logger.info('Triggering auto-optimization via self-iteration engine');
            await this.selfIterationEngine.optimize('auto');
          }
        },
      }
    );
  }

  /**
   * 注册内置工作流
   */
  private registerWorkflows(): void {
    const workflows = [
      transparentDevelopmentWorkflow,
      demandOnlyWorkflow,
      taskPlanningWorkflow,
      fullDemandAnalysisWorkflow,
      demandCollectionWorkflow,
      fullCodeGenerationWorkflow,
      testDrivenDevelopmentWorkflow,
    ];

    // 注册到 workflowExecutor（用于 resume 恢复执行）
    workflows.forEach(workflow => {
      this.workflowExecutor.registerWorkflow(workflow);
    });

    // 注册到本地 Map
    workflows.forEach(workflow => {
      this.workflows.set(workflow.name, workflow);
    });
  }

  /**
   * 初始化插件
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('SmartCodeAgent already initialized');
      return;
    }

    logger.info('Initializing SmartCodeAgent...');
    
    // 加载内置 Skills
    await this.loadBuiltinSkills();

    this.initialized = true;
    logger.info('SmartCodeAgent initialized successfully');
  }

  /**
   * 加载内置 Skills
   */
  private async loadBuiltinSkills(): Promise<void> {
    // 注册原子 Skills（使用导入的实例）
    const atomicSkills = [
      // Ask 类
      askQuestionSkill,
      askClarifySkill,
      askConfirmSkill,
      
      // IO 类
      readFileSkill,
      writeFileSkill,
      listDirSkill,
      
      // Analyze 类
      analyzeDemandSkill,
      
      // Generate 类
      generateCodeSkill,
      generateInterfaceSkill,
      generateTestSkill,
      errorFixSkill,
      unitTestSkill,
      integrationTestSkill,
      acceptanceTestSkill,
      testResultAnalyzerSkill,
      lintSkill,
      typeCheckSkill,
      buildCheckSkill,
      
      // Format 类
      formatCodeSkill,
      codeFormatSkill,
      prettierFormatSkill,
      
      // Observe 类
      observeRecordSkill,
      observeReportSkill,
      
      // Utility 类
      waitSkill,
      retrySkill,
      branchSkill,
      parallelSkill,
      mockServerSkill,
      versionManagerSkill,
      deploySkill,
    ];

    // 注册组合 Skills（使用导入的实例）
    const workflowSkills = [
      // 原有组合 Skills
      demandCollectSkill,
      demandAnalysisSkill,
      demandConfirmSkill,
      smartAnalysisSkill,
      
      // 新增组合 Skills
      demandClarifySkill,
      taskDecomposeSkill,
      taskPlanSkill,
      taskConfirmSkill,
      
      // 测试相关 Skills
      testOrchestratorSkill,
      testPlanSkill,
      testConfirmSkill,
      qualityScorerSkill,
      testFixLoopSkill,
      
      // 团队协作 Skills
      taskAssignSkill,
      codeReviewSkill,
    ];

    // 批量注册
    [...atomicSkills, ...workflowSkills].forEach(skill => {
      this.skillRegistry.register(skill);
    });

    logger.info(`Loaded ${atomicSkills.length + workflowSkills.length} builtin skills`);
  }

  /**
   * 启动开发流程
   */
  async start(params: StartParams): Promise<RunResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const traceId = uuidv4();
    logger.info(`Starting development flow: ${params.projectType}`, { traceId });

    try {
      // 1. 初始化上下文
      const context = this.buildInitialContext(params);

      // 2. 构建 Skill 输入
      const input: SkillInput = {
        config: {},
        context: {
          readOnly: {},
          writable: context,
        },
        task: {
          taskId: uuidv4(),
          taskName: 'start',
          target: params.initialDemand || '',
          params: {
            projectType: params.projectType,
            initialDemand: params.initialDemand,
            projectPath: params.projectPath,
          },
          timeout: 300000,
          maxRetry: 3,
        },
        snapshotPath: `snapshots/${traceId}`,
        traceId,
      };

      // 3. 记录开始
      await this.observerRecorder.startStage(traceId, 'transparent-workflow', [
        'demand-clarify', 'demand-collect', 'demand-analysis', 'demand-confirm',
        'task-decompose', 'task-plan', 'task-confirm', 'code-generation'
      ]);

      // 4. 执行透明开发工作流
      const workflow = this.workflows.get('transparent-development');
      
      if (!workflow) {
        throw new Error('Workflow not found: transparent-development');
      }

      const result = await this.workflowExecutor.execute(workflow, input);

      // 5. 记录结束
      const status = result.code === 200 ? 'success' : result.code === 300 ? 'paused' : 'failed';
      await this.observerRecorder.endStage(traceId, 'transparent-workflow', status, result.data);

      // 6. 创建摘要报告
      const records = await this.observerRecorder.getAllRecords(traceId);
      await this.observerReporter.createSummary(
        traceId,
        params.projectType,
        records,
        []
      );

      // 7. 返回结果
      return {
        traceId,
        status: result.code === 200 ? 'success' : result.code === 300 ? 'partial' : 'failed',
        output: {
          traceId,
          projectType: params.projectType,
          workflowResult: result.data,
          report: await this.observerReporter.generateReport(traceId),
        },
        errors: result.code >= 400 ? [result.message] : undefined,
      };

    } catch (error) {
      logger.error('Development flow failed', { 
        error: error instanceof Error ? error.message : String(error),
        traceId 
      });

      await this.observerRecorder.endStage(traceId, 'transparent-workflow', 'failed', {}, {
        type: 'Error',
        message: error instanceof Error ? error.message : String(error),
      });

      return {
        traceId,
        status: 'failed',
        output: {},
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * 继续执行（用户输入后）
   */
  async continue(traceId: string, userInput: Record<string, unknown>): Promise<RunResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.info('Continuing workflow', { traceId, userInputProvided: !!userInput });

    const result = await this.workflowExecutor.continue(traceId, userInput);

    return {
      traceId,
      status: result.code === 200 ? 'success' : 'failed',
      output: result.data,
      errors: result.code !== 200 ? [result.message] : undefined,
    };
  }

  /**
   * 恢复中断的流程
   * @param traceId 追踪 ID
   * @param userResponse 用户响应（confirm/调整/重新澄清）
   * @param userResponse 通用用户响应（confirm/adjust/reclarify等）
   * @param answer 答案（用于测试确认等场景）
   * @param adjustmentNotes 调整说明
   */
  async resume(traceId: string, userResponse?: string, answer?: string, adjustmentNotes?: string): Promise<RunResult> {
    // 构建用户输入
    const userInput: Record<string, unknown> = {};
    if (userResponse) {
      userInput.userResponse = userResponse;
    }
    if (answer) {
      userInput.answer = answer;
    }
    if (adjustmentNotes) {
      userInput.adjustmentNotes = adjustmentNotes;
    }

    const execution = await this.workflowStateManager.load(traceId);
    
    if (!execution) {
      return {
        traceId,
        status: 'failed',
        output: {},
        errors: ['No saved execution found'],
      };
    }

    // 如果有用户输入，先继续执行（传递用户响应）
    let result;
    if (Object.keys(userInput).length > 0) {
      result = await this.workflowExecutor.continue(traceId, userInput);
      // continue 成功后，需要再次 resume 继续执行
      if (result.code === 200) {
        result = await this.workflowExecutor.resume(traceId);
      }
    } else {
      result = await this.workflowExecutor.resume(traceId);
    }

    return {
      traceId,
      status: result.code === 200 ? 'success' : result.code === 300 ? 'partial' : 'failed',
      output: result.data,
      errors: result.code >= 400 ? [result.message] : undefined,
    };
  }

  /**
   * 获取观察者报告
   */
  async getReport(traceId?: string): Promise<string> {
    if (traceId) {
      return this.observerReporter.generateReport(traceId);
    }

    // 返回最近运行的报告
    const executions = await this.workflowStateManager.list();
    if (executions.length === 0) {
      return '# 观察者报告\n\n暂无运行记录';
    }

    return this.observerReporter.generateReport(executions[0].traceId);
  }

  /**
   * 提交用户反馈
   */
  async submitFeedback(traceId: string, feedback: UserFeedback): Promise<void> {
    const stage = feedback.stage || 'code';
    await this.userModificationRecorder.record(traceId, {
      projectId: '',
      traceId,
      stage: stage as 'demand' | 'code' | 'test' | 'delivery',
      modifiedFiles: [],
      modificationType: 'modify',
      userReason: feedback.content,
    });

    logger.info('Feedback submitted', { traceId, type: feedback.type });
  }

  /**
   * 注册 Skill
   */
  registerSkill(skill: unknown): void {
    this.skillRegistry.register(skill as any);
  }

  /**
   * 设置 MCP 客户端
   */
  setMCPClient(client: unknown): void {
    this.llmBridge.setMCPClient(client as any);
    logger.info('MCP client configured');
  }

  /**
   * 获取可用工作流列表
   */
  listWorkflows(): Array<{ name: string; description: string }> {
    return Array.from(this.workflows.entries()).map(([name, workflow]) => ({
      name,
      description: workflow.description,
    }));
  }

  /**
   * 执行指定工作流
   */
  async runWorkflow(workflowName: string, params: StartParams): Promise<RunResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      return {
        traceId: uuidv4(),
        status: 'failed',
        output: {},
        errors: [`Workflow not found: ${workflowName}`],
      };
    }

    const traceId = uuidv4();
    const input: SkillInput = {
      config: {},
      context: {
        readOnly: {},
        writable: this.buildInitialContext(params),
      },
      task: {
        taskId: uuidv4(),
        taskName: workflowName,
        target: params.initialDemand || '',
        params: {
          projectType: params.projectType,
          initialDemand: params.initialDemand,
          projectPath: params.projectPath,
        },
        timeout: 300000,
        maxRetry: 3,
      },
      snapshotPath: `snapshots/${traceId}`,
      traceId,
    };

    const result = await this.workflowExecutor.execute(workflow, input);

    return {
      traceId,
      status: result.code === 200 ? 'success' : result.code === 300 ? 'partial' : 'failed',
      output: result.data,
      errors: result.code >= 400 ? [result.message] : undefined,
    };
  }

  /**
   * 构建初始上下文
   */
  private buildInitialContext(params: StartParams): Record<string, unknown> {
    return {
      projectType: params.projectType,
      initialDemand: params.initialDemand,
      projectPath: params.projectPath || process.cwd(),
      startTime: Date.now(),
    };
  }

  /**
   * 提示用户反馈（占位符方法）
   */
  private async promptFeedback(traceId: string): Promise<void> {
    logger.debug('Feedback prompt called', { traceId });
    // 用户反馈通过 Observer 模块的 userFeedback skill 收集
  }
}

export default SmartCodeAgent;