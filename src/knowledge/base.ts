// 知识库基础实现

import { v4 as uuidv4 } from 'uuid';
import { FileStorage } from '../storage/index.js';
import { createLogger } from '../utils/logger.js';
import type { KnowledgeEntry } from '../types/index.js';

const logger = createLogger('KnowledgeBase');

/**
 * 知识库
 */
export class KnowledgeBase {
  private storage: FileStorage;
  private readonly baseDir = 'observer/knowledge';

  constructor(storage?: FileStorage) {
    this.storage = storage || new FileStorage();
  }

  /**
   * 搜索知识
   */
  async search(query: string): Promise<KnowledgeEntry | null> {
    const index = await this.loadIndex();
    
    // 1. 关键词精确匹配
    for (const entry of index.entries) {
      if (entry.keywords && entry.keywords.some(kw => query.toLowerCase().includes(kw.toLowerCase()))) {
        const fullEntry = await this.loadEntry(entry.id);
        if (fullEntry) {
          await this.updateUsage(fullEntry.id);
          logger.debug(`Knowledge found via keyword: ${entry.topic}`);
          return fullEntry;
        }
      }
    }

    // 2. 标题匹配
    for (const entry of index.entries) {
      if (entry.topic.toLowerCase().includes(query.toLowerCase())) {
        const fullEntry = await this.loadEntry(entry.id);
        if (fullEntry) {
          await this.updateUsage(fullEntry.id);
          logger.debug(`Knowledge found via topic: ${entry.topic}`);
          return fullEntry;
        }
      }
    }

    logger.debug(`No knowledge found for query: ${query}`);
    return null;
  }

  /**
   * 添加知识
   */
  async add(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<string> {
    const id = uuidv4();
    const fullEntry: KnowledgeEntry = {
      ...entry,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
    };

    // 保存内容
    await this.storage.save(`${this.baseDir}/content/${id}.json`, fullEntry);

    // 更新索引
    await this.updateIndex({
      id: fullEntry.id,
      topic: fullEntry.topic,
      keywords: fullEntry.keywords,
    });

    logger.info(`Knowledge added: ${fullEntry.topic}`, { id });
    return id;
  }

  /**
   * 更新知识
   */
  async update(id: string, updates: Partial<KnowledgeEntry>): Promise<boolean> {
    const entry = await this.loadEntry(id);
    if (!entry) return false;

    const updated = {
      ...entry,
      ...updates,
      id: entry.id,
      createdAt: entry.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await this.storage.save(`${this.baseDir}/content/${id}.json`, updated);
    logger.info(`Knowledge updated: ${entry.topic}`, { id });
    return true;
  }

  /**
   * 删除知识
   */
  async delete(id: string): Promise<boolean> {
    const entry = await this.loadEntry(id);
    if (!entry) return false;

    await this.storage.delete(`${this.baseDir}/content/${id}.json`);
    await this.removeFromIndex(id);

    logger.info(`Knowledge deleted: ${entry.topic}`, { id });
    return true;
  }

  /**
   * 获取所有知识
   */
  async getAll(): Promise<KnowledgeEntry[]> {
    const index = await this.loadIndex();
    const entries: KnowledgeEntry[] = [];

    for (const entry of index.entries) {
      const fullEntry = await this.loadEntry(entry.id);
      if (fullEntry) {
        entries.push(fullEntry);
      }
    }

    return entries;
  }

  /**
   * 加载单个知识条目
   */
  private async loadEntry(id: string): Promise<KnowledgeEntry | null> {
    return this.storage.load<KnowledgeEntry>(`${this.baseDir}/content/${id}.json`);
  }

  /**
   * 加载索引
   */
  private async loadIndex(): Promise<{ entries: Array<{ id: string; topic: string; keywords: string[] }> }> {
    const index = await this.storage.load<{ entries: Array<{ id: string; topic: string; keywords: string[] }> }>(
      `${this.baseDir}/topics.json`
    );
    return index || { entries: [] };
  }

  /**
   * 更新索引
   */
  private async updateIndex(entry: { id: string; topic: string; keywords: string[] }): Promise<void> {
    const index = await this.loadIndex();
    const existingIndex = index.entries.findIndex(e => e.id === entry.id);
    
    if (existingIndex >= 0) {
      index.entries[existingIndex] = entry;
    } else {
      index.entries.push(entry);
    }

    await this.storage.save(`${this.baseDir}/topics.json`, index);
  }

  /**
   * 从索引中移除
   */
  private async removeFromIndex(id: string): Promise<void> {
    const index = await this.loadIndex();
    index.entries = index.entries.filter(e => e.id !== id);
    await this.storage.save(`${this.baseDir}/topics.json`, index);
  }

  /**
   * 更新使用次数
   */
  private async updateUsage(id: string): Promise<void> {
    const entry = await this.loadEntry(id);
    if (entry) {
      await this.update(id, { usageCount: entry.usageCount + 1 });
    }
  }
}

export default KnowledgeBase;
