// 工作流执行器 - 按步骤执行工作流，支持进度回调

import { createLogger } from '../utils/logger.js';
import type { SkillInput, SkillOutput, Workflow, WorkflowExecution } from '../types/index.js';
import { SkillRegistry } from './registry.js';
import { SkillExecutor } from './executor.js';
import { WorkflowParser } from './parser.js';
import { WorkflowStateManager } from './state.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { QualityGate, type GateCheckpoint, type GateSummary } from './quality-gate.js';
import { workflowObserver } from '../observer/workflow-observer.js';

const logger = createLogger('WorkflowExecutor');

/**
 * 进度回调参数
 */
export interface ProgressCallbackArgs {
  /** 当前步骤名称 */
  stepName: string;
  /** 步骤索引 */
  stepIndex: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 步骤状态 */
  status: 'started' | 'success' | 'failed' | 'paused';
  /** 步骤输出 */
  output?: SkillOutput;
  /** 执行消息 */
  message?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 工作流执行器选项
 */
export interface WorkflowExecutorOptions {
  /** 默认超时时间 */
  defaultTimeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 自动保存状态 */
  autoSaveState?: boolean;
  /** 状态管理器 */
  stateManager?: WorkflowStateManager;
  /** 进度回调 */
  onProgress?: (args: ProgressCallbackArgs) => void;
  /** 工作流完成回调 */
  onWorkflowComplete?: (result: SkillOutput, execution: WorkflowExecution) => void;
  /** 启用质量门禁 */
  enableQualityGate?: boolean;
  /** 质量门禁检查点 */
  gateCheckpoints?: GateCheckpoint[];
}

/**
 * 默认选项
 */
const defaultOptions = {
  defaultTimeout: 60000,
  maxRetries: 3,
  autoSaveState: true,
};

/**
 * 工作流执行器
 */
export class WorkflowExecutor {
  private registry: SkillRegistry;
  private executor: SkillExecutor;
  private parser: WorkflowParser;
  private stateManager: WorkflowStateManager;
  private options: WorkflowExecutorOptions;
  // 保存工作流定义，用于 resume 时恢复执行
  private workflows: Map<string, Workflow> = new Map();
  // 质量门禁
  private qualityGate: QualityGate | null = null;

  constructor(
    registry: SkillRegistry,
    executor: SkillExecutor,
    options?: WorkflowExecutorOptions
  ) {
    this.registry = registry;
    this.executor = executor;
    this.parser = new WorkflowParser();
    this.options = { ...defaultOptions, ...options };
    this.stateManager = options?.stateManager || new WorkflowStateManager();
    
    // 初始化质量门禁
    if (this.options.enableQualityGate) {
      this.qualityGate = new QualityGate(registry, executor);
      // 添加自定义检查点
      if (this.options.gateCheckpoints) {
        for (const checkpoint of this.options.gateCheckpoints) {
          this.qualityGate.addCheckpoint(checkpoint);
        }
      }
      logger.info('Quality gate enabled');
    }
  }

  /**
   * 注册工作流
   */
  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.name, workflow);
  }

  /**
   * 执行工作流
   */
  async execute(
    workflow: Workflow,
    input: SkillInput
  ): Promise<SkillOutput> {
    // 注册工作流
    this.registerWorkflow(workflow);

    const execution: WorkflowExecution = {
      workflowName: workflow.name,
      traceId: input.traceId,
      currentStep: workflow.initialStep,
      status: 'running',
      context: {},
      startTime: Date.now(),
      stepsExecuted: [],
    };

    logger.info(`Starting workflow: ${workflow.name}`, { traceId: input.traceId });

    // 通知可视化观察者 - 工作流开始
    const stepNames = workflow.steps.map(s => s.skill);
    workflowObserver.startWorkflow(input.traceId, workflow.name, stepNames);

    try {
      // 验证工作流
      const validation = this.parser.validate(workflow);
      if (!validation.valid) {
        throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
      }

      // 初始化上下文
      let currentInput = this.buildInitialInput(workflow, input);

      // 执行步骤
      let currentStepName: string | null = workflow.initialStep;
      let stepIndex = 0;
      const totalSteps = workflow.steps.length;

      while (currentStepName) {
        const step = workflow.steps.find(s => s.skill === currentStepName);
        if (!step) {
          throw new Error(`Step "${currentStepName}" not found`);
        }

        execution.currentStep = currentStepName;

        // 触发进度回调 - 步骤开始
        this.notifyProgress({
          stepName: currentStepName,
          stepIndex,
          totalSteps,
          status: 'started',
          message: `开始执行: ${currentStepName}`,
          timestamp: Date.now(),
        });

        // 通知可视化观察者 - 步骤开始
        workflowObserver.stepStarted(input.traceId, stepIndex, currentStepName);

        logger.debug(`Executing workflow step: ${currentStepName}`);

        try {
          // 构建步骤输入
          const stepParams = step.params || {};
          const stepInput = this.buildStepInput(currentInput, stepParams);

          // 执行 Skill
          const result = await this.executor.execute(step.skill, stepInput, {
            timeout: this.options.defaultTimeout,
            maxRetries: step.retry,
          });

          execution.stepsExecuted.push(currentStepName);

          // 质量门禁检查（仅在 skill 成功时检查）
          if (this.qualityGate && result.code === 200) {
            const gateResult = await this.qualityGate.check(currentStepName, result, stepInput);
            if (!gateResult.passed) {
              logger.warn(`Quality gate failed at step: ${currentStepName}`, {
                traceId: input.traceId,
                failedChecks: gateResult.failedChecks,
              });
              
              // 触发进度回调 - 门禁失败
              this.notifyProgress({
                stepName: currentStepName,
                stepIndex,
                totalSteps,
                status: 'failed',
                output: result,
                message: `质量门禁未通过: ${gateResult.failedChecks.map(c => c.name).join(', ')}`,
                timestamp: Date.now(),
              });
              
              // 门禁失败，停止工作流或执行失败分支
              if (step.onFail) {
                currentStepName = step.onFail;
              } else {
                return {
                  code: 400,
                  data: {
                    execution,
                    gateResult,
                  },
                  message: `质量门禁未通过: ${gateResult.failedChecks.map(c => c.name).join(', ')}`,
                };
              }
              
              stepIndex++;
              continue;
            }
          }

          // 处理结果
          if (result.code === 200) {
            // 保存当前步骤名称用于通知
            const completedStepName = currentStepName;
            // 成功，流转到下一步
            currentStepName = step.onSuccess ?? null;
            
            // 更新上下文
            if (result.data) {
              currentInput = this.mergeContext(currentInput, result.data);
            }

            // 触发进度回调 - 步骤成功
            this.notifyProgress({
              stepName: currentStepName || 'completed',
              stepIndex,
              totalSteps,
              status: 'success',
              output: result,
              message: result.message,
              timestamp: Date.now(),
            });

            // 通知可视化观察者 - 步骤完成
            if (completedStepName) {
              workflowObserver.stepCompleted(input.traceId, stepIndex, completedStepName, result.data as Record<string, unknown>);
            }

          } else if (result.code === 300) {
            // 需要用户交互，暂停
            execution.status = 'paused';
            await this.saveState(execution);
            
            // 触发进度回调 - 步骤暂停
            this.notifyProgress({
              stepName: currentStepName,
              stepIndex,
              totalSteps,
              status: 'paused',
              output: result,
              message: `等待用户输入: ${result.message}`,
              timestamp: Date.now(),
            });
            
            logger.info(`Workflow paused at step: ${currentStepName}`, { traceId: input.traceId });
            
            return {
              code: 300,
              data: {
                execution,
                result,
                waitForInput: true,
                currentStep: currentStepName,
                inputPrompt: result.data,
              },
              message: `Workflow paused at step "${currentStepName}": ${result.message}`,
            };
          } else if (result.code === 400) {
            // 可重试失败
            logger.warn(`Step "${currentStepName}" failed with retryable error`, {
              message: result.message,
              traceId: input.traceId,
            });

            // 触发进度回调 - 步骤失败
            this.notifyProgress({
              stepName: currentStepName,
              stepIndex,
              totalSteps,
              status: 'failed',
              output: result,
              message: result.message,
              timestamp: Date.now(),
            });

            // 通知可视化观察者 - 步骤失败
            workflowObserver.stepFailed(input.traceId, stepIndex, currentStepName, result.message);
            
            currentStepName = step.onFail ?? null;
          } else {
            // 不可重试失败
            throw new Error(result.message);
          }

          // 保存状态
          if (this.options.autoSaveState) {
            await this.saveState(execution);
          }

          stepIndex++;

        } catch (error) {
          logger.error(`Workflow step "${currentStepName}" threw exception`, {
            error: error instanceof Error ? error.message : String(error),
            traceId: input.traceId,
          });

          // 触发进度回调 - 步骤失败
          this.notifyProgress({
            stepName: currentStepName || 'unknown',
            stepIndex,
            totalSteps,
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });

          // 通知可视化观察者 - 步骤失败
          workflowObserver.stepFailed(
            input.traceId,
            stepIndex,
            currentStepName || 'unknown',
            error instanceof Error ? error.message : String(error)
          );

          // 尝试失败分支
          if (step.onFail) {
            currentStepName = step.onFail;
          } else {
            throw error;
          }
        }
      }

      // 工作流完成
      execution.status = 'success';
      execution.endTime = Date.now();

      // 通知可视化观察者 - 工作流完成
      workflowObserver.completed(input.traceId, workflow.name, true);

      await this.saveState(execution);

      logger.info(`Workflow completed: ${workflow.name}`, {
        traceId: input.traceId,
        duration: execution.endTime - execution.startTime,
      });

      const result: SkillOutput = {
        code: 200,
        data: {
          execution,
          context: currentInput.context,
        },
        message: `Workflow "${workflow.name}" completed successfully`,
      };

      // 触发工作流完成回调
      if (this.options.onWorkflowComplete) {
        try {
          this.options.onWorkflowComplete(result, execution);
        } catch (error) {
          logger.warn('Workflow complete callback error', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return result;

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error instanceof Error ? error.message : String(error);

      // 通知可视化观察者 - 工作流失败
      workflowObserver.completed(input.traceId, workflow.name, false);

      await this.saveState(execution);

      logger.error(`Workflow failed: ${workflow.name}`, {
        error: execution.error,
        traceId: input.traceId,
      });

      return {
        code: 500,
        data: { execution },
        message: `Workflow failed: ${execution.error}`,
      };
    }
  }

  /**
   * 继续执行（提供用户输入后）
   * 将用户输入保存到执行上下文，准备恢复执行
   */
  async continue(
    traceId: string,
    userInput: Record<string, unknown>
  ): Promise<SkillOutput> {
    const execution = await this.stateManager.load(traceId);
    if (!execution) {
      return {
        code: 500,
        data: {},
        message: `No saved execution found for traceId: ${traceId}`,
      };
    }

    if (execution.status !== 'paused') {
      return {
        code: 400,
        data: {},
        message: `Cannot continue execution with status: ${execution.status}`,
      };
    }

    // 将用户输入添加到上下文
    execution.context = {
      ...execution.context,
      ...userInput,
    };
    execution.status = 'running';

    // 保存更新后的状态
    await this.stateManager.save(execution);

    logger.info(`Continuing workflow: ${execution.workflowName}`, { traceId, userInput });

    // 返回确认信息
    return {
      code: 200,
      data: {
        execution,
        userInput,
        message: 'User input saved, ready to resume',
      },
      message: 'User input saved, ready to resume',
    };
  }

  /**
   * 从保存的状态恢复执行
   * 找到当前暂停的步骤，用保存的上下文重新执行
   */
  async resume(traceId: string, _additionalInput?: Partial<SkillInput>): Promise<SkillOutput> {
    const execution = await this.stateManager.load(traceId);
    if (!execution) {
      return {
        code: 500,
        data: {},
        message: `No saved execution found for traceId: ${traceId}`,
      };
    }

    if (execution.status !== 'paused') {
      return {
        code: 400,
        data: {},
        message: `Cannot resume execution with status: ${execution.status}`,
      };
    }

    // 获取工作流定义
    const workflow = this.workflows.get(execution.workflowName);
    if (!workflow) {
      return {
        code: 500,
        data: {},
        message: `Workflow not found: ${execution.workflowName}`,
      };
    }

    // 找到当前暂停的步骤
    const currentStepName = execution.currentStep;
    const step = workflow.steps.find(s => s.skill === currentStepName);
    if (!step) {
      return {
        code: 500,
        data: {},
        message: `Step not found: ${currentStepName}`,
      };
    }

    logger.info(`Resuming workflow step: ${currentStepName}`, { traceId });

    try {
      // 构建步骤输入，将保存的上下文传递给 skill
      const stepInput: SkillInput = {
        config: {},
        context: {
          readOnly: execution.context as SkillInput['context']['readOnly'],
          writable: execution.context as SkillInput['context']['writable'],
        },
        task: {
          taskId: traceId,
          taskName: currentStepName,
          target: currentStepName,
          params: {
            // 合并步骤参数和保存的用户输入
            ...step.params,
            // 用户输入优先
            ...(execution.context.userInput as Record<string, unknown>),
          },
          timeout: this.options.defaultTimeout || 60000,
          maxRetry: step.retry || 3,
        },
        snapshotPath: `snapshots/${traceId}`,
        traceId,
      };

      // 执行当前步骤
      const result = await this.executor.execute(step.skill, stepInput, {
        timeout: this.options.defaultTimeout,
        maxRetries: step.retry,
      });

      // 处理结果
      if (result.code === 200) {
        // 成功，流转到下一步
        const nextStepName = step.onSuccess;
        execution.currentStep = nextStepName || 'completed';
        execution.stepsExecuted.push(currentStepName);

        // 更新上下文
        if (result.data) {
          execution.context = {
            ...execution.context,
            ...result.data,
          };
        }

        if (nextStepName) {
          // 继续执行下一步
          execution.status = 'running';
          await this.stateManager.save(execution);
          return await this.resumeFromStep(traceId, workflow, execution, nextStepName);
        } else {
          // 工作流完成
          execution.status = 'success';
          execution.endTime = Date.now();
          await this.stateManager.save(execution);

          return {
            code: 200,
            data: { execution },
            message: `Workflow "${workflow.name}" completed successfully`,
          };
        }
      } else if (result.code === 300) {
        // 再次需要用户输入
        execution.status = 'paused';
        await this.stateManager.save(execution);

        return {
          code: 300,
          data: {
            execution,
            result,
            waitForInput: true,
            currentStep: currentStepName,
            inputPrompt: result.data,
          },
          message: `Workflow paused at step "${currentStepName}": ${result.message}`,
        };
      } else if (result.code === 400) {
        // 可重试失败
        const failStepName = step.onFail;
        if (failStepName) {
          execution.currentStep = failStepName;
          execution.status = 'running';
          await this.stateManager.save(execution);
          return await this.resumeFromStep(traceId, workflow, execution, failStepName);
        }
        execution.status = 'failed';
        execution.error = result.message;
        await this.stateManager.save(execution);
        return result;
      } else {
        // 不可重试失败
        execution.status = 'failed';
        execution.error = result.message;
        await this.stateManager.save(execution);
        return result;
      }
    } catch (error) {
      logger.error(`Error resuming workflow step: ${currentStepName}`, { error, traceId });
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      await this.stateManager.save(execution);
      return {
        code: 500,
        data: { execution },
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 从指定步骤继续执行工作流
   */
  private async resumeFromStep(
    traceId: string,
    workflow: Workflow,
    execution: WorkflowExecution,
    startStep: string
  ): Promise<SkillOutput> {
    let currentStepName: string | null = startStep;

    while (currentStepName) {
      const step = workflow.steps.find(s => s.skill === currentStepName);
      if (!step) {
        return {
          code: 500,
          data: { execution },
          message: `Step not found: ${currentStepName}`,
        };
      }

      execution.currentStep = currentStepName;

      try {
        // 构建步骤输入
        const stepInput: SkillInput = {
          config: {},
          context: {
            readOnly: execution.context as SkillInput['context']['readOnly'],
            writable: execution.context as SkillInput['context']['writable'],
          },
          task: {
            taskId: traceId,
            taskName: currentStepName,
            target: currentStepName,
            params: step.params || {},
            timeout: this.options.defaultTimeout || 60000,
            maxRetry: step.retry || 3,
          },
          snapshotPath: `snapshots/${traceId}`,
          traceId,
        };

        // 执行 Skill
        const result = await this.executor.execute(step.skill, stepInput, {
          timeout: this.options.defaultTimeout,
          maxRetries: step.retry,
        });

        execution.stepsExecuted.push(currentStepName);

        // 处理结果
        if (result.code === 200) {
          currentStepName = step.onSuccess ?? null;
          if (result.data) {
            execution.context = { ...execution.context, ...result.data };
          }
        } else if (result.code === 300) {
          // 需要用户输入，暂停
          execution.status = 'paused';
          await this.stateManager.save(execution);
          return {
            code: 300,
            data: {
              execution,
              result,
              waitForInput: true,
              currentStep: currentStepName,
              inputPrompt: result.data,
            },
            message: `Workflow paused at step "${currentStepName}": ${result.message}`,
          };
        } else if (result.code === 400) {
          currentStepName = step.onFail ?? null;
        } else {
          execution.status = 'failed';
          execution.error = result.message;
          await this.stateManager.save(execution);
          return result;
        }

        // 保存状态
        await this.stateManager.save(execution);

      } catch (error) {
        logger.error(`Error in workflow step: ${currentStepName}`, { error, traceId });
        if (step.onFail) {
          currentStepName = step.onFail;
        } else {
          execution.status = 'failed';
          execution.error = error instanceof Error ? error.message : String(error);
          await this.stateManager.save(execution);
          return {
            code: 500,
            data: { execution },
            message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    }

    // 工作流完成
    execution.status = 'success';
    execution.endTime = Date.now();
    await this.stateManager.save(execution);

    return {
      code: 200,
      data: { execution },
      message: `Workflow "${workflow.name}" completed successfully`,
    };
  }

  /**
   * 触发进度回调
   */
  private notifyProgress(args: ProgressCallbackArgs): void {
    if (this.options.onProgress) {
      try {
        this.options.onProgress(args);
      } catch (error) {
        logger.warn('Progress callback error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 构建初始输入
   */
  private buildInitialInput(workflow: Workflow, input: SkillInput): SkillInput {
    return {
      ...input,
      task: {
        ...input.task,
        target: workflow.name,
        // 保留原有参数
      },
    };
  }

  /**
   * 构建步骤输入
   */
  private buildStepInput(baseInput: SkillInput, params: Record<string, unknown>): SkillInput {
    return {
      ...baseInput,
      task: {
        ...baseInput.task,
        params: {
          ...baseInput.task.params,
          ...params,
        },
      },
    };
  }

  /**
   * 合并上下文
   */
  private mergeContext(input: SkillInput, data: Record<string, unknown>): SkillInput {
    // 特殊处理：将关键数据移动到 readOnly context
    let readOnlyUpdate: Record<string, unknown> = {};
    
    // 需求相关
    if (data.collectedData) {
      readOnlyUpdate = { ...readOnlyUpdate, collectedDemand: data.collectedData };
    }
    if (data.clarifiedData) {
      readOnlyUpdate = { ...readOnlyUpdate, clarifiedDemand: data.clarifiedData };
    }
    
    // 报告相关
    if (data.report) {
      readOnlyUpdate = { ...readOnlyUpdate, demandReport: data.report };
    }
    if (data.reportMarkdown) {
      readOnlyUpdate = { ...readOnlyUpdate, demandReportMarkdown: data.reportMarkdown };
    }
    
    // 任务相关
    if (data.decomposition) {
      readOnlyUpdate = { ...readOnlyUpdate, taskDecomposition: data.decomposition };
    }
    if (data.tasksMarkdown) {
      readOnlyUpdate = { ...readOnlyUpdate, tasksMarkdown: data.tasksMarkdown };
    }
    
    // 计划相关
    if (data.plan) {
      readOnlyUpdate = { ...readOnlyUpdate, executionPlan: data.plan };
    }
    if (data.planMarkdown) {
      readOnlyUpdate = { ...readOnlyUpdate, planMarkdown: data.planMarkdown };
    }
    
    return {
      ...input,
      context: {
        readOnly: {
          ...input.context.readOnly,
          ...readOnlyUpdate,
        },
        writable: {
          ...input.context.writable,
          ...data,
        },
      },
    };
  }

  /**
   * 保存执行状态
   */
  private async saveState(execution: WorkflowExecution): Promise<void> {
    try {
      await this.stateManager.save(execution);
    } catch (error) {
      logger.warn('Failed to save workflow state', {
        error: error instanceof Error ? error.message : String(error),
        traceId: execution.traceId,
      });
    }
  }
}

export default WorkflowExecutor;