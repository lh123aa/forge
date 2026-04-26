// 存储模块 - 基础文件系统存储

import fs from 'fs/promises';
import path from 'path';
import { cwd } from 'process';
import type { SQLiteStorageConfig } from './sqlite-storage.js';
// SQLiteStorage is reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import _SQLiteStorage from './sqlite-storage.js';

// 使用 process.cwd() 获取当前工作目录，避免 ESM/CommonJS 冲突
const getBaseDir = (): string => {
  // @ts-ignore - __dirname 在某些环境中可能不存在
  if (typeof __dirname !== 'undefined') {
    return path.join(__dirname, '../../data');
  }
  return path.join(cwd(), 'data');
};

/**
 * 存储配置
 */
export interface StorageConfig {
  basePath: string;
}

/**
 * 基础文件存储类
 */
export class FileStorage {
  private basePath: string;

  constructor(config?: StorageConfig) {
    this.basePath = config?.basePath || getBaseDir();
  }

  /**
   * 确保目录存在
   */
  async ensureDir(dirPath: string): Promise<void> {
    const fullPath = path.isAbsolute(dirPath) 
      ? dirPath 
      : path.join(this.basePath, dirPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  /**
   * 保存数据
   */
  async save(filePath: string, data: unknown): Promise<void> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.basePath, filePath);
    
    await this.ensureDir(path.dirname(fullPath));
    
    const content = typeof data === 'string' 
      ? data 
      : JSON.stringify(data, null, 2);
    
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * 加载数据
   */
  async load<T = unknown>(filePath: string): Promise<T | null> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.basePath, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      try {
        return JSON.parse(content) as T;
      } catch {
        return content as unknown as T;
      }
    } catch {
      return null;
    }
  }

  /**
   * 删除文件
   */
  async delete(filePath: string): Promise<boolean> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.basePath, filePath);
    
    try {
      await fs.unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查文件是否存在
   */
  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.basePath, filePath);
    
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出目录文件
   */
  async list(dirPath: string): Promise<string[]> {
    const fullPath = path.isAbsolute(dirPath) 
      ? dirPath 
      : path.join(this.basePath, dirPath);
    
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return entries.map(entry => 
        entry.isDirectory() ? `${entry.name}/` : entry.name
      );
    } catch {
      return [];
    }
  }

  /**
   * 追加数据到文件
   */
  async append(filePath: string, data: unknown): Promise<void> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.basePath, filePath);
    
    await this.ensureDir(path.dirname(fullPath));
    
    const existing = await this.load(filePath);
    const existingArray = Array.isArray(existing) ? existing : [];
    const newArray = Array.isArray(data) ? data : [data];
    
    await this.save(fullPath, [...existingArray, ...newArray]);
  }

  /**
   * 获取完整路径
   */
  getFullPath(relativePath: string): string {
    return path.join(this.basePath, relativePath);
  }
}

// 向后兼容别名
export const Storage = FileStorage;

export type { SQLiteStorageConfig };
