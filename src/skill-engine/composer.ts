// Skill 组合器 - 串行、并行执行能力

import { createLogger } from '../utils/logger.js';
import type { Skill, SkillInput, SkillOutput } from '../types/index.js';
import { SkillRegistry } from './registry.js';

const logger = createLogger('SkillComposer');

/**
 * 组合 Skill 配置
 */
export interface ComposeConfig {
  /** 失败时停止 */
  stopOnFail?: boolean;
  /** 合并输出数据 */
  mergeOutput?: boolean;
}

/**
 * 默认配置
 */
const defaultConfig: ComposeConfig = {
  stopOnFail: true,
  mergeOutput: true,
};

/**
 * Skill 组合器
 */
export class SkillComposer {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * 组合多个 Skill 形成组合 Skill
   */
  compose(name: string, description: string, skills: Skill[]): Skill {
    const skill = new CompositeSkillImpl(name, description, skills);
    return skill;
  }

  /**
   * 串行执行多个 Skill
   */
  async sequence(
    skills: Skill[],
    input: SkillInput,
    config?: ComposeConfig
  ): Promise<SkillOutput[]> {
    const cfg = { ...defaultConfig, ...config };
    const results: SkillOutput[] = [];
    let currentInput = this.cloneInput(input);

    for (const skill of skills) {
      logger.debug(`Executing skill in sequence: ${skill.meta.name}`);

      try {
        const result = await skill.run(currentInput);
        results.push(result);

        // 失败处理
        if (result.code !== 200) {
          logger.warn(`Skill "${skill.meta.name}" failed in sequence`, {
            code: result.code,
            message: result.message,
          });

          if (cfg.stopOnFail) {
            break;
          }
        }

        // 合并输出到输入上下文
        if (cfg.mergeOutput && result.data) {
          currentInput = this.mergeInput(currentInput, result.data);
        }

      } catch (error) {
        const errorOutput: SkillOutput = {
          code: 500,
          data: {},
          message: `Skill execution error: ${error instanceof Error ? error.message : String(error)}`,
        };
        results.push(errorOutput);

        if (cfg.stopOnFail) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * 并行执行多个 Skill
   */
  async parallel(
    skills: Skill[],
    input: SkillInput,
    config?: ComposeConfig
  ): Promise<SkillOutput[]> {
    const _cfg = { ...defaultConfig, ...config };
    const promises = skills.map(async (skill) => {
      try {
        logger.debug(`Executing skill in parallel: ${skill.meta.name}`);
        return await skill.run(input);
      } catch (error) {
        return {
          code: 500,
          data: {},
          message: `Skill execution error: ${error instanceof Error ? error.message : String(error)}`,
        } as SkillOutput;
      }
    });

    return Promise.all(promises);
  }

  /**
   * 条件执行
   */
  async conditional(
    condition: (input: SkillInput) => boolean | Promise<boolean>,
    ifSkill: Skill,
    elseSkill: Skill | null,
    input: SkillInput
  ): Promise<SkillOutput> {
    const conditionResult = await condition(input);

    if (conditionResult) {
      return ifSkill.run(input);
    } else if (elseSkill) {
      return elseSkill.run(input);
    }

    return {
      code: 200,
      data: { skipped: true },
      message: 'Condition not met, skipped',
    };
  }

  /**
   * 循环执行
   */
  async loop(
    maxIterations: number,
    skill: Skill,
    shouldContinue: (input: SkillInput, iteration: number) => boolean | Promise<boolean>,
    input: SkillInput
  ): Promise<SkillOutput[]> {
    const results: SkillOutput[] = [];
    let currentInput = this.cloneInput(input);

    for (let i = 0; i < maxIterations; i++) {
      logger.debug(`Executing skill in loop: ${skill.meta.name}, iteration ${i + 1}`);

      const result = await skill.run(currentInput);
      results.push(result);

      // 检查是否继续
      const shouldCont = await shouldContinue(currentInput, i);
      if (!shouldCont || result.code !== 200) {
        break;
      }

      // 合并输出
      if (result.data) {
        currentInput = this.mergeInput(currentInput, result.data);
      }
    }

    return results;
  }

  /**
   * 克隆输入
   */
  private cloneInput(input: SkillInput): SkillInput {
    return JSON.parse(JSON.stringify(input));
  }

  /**
   * 合并数据到输入
   */
  private mergeInput(input: SkillInput, data: Record<string, unknown>): SkillInput {
    return {
      ...input,
      context: {
        ...input.context,
        writable: {
          ...input.context.writable,
          ...data,
        },
      },
    };
  }
}

/**
 * 组合 Skill 实现
 */
class CompositeSkillImpl implements Skill {
  meta = {
    name: '',
    description: '',
    category: 'utility' as const,
    version: '1.0.0',
  };

  constructor(
    name: string,
    description: string,
    private skills: Skill[]
  ) {
    this.meta.name = name;
    this.meta.description = description;
  }

  async run(input: SkillInput): Promise<SkillOutput> {
    const results: SkillOutput[] = [];

    for (const skill of this.skills) {
      const result = await skill.run(input);
      results.push(result);

      if (result.code !== 200) {
        return {
          code: result.code,
          data: { results },
          message: `Composite skill failed at "${skill.meta.name}": ${result.message}`,
        };
      }
    }

    return {
      code: 200,
      data: { results },
      message: `Composite skill "${this.meta.name}" completed successfully`,
    };
  }
}

export default SkillComposer;
