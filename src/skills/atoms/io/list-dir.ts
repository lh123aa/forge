// list-dir.skill - 列出目录

import fs from 'fs/promises';
import path from 'path';
import { BaseSkill } from '../../../skills/base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

/**
 * 列出目录 Skill
 */
export class ListDirSkill extends BaseSkill {
  readonly meta = {
    name: 'list-dir',
    description: '列出指定目录的内容',
    category: 'io' as const,
    version: '1.0.0',
    tags: ['file', 'directory', 'list', 'io'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const { dirPath, recursive = false, includeHidden = false, filter } = input.task.params as {
      dirPath?: string;
      recursive?: boolean;
      includeHidden?: boolean;
      filter?: (name: string) => boolean;
    };

    if (!dirPath) {
      return this.fatalError('缺少目录路径参数 dirPath');
    }

    try {
      // 检查目录是否存在
      try {
        await fs.access(dirPath);
      } catch {
        return this.fatalError(`目录不存在: ${dirPath}`);
      }

      const entries = await this.listDirectory(dirPath, recursive, includeHidden, filter);

      // 获取目录信息
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _stats = await fs.stat(dirPath);

      return this.success({
        path: dirPath,
        name: path.basename(dirPath),
        entries,
        count: entries.length,
      }, `成功列出目录: ${dirPath}, 包含 ${entries.length} 个条目`);

    } catch (error) {
      return this.fatalError(`列出目录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 列出目录内容
   */
  private async listDirectory(
    dirPath: string,
    recursive: boolean,
    includeHidden: boolean,
    filter?: (name: string) => boolean
  ): Promise<Array<{ name: string; type: 'file' | 'directory'; path: string }>> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results: Array<{ name: string; type: 'file' | 'directory'; path: string }> = [];

    for (const entry of entries) {
      // 跳过隐藏文件
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      // 应用过滤
      if (filter && !filter(entry.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const type = entry.isDirectory() ? 'directory' : 'file';

      if (recursive && entry.isDirectory()) {
        // 递归列出子目录
        const subEntries = await this.listDirectory(fullPath, recursive, includeHidden, filter);
        results.push(...subEntries.map(e => ({
          ...e,
          path: fullPath,
        })));
      } else {
        results.push({
          name: entry.name,
          type,
          path: fullPath,
        });
      }
    }

    return results;
  }
}

// 导出实例
export default new ListDirSkill();
