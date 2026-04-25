// KnowledgeBridge - 知识桥接器
// 桥接 AIOS 知识库和 gstack/MiniMax 经验

import { promises as fs } from 'fs';
import path from 'path';
import { KnowledgeBase } from '../knowledge/base.js';
import { createLogger } from '../utils/logger.js';
import type { KnowledgeEntry } from '../types/index.js';
import type { KnowledgeSyncResult } from './types.js';

const logger = createLogger('KnowledgeBridge');

/**
 * KnowledgeBridge 类
 * 负责知识在三系统之间的同步和共享
 */
export class KnowledgeBridge {
  private aiosKB: KnowledgeBase;
  private gstackLearnPath: string | null;
  private minimaxLearnPath: string | null;

  constructor(aiosKB?: KnowledgeBase) {
    this.aiosKB = aiosKB || new KnowledgeBase();
    this.gstackLearnPath = this.findGstackLearnPath();
    this.minimaxLearnPath = this.findMinimaxLearnPath();
  }

  /**
   * 同步 gstack 经验到 AIOS 知识库
   */
  async syncFromGstack(): Promise<KnowledgeSyncResult> {
    const result: KnowledgeSyncResult = {
      synced: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    if (!this.gstackLearnPath) {
      logger.warn('gstack learn path not found, skipping sync');
      return result;
    }

    try {
      const learnFiles = await this.findLearnFiles(this.gstackLearnPath);

      for (const file of learnFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const parsed = this.parseGstackLearnFile(content, file);

          if (parsed) {
            // 检查是否已存在
            const existing = await this.aiosKB.search(parsed.topic);
            if (existing) {
              result.skipped++;
              logger.debug(`Skipped existing: ${parsed.topic}`);
            } else {
              await this.aiosKB.add(parsed);
              result.synced++;
              logger.debug(`Synced: ${parsed.topic}`);
            }
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`Failed to sync ${file}: ${error instanceof Error ? error.message : String(error)}`);
          logger.warn(`Failed to sync gstack learn file: ${file}`, { error });
        }
      }
    } catch (error) {
      logger.error('Failed to sync from gstack', { error });
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    logger.info(`gstack sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed`);
    return result;
  }

  /**
   * 同步 MiniMax 经验到 AIOS 知识库
   */
  async syncFromMinimax(): Promise<KnowledgeSyncResult> {
    const result: KnowledgeSyncResult = {
      synced: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    if (!this.minimaxLearnPath) {
      logger.warn('minimax learn path not found, skipping sync');
      return result;
    }

    try {
      const learnFiles = await this.findLearnFiles(this.minimaxLearnPath);

      for (const file of learnFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const parsed = this.parseMinimaxLearnFile(content, file);

          if (parsed) {
            const existing = await this.aiosKB.search(parsed.topic);
            if (existing) {
              result.skipped++;
            } else {
              await this.aiosKB.add(parsed);
              result.synced++;
            }
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`Failed to sync ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      logger.error('Failed to sync from minimax', { error });
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    logger.info(`minimax sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed`);
    return result;
  }

  /**
   * 导出 AIOS 知识到 gstack 格式
   */
  async exportToGstack(topic: string, outputPath?: string): Promise<string | null> {
    if (!this.gstackLearnPath) {
      logger.warn('gstack learn path not found');
      return null;
    }

    const entry = await this.aiosKB.search(topic);
    if (!entry) {
      logger.warn(`Knowledge not found: ${topic}`);
      return null;
    }

    const content = this.formatAsGstackLearn(entry);
    const fileName = `${this.sanitizeFileName(entry.topic)}.md`;
    const filePath = outputPath || path.join(this.gstackLearnPath, fileName);

    await fs.writeFile(filePath, content, 'utf-8');
    logger.info(`Exported to gstack format: ${filePath}`);

    return filePath;
  }

  /**
   * 统一查询接口
   * 先查 AIOS 知识库，再查 gstack/minimax
   */
  async query(query: string): Promise<{ aios?: KnowledgeEntry; gstack?: any; minimax?: any }> {
    const result: { aios?: KnowledgeEntry; gstack?: any; minimax?: any } = {};

    // 1. 先查 AIOS 知识库
    result.aios = await this.aiosKB.search(query) ?? undefined;

    // 2. 查 gstack learn
    if (this.gstackLearnPath) {
      const gstackResult = await this.searchGstackLearn(query);
      if (gstackResult) result.gstack = gstackResult;
    }

    // 3. 查 minimax learn
    if (this.minimaxLearnPath) {
      const minimaxResult = await this.searchMinimaxLearn(query);
      if (minimaxResult) result.minimax = minimaxResult;
    }

    return result;
  }

  /**
   * 获取同步状态
   */
  async getSyncStatus(): Promise<{
    gstack: { path: string | null; fileCount: number };
    minimax: { path: string | null; fileCount: number };
    aios: { entryCount: number };
  }> {
    let gstackCount = 0;
    let minimaxCount = 0;

    if (this.gstackLearnPath) {
      const files = await this.findLearnFiles(this.gstackLearnPath);
      gstackCount = files.length;
    }

    if (this.minimaxLearnPath) {
      const files = await this.findLearnFiles(this.minimaxLearnPath);
      minimaxCount = files.length;
    }

    const aiosEntries = await this.aiosKB.getAll();

    return {
      gstack: { path: this.gstackLearnPath, fileCount: gstackCount },
      minimax: { path: this.minimaxLearnPath, fileCount: minimaxCount },
      aios: { entryCount: aiosEntries.length },
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 查找 gstack learn 路径
   */
  private findGstackLearnPath(): string | null {
    // 尝试从项目根目录查找
    const possiblePaths = [
      path.join(process.cwd(), 'external', 'gstack', 'learn'),
      path.join(process.cwd(), '..', 'external', 'gstack', 'learn'),
    ];

    for (const p of possiblePaths) {
      try {
        // 检查目录是否存在
        return p;
      } catch {
        // 继续查找
      }
    }

    return null;
  }

  /**
   * 查找 minimax learn 路径
   */
  private findMinimaxLearnPath(): string | null {
    const possiblePaths = [
      path.join(process.cwd(), 'external', 'minimax-skills', 'skills', 'learn'),
      path.join(process.cwd(), '..', 'external', 'minimax-skills', 'learn'),
    ];

    for (const p of possiblePaths) {
      try {
        return p;
      } catch {
        // 继续查找
      }
    }

    return null;
  }

  /**
   * 查找 learn 文件
   */
  private async findLearnFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
          files.push(path.join(dirPath, entry.name));
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  /**
   * 解析 gstack learn 文件
   */
  private parseGstackLearnFile(content: string, filePath: string): Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> | null {
    try {
      const fileName = path.basename(filePath, path.extname(filePath));

      // gstack learn 文件通常是 markdown 格式
      const lines = content.split('\n');
      let topic = fileName;
      let keywords: string[] = [];
      let summary = '';

      // 尝试提取标题
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        topic = titleMatch[1].trim();
      }

      // 尝试提取标签
      const tagMatch = content.match(/tags?:\s*\[(.+)\]/i);
      if (tagMatch) {
        keywords = tagMatch[1].split(',').map(t => t.trim());
      }

      // 取前 200 字符作为摘要
      const bodyStart = content.indexOf('\n\n');
      if (bodyStart !== -1) {
        summary = content.slice(bodyStart).replace(/^#.*$/gm, '').trim().slice(0, 200);
      } else {
        summary = content.slice(0, 200);
      }

      return {
        topic,
        content,
        summary,
        keywords: [...keywords, 'gstack', 'learned'],
        source: 'learned' as const,
        sourceUrl: `file://${filePath}`,
      };
    } catch (error) {
      logger.warn(`Failed to parse gstack learn file: ${filePath}`, { error });
      return null;
    }
  }

  /**
   * 解析 minimax learn 文件
   */
  private parseMinimaxLearnFile(content: string, filePath: string): Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> | null {
    try {
      const fileName = path.basename(filePath, path.extname(filePath));

      return {
        topic: fileName,
        content,
        summary: content.slice(0, 200),
        keywords: ['minimax', 'learned'],
        source: 'learned' as const,
        sourceUrl: `file://${filePath}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * 格式化为 gstack learn 格式
   */
  private formatAsGstackLearn(entry: KnowledgeEntry): string {
    const tags = entry.keywords.join(', ');
    return `# ${entry.topic}

tags: [${tags}]

## Summary
${entry.summary}

## Content
${entry.content}

---
Source: AIOS Knowledge Base
Exported: ${new Date().toISOString()}
`;
  }

  /**
   * 搜索 gstack learn
   */
  private async searchGstackLearn(query: string): Promise<any | null> {
    if (!this.gstackLearnPath) return null;

    const files = await this.findLearnFiles(this.gstackLearnPath);
    const lowerQuery = query.toLowerCase();

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      if (content.toLowerCase().includes(lowerQuery)) {
        return {
          file,
          preview: content.slice(0, 500),
          matched: true,
        };
      }
    }

    return null;
  }

  /**
   * 搜索 minimax learn
   */
  private async searchMinimaxLearn(query: string): Promise<any | null> {
    if (!this.minimaxLearnPath) return null;

    const files = await this.findLearnFiles(this.minimaxLearnPath);
    const lowerQuery = query.toLowerCase();

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      if (content.toLowerCase().includes(lowerQuery)) {
        return {
          file,
          preview: content.slice(0, 500),
          matched: true,
        };
      }
    }

    return null;
  }

  /**
   * 清理文件名
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 100);
  }
}

/**
 * 导出单例
 */
let globalBridge: KnowledgeBridge | null = null;

export function getKnowledgeBridge(): KnowledgeBridge {
  if (!globalBridge) {
    globalBridge = new KnowledgeBridge();
  }
  return globalBridge;
}
