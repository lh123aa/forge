// Utility Skills 单元测试

import { DeliverySkill } from '../src/skills/atoms/utility/delivery.js';
import { WorkflowCompleteSkill } from '../src/skills/atoms/utility/workflow-complete.js';
import { ManualFixRequiredSkill } from '../src/skills/atoms/utility/manual-fix-required.js';
import { SaveDemandSkill } from '../src/skills/atoms/utility/save-demand.js';
import type { SkillInput } from '../src/types/index.js';

// 创建测试输入
const createTestInput = (overrides = {}): SkillInput => ({
  config: {},
  context: {
    readOnly: {},
    writable: {},
  },
  task: {
    taskId: 'test-task-1',
    taskName: 'test',
    target: 'test target',
    params: {},
    timeout: 30000,
    maxRetry: 3,
  },
  snapshotPath: 'snapshots/test',
  traceId: 'test-trace-1',
  ...overrides,
});

describe('DeliverySkill', () => {
  let skill: DeliverySkill;

  beforeEach(() => {
    skill = new DeliverySkill();
  });

  it('should have correct metadata', () => {
    expect(skill.meta.name).toBe('delivery');
    expect(skill.meta.category).toBe('utility');
  });

  it('should execute successfully with default params', async () => {
    const input = createTestInput();
    const result = await skill.run(input);

    expect(result.code).toBe(200);
    expect(result.data.deliveryComplete).toBe(true);
  });

  it('should generate deliverables from context', async () => {
    const input = createTestInput({
      context: {
        readOnly: {},
        writable: {
          projectType: 'page',
          demandReportMarkdown: '# Test Report',
          generatedFiles: ['index.ts', 'styles.css'],
        },
      },
    });

    const result = await skill.run(input);

    expect(result.code).toBe(200);
    expect(result.data.deliverables).toBeDefined();
    expect(Array.isArray(result.data.deliverables)).toBe(true);
  });

  it('should generate usage instructions for different project types', async () => {
    const input = createTestInput({
      context: {
        readOnly: {},
        writable: {
          projectType: 'api',
        },
      },
    });

    const result = await skill.run(input);

    expect(result.code).toBe(200);
    expect(result.data.usageInstructions).toBeDefined();
  });
});

describe('WorkflowCompleteSkill', () => {
  let skill: WorkflowCompleteSkill;

  beforeEach(() => {
    skill = new WorkflowCompleteSkill();
  });

  it('should have correct metadata', () => {
    expect(skill.meta.name).toBe('workflow-complete');
    expect(skill.meta.category).toBe('utility');
  });

  it('should complete workflow with default params', async () => {
    const input = createTestInput();
    const result = await skill.run(input);

    expect(result.code).toBe(200);
    expect(result.data.workflowStatus).toBe('completed');
  });

  it('should complete workflow with stage param', async () => {
    const input = createTestInput({
      task: {
        taskId: 'test-task-1',
        taskName: 'test',
        target: 'test target',
        params: { stage: 'demand' },
        timeout: 30000,
        maxRetry: 3,
      },
    });

    const result = await skill.run(input);

    expect(result.code).toBe(200);
    expect(result.data.stage).toBe('demand');
    expect(result.message).toContain('需求分析阶段已完成');
  });

  it('should generate correct completion message for different stages', async () => {
    const stages = ['demand', 'planning', 'code', 'test', 'delivery'];
    
    for (const stage of stages) {
      const input = createTestInput({
        task: {
          taskId: 'test-task-1',
          taskName: 'test',
          target: 'test target',
          params: { stage },
          timeout: 30000,
          maxRetry: 3,
        },
      });

      const result = await skill.run(input);
      expect(result.code).toBe(200);
      expect(result.data.stage).toBe(stage);
    }
  });
});

describe('ManualFixRequiredSkill', () => {
  let skill: ManualFixRequiredSkill;

  beforeEach(() => {
    skill = new ManualFixRequiredSkill();
  });

  it('should have correct metadata', () => {
    expect(skill.meta.name).toBe('manual-fix-required');
    expect(skill.meta.category).toBe('utility');
  });

  it('should return code 300 for user input', async () => {
    const input = createTestInput();
    const result = await skill.run(input);

    expect(result.code).toBe(300);
    expect(result.data.requiresManualIntervention).toBe(true);
  });

  it('should include suggested actions', async () => {
    const input = createTestInput({
      task: {
        taskId: 'test-task-1',
        taskName: 'test',
        target: 'test target',
        params: { reason: 'test failure', attempts: 3 },
        timeout: 30000,
        maxRetry: 3,
      },
    });

    const result = await skill.run(input);

    expect(result.code).toBe(300);
    expect(result.data.suggestedActions).toBeDefined();
    expect(Array.isArray(result.data.suggestedActions)).toBe(true);
    expect(result.data.suggestedActions.length).toBeGreaterThan(0);
  });

  it('should include context information', async () => {
    const input = createTestInput({
      task: {
        taskId: 'test-task-1',
        taskName: 'test',
        target: 'test target',
        params: { failedStep: 'unit-test', attempts: 5 },
        timeout: 30000,
        maxRetry: 3,
      },
    });

    const result = await skill.run(input);

    expect(result.code).toBe(300);
    expect(result.data.context.failedStep).toBe('unit-test');
    expect(result.data.context.attempts).toBe(5);
  });
});

describe('SaveDemandSkill', () => {
  let skill: SaveDemandSkill;

  beforeEach(() => {
    skill = new SaveDemandSkill();
  });

  it('should have correct metadata', () => {
    expect(skill.meta.name).toBe('save-demand');
    expect(skill.meta.category).toBe('utility');
  });

  it('should fail when no demand data provided', async () => {
    const input = createTestInput();
    const result = await skill.run(input);

    expect(result.code).toBe(500);
    expect(result.message).toContain('没有可保存的需求数据');
  });

  it('should save demand data successfully', async () => {
    const input = createTestInput({
      context: {
        readOnly: {},
        writable: {
          projectType: 'page',
          collectedDemand: {
            answers: { purpose: 'test' },
          },
        },
      },
    });

    const result = await skill.run(input);

    expect(result.code).toBe(200);
    expect(result.data.saved).toBe(true);
    expect(result.data.demandData).toBeDefined();
  });

  it('should merge demand data correctly', async () => {
    const input = createTestInput({
      context: {
        readOnly: {},
        writable: {
          projectType: 'api',
          collectedDemand: {
            answers: { purpose: 'api endpoint' },
          },
          clarifiedAnswers: {
            techStack: 'express',
          },
        },
      },
    });

    const result = await skill.run(input);

    expect(result.code).toBe(200);
    expect(result.data.demandData.mergedDemand).toBeDefined();
    expect(result.data.demandData.mergedDemand.answers.purpose).toBe('api endpoint');
    expect(result.data.demandData.mergedDemand.answers.techStack).toBe('express');
  });
});
