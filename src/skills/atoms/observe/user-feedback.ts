// user-feedback.skill - 用户反馈 Skill
// 收集用户反馈用于产品改进

import { BaseSkill } from '../../base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

/**
 * 用户反馈 Skill
 * 收集用户反馈，用于产品迭代改进
 */
export class UserFeedbackSkill extends BaseSkill {
  readonly meta = {
    name: 'user-feedback',
    description: '收集用户反馈用于产品改进',
    category: 'observe' as const,
    version: '1.0.0',
    tags: ['feedback', 'user', 'observe', 'improvement'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const {
      type = 'suggestion',  // 反馈类型: bug, suggestion, question
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      content: _content,             // 反馈内容
      stage,               // 关联阶段
    } = input.task.params as {
      type?: 'bug' | 'suggestion' | 'question';
      content?: string;
      stage?: string;
    };

    // 检查是否已有用户反馈
    const userAnswer = input.task.params.answer as string | undefined;
    
    if (userAnswer) {
      // 用户提供了反馈，保存反馈
      const feedback = {
        type,
        content: userAnswer,
        stage,
        traceId: input.traceId,
        timestamp: new Date().toISOString(),
      };

      return this.success({
        feedbackRecorded: true,
        feedback,
      }, '感谢您的反馈！');
    }

    // 需要用户输入反馈
    const question = this.getFeedbackQuestion(type);
    
    return this.needInput({
      question,
      type,
      stage,
      required: false,
    }, '请提供您的反馈');
  }

  /**
   * 根据反馈类型获取问题
   */
  private getFeedbackQuestion(type: string): string {
    switch (type) {
      case 'bug':
        return '请描述您遇到的问题：\n\n1. 问题现象\n2. 复现步骤\n3. 期望行为';
      case 'question':
        return '请描述您的问题：';
      case 'suggestion':
      default:
        return '请提出您的建议：\n\n您的建议将帮助我们改进产品。';
    }
  }
}

// 导出实例
export default new UserFeedbackSkill();
