// SQLite 存储模块 - 基于 sql.js 的 SQLite 存储实现

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs/promises';
import path from 'path';
import { cwd } from 'process';

const getDefaultDbPath = (): string => {
  return path.join(cwd(), 'data', 'sqlite', 'storage.db');
};

/**
 * SQLite 存储配置
 */
export interface SQLiteStorageConfig {
  dbPath?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

/**
 * SQLite 存储类
 * 提供基于 SQLite 的持久化存储，支持事务、查询等功能
 */
export class SQLiteStorage {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private autoSave: boolean;
  private autoSaveInterval: number;
  private saveTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(config?: SQLiteStorageConfig) {
    this.dbPath = config?.dbPath || getDefaultDbPath();
    this.autoSave = config?.autoSave ?? true;
    this.autoSaveInterval = config?.autoSaveInterval ?? 5000;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      const SQL = await initSqlJs();

      // 确保目录存在
      const dbDir = path.dirname(this.dbPath);
      await fs.mkdir(dbDir, { recursive: true });

      // 尝试加载现有数据库
      try {
        const fileBuffer = await fs.readFile(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
      } catch {
        // 创建新数据库
        this.db = new SQL.Database();
      }

      // 创建默认表
      await this.createDefaultTables();

      // 启动自动保存
      if (this.autoSave) {
        this.startAutoSave();
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize SQLite database: ${error}`);
    }
  }

  /**
   * 创建默认表
   */
  private async createDefaultTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Key-Value 表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 通用数据表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS data_store (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_data_type ON data_store(type)`);

    // ===== 协作状态相关表 =====

    // 团队成员表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS team_members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'developer',
        status TEXT DEFAULT 'offline',
        last_active INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 任务表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS collaboration_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        assignee TEXT,
        priority TEXT DEFAULT 'medium',
        dependencies TEXT,
        estimated_hours REAL,
        actual_hours REAL,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `);

    // 任务状态变更历史
    this.db.run(`
      CREATE TABLE IF NOT EXISTS task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        changed_at INTEGER NOT NULL
      )
    `);

    // 评审记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS code_reviews (
        id TEXT PRIMARY KEY,
        pr_url TEXT,
        status TEXT DEFAULT 'pending',
        author TEXT,
        reviewers TEXT,
        issues_count INTEGER DEFAULT 0,
        passed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER
      )
    `);

    // 协作事件表（用于状态同步）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS collaboration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT,
        actor TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // 创建协作相关索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON collaboration_tasks(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON collaboration_tasks(assignee)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_reviews_status ON code_reviews(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_events_entity ON collaboration_events(entity_type, entity_id)`);
  }

  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setInterval(() => {
      this.saveToFile().catch(console.error);
    }, this.autoSaveInterval);
  }

  /**
   * 停止自动保存
   */
  private stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * 保存数据库到文件
   */
  async saveToFile(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const data = this.db.export();
    const buffer = Buffer.from(data);
    await fs.writeFile(this.dbPath, buffer);
  }

  /**
   * 确保数据库已初始化
   */
  private ensureDb(): SqlJsDatabase {
    if (!this.db) throw new Error('Database not initialized. Call initialize() first.');
    return this.db;
  }

  // ========== Key-Value 操作 ==========

  /**
   * 设置值
   */
  async set(key: string, value: unknown): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    const valueStr = JSON.stringify(value);

    const existing = db.exec(`SELECT key FROM kv_store WHERE key = ?`, [key]);
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      db.run(`UPDATE kv_store SET value = ?, updated_at = ? WHERE key = ?`, 
        [valueStr, now, key]);
    } else {
      db.run(`INSERT INTO kv_store (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        [key, valueStr, now, now]);
    }
  }

  /**
   * 获取值
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const db = this.ensureDb();
    const result = db.exec(`SELECT value FROM kv_store WHERE key = ?`, [key]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    try {
      return JSON.parse(result[0].values[0][0] as string) as T;
    } catch {
      return result[0].values[0][0] as unknown as T;
    }
  }

  /**
   * 删除值
   */
  async delete(key: string): Promise<boolean> {
    const db = this.ensureDb();
    db.run(`DELETE FROM kv_store WHERE key = ?`, [key]);
    return true;
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    const db = this.ensureDb();
    const result = db.exec(`SELECT 1 FROM kv_store WHERE key = ? LIMIT 1`, [key]);
    return result.length > 0 && result[0].values.length > 0;
  }

  // ========== 数据存储操作 ==========

  /**
   * 保存数据
   */
  async saveData(id: string, type: string, data: unknown): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    const dataStr = JSON.stringify(data);

    const existing = db.exec(`SELECT id FROM data_store WHERE id = ?`, [id]);
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      db.run(`UPDATE data_store SET data = ?, updated_at = ? WHERE id = ?`,
        [dataStr, now, id]);
    } else {
      db.run(`INSERT INTO data_store (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [id, type, dataStr, now, now]);
    }
  }

  /**
   * 加载数据
   */
  async loadData<T = unknown>(id: string): Promise<T | null> {
    const db = this.ensureDb();
    const result = db.exec(`SELECT data FROM data_store WHERE id = ?`, [id]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    try {
      return JSON.parse(result[0].values[0][0] as string) as T;
    } catch {
      return result[0].values[0][0] as unknown as T;
    }
  }

  /**
   * 按类型查询数据
   */
  async queryByType<T = unknown>(type: string): Promise<T[]> {
    const db = this.ensureDb();
    const result = db.exec(`SELECT data FROM data_store WHERE type = ?`, [type]);
    
    if (result.length === 0) {
      return [];
    }

    const items: T[] = [];
    for (const row of result[0].values) {
      try {
        items.push(JSON.parse(row[0] as string) as T);
      } catch {
        items.push(row[0] as unknown as T);
      }
    }
    return items;
  }

  /**
   * 删除数据
   */
  async deleteData(id: string): Promise<boolean> {
    const db = this.ensureDb();
    db.run(`DELETE FROM data_store WHERE id = ?`, [id]);
    return true;
  }

  // ========== 事务操作 ==========

  /**
   * 执行事务
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const db = this.ensureDb();
    db.run('BEGIN TRANSACTION');
    try {
      const result = await fn();
      db.run('COMMIT');
      return result;
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }

  // ========== 原始 SQL 操作 ==========

  /**
   * 执行原始 SQL 查询
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    const db = this.ensureDb();
    const result = db.exec(sql, params as (string | number | null | Uint8Array)[]);
    
    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj as T;
    });
  }

  /**
   * 执行原始 SQL 命令
   */
  execute(sql: string, params?: unknown[]): void {
    const db = this.ensureDb();
    db.run(sql, params as (string | number | null | Uint8Array)[]);
  }

  // ========== 生命周期 ==========

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    this.stopAutoSave();
    if (this.db) {
      await this.saveToFile();
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * 获取数据库信息
   */
  getInfo(): { path: string; initialized: boolean; autoSave: boolean } {
    return {
      path: this.dbPath,
      initialized: this.initialized,
      autoSave: this.autoSave,
    };
  }

  // ========== 协作状态操作 ==========

  /**
   * 添加团队成员
   */
  async addTeamMember(id: string, name: string, role: string = 'developer'): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    db.run(
      `INSERT OR REPLACE INTO team_members (id, name, role, status, last_active, created_at, updated_at) 
       VALUES (?, ?, ?, 'offline', ?, ?, ?)`,
      [id, name, role, now, now, now]
    );
  }

  /**
   * 获取团队成员列表
   */
  async getTeamMembers(): Promise<Array<{ id: string; name: string; role: string; status: string; lastActive: number }>> {
    const db = this.ensureDb();
    const result = db.exec(`SELECT id, name, role, status, last_active FROM team_members`);
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      id: row[0] as string,
      name: row[1] as string,
      role: row[2] as string,
      status: row[3] as string,
      lastActive: row[4] as number,
    }));
  }

  /**
   * 更新成员状态
   */
  async updateMemberStatus(id: string, status: string): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    db.run(
      `UPDATE team_members SET status = ?, last_active = ?, updated_at = ? WHERE id = ?`,
      [status, now, now, id]
    );
  }

  /**
   * 保存任务
   */
  async saveTask(task: {
    id: string;
    name: string;
    description?: string;
    status?: string;
    assignee?: string;
    priority?: string;
    dependencies?: string[];
    estimatedHours?: number;
    createdBy?: string;
  }): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    const deps = task.dependencies ? JSON.stringify(task.dependencies) : '[]';
    
    db.run(
      `INSERT OR REPLACE INTO collaboration_tasks 
       (id, name, description, status, assignee, priority, dependencies, estimated_hours, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.name,
        task.description || '',
        task.status || 'pending',
        task.assignee || '',
        task.priority || 'medium',
        deps,
        task.estimatedHours || 0,
        task.createdBy || '',
        now,
        now
      ]
    );
  }

  /**
   * 获取任务列表
   */
  async getTasks(filters?: { status?: string; assignee?: string }): Promise<Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    assignee: string;
    priority: string;
    dependencies: string[];
    estimatedHours: number;
  }>> {
    const db = this.ensureDb();
    let sql = `SELECT id, name, description, status, assignee, priority, dependencies, estimated_hours 
               FROM collaboration_tasks WHERE 1=1`;
    const params: string[] = [];

    if (filters?.status) {
      sql += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.assignee) {
      sql += ` AND assignee = ?`;
      params.push(filters.assignee);
    }

    const result = db.exec(sql, params);
    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      id: row[0] as string,
      name: row[1] as string,
      description: row[2] as string,
      status: row[3] as string,
      assignee: row[4] as string,
      priority: row[5] as string,
      dependencies: JSON.parse(row[6] as string || '[]'),
      estimatedHours: row[7] as number,
    }));
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, status: string, changedBy?: string): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    
    // 记录历史
    const task = db.exec(`SELECT status FROM collaboration_tasks WHERE id = ?`, [taskId]);
    const oldStatus = task.length > 0 && task[0].values.length > 0 ? task[0].values[0][0] as string : '';
    
    if (oldStatus !== status) {
      db.run(
        `INSERT INTO task_history (task_id, field, old_value, new_value, changed_by, changed_at)
         VALUES (?, 'status', ?, ?, ?, ?)`,
        [taskId, oldStatus, status, changedBy || '', now]
      );
    }

    const completedAt = ['completed', 'done'].includes(status) ? now : null;
    db.run(
      `UPDATE collaboration_tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?`,
      [status, now, completedAt, taskId]
    );
  }

  /**
   * 记录协作事件
   */
  async recordEvent(
    eventType: string,
    entityType: string,
    entityId: string,
    payload?: Record<string, unknown>,
    actor?: string
  ): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    const payloadStr = payload ? JSON.stringify(payload) : '';
    
    db.run(
      `INSERT INTO collaboration_events (event_type, entity_type, entity_id, payload, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventType, entityType, entityId, payloadStr, actor || '', now]
    );
  }

  /**
   * 获取协作事件（用于同步）
   */
  async getEvents(since: number, entityType?: string): Promise<Array<{
    eventType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    actor: string;
    createdAt: number;
  }>> {
    const db = this.ensureDb();
    let sql = `SELECT event_type, entity_type, entity_id, payload, actor, created_at 
               FROM collaboration_events WHERE created_at > ?`;
    const params: (number | string)[] = [since];

    if (entityType) {
      sql += ` AND entity_type = ?`;
      params.push(entityType);
    }

    sql += ` ORDER BY created_at ASC LIMIT 100`;

    const result = db.exec(sql, params);
    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      eventType: row[0] as string,
      entityType: row[1] as string,
      entityId: row[2] as string,
      payload: JSON.parse(row[3] as string || '{}'),
      actor: row[4] as string,
      createdAt: row[5] as number,
    }));
  }

  /**
   * 保存代码评审记录
   */
  async saveCodeReview(review: {
    id: string;
    prUrl?: string;
    status?: string;
    author?: string;
    reviewers?: string[];
    issuesCount?: number;
    passed?: boolean;
  }): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    const reviewers = review.reviewers ? JSON.stringify(review.reviewers) : '[]';
    
    db.run(
      `INSERT OR REPLACE INTO code_reviews 
       (id, pr_url, status, author, reviewers, issues_count, passed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        review.id,
        review.prUrl || '',
        review.status || 'pending',
        review.author || '',
        reviewers,
        review.issuesCount || 0,
        review.passed ? 1 : 0,
        now,
        now
      ]
    );
  }

  /**
   * 获取评审列表
   */
  async getCodeReviews(status?: string): Promise<Array<{
    id: string;
    prUrl: string;
    status: string;
    author: string;
    reviewers: string[];
    issuesCount: number;
    passed: boolean;
  }>> {
    const db = this.ensureDb();
    let sql = `SELECT id, pr_url, status, author, reviewers, issues_count, passed FROM code_reviews`;
    const params: string[] = [];

    if (status) {
      sql += ` WHERE status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC`;

    const result = db.exec(sql, params);
    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      id: row[0] as string,
      prUrl: row[1] as string,
      status: row[2] as string,
      author: row[3] as string,
      reviewers: JSON.parse(row[4] as string || '[]'),
      issuesCount: row[5] as number,
      passed: (row[6] as number) === 1,
    }));
  }
}

export default SQLiteStorage;
