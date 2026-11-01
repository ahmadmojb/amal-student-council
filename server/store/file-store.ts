/**
 * Demo-mode store: an in-memory tree persisted to a JSON file on disk.
 * It is honest about its scope — data lives on the machine running the
 * server and is NOT synchronised to other servers or to Firebase.
 */
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { assertSafePath, type Store, type Unsubscribe } from './types.js';

type Tree = Record<string, unknown>;

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

export function timeKey(): string {
  return Date.now().toString(36).padStart(9, '0') + randomBytes(6).toString('hex');
}

export class FileStore implements Store {
  readonly kind = 'file' as const;
  private tree: Tree = {};
  private events = new EventEmitter();
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        this.tree = JSON.parse(readFileSync(file, 'utf8')) as Tree;
      } catch {
        throw new Error(`Demo data file is corrupt: ${file}. Move it aside to start fresh.`);
      }
    }
    this.events.setMaxListeners(200);
  }

  private segments(path: string): string[] {
    assertSafePath(path);
    return path.split('/');
  }

  private read(path: string): unknown {
    let node: unknown = this.tree;
    for (const s of this.segments(path)) {
      if (node === null || typeof node !== 'object') return null;
      node = (node as Tree)[s];
    }
    return node ?? null;
  }

  private write(path: string, value: unknown): void {
    const segs = this.segments(path);
    let node = this.tree;
    for (const s of segs.slice(0, -1)) {
      const next = node[s];
      if (next === null || typeof next !== 'object') node[s] = {};
      node = node[s] as Tree;
    }
    const last = segs[segs.length - 1] as string;
    if (value === null || value === undefined) delete node[last];
    else node[last] = clone(value);
    this.prune(segs.slice(0, -1));
  }

  /** Remove empty parent objects like Firebase does. */
  private prune(segs: string[]): void {
    for (let i = segs.length; i > 0; i--) {
      let parent: Tree | undefined = this.tree;
      for (const s of segs.slice(0, i - 1)) {
        const next: unknown = parent?.[s];
        parent = next && typeof next === 'object' ? (next as Tree) : undefined;
      }
      if (!parent) break;
      const key = segs[i - 1] as string;
      const child = parent[key];
      if (child && typeof child === 'object' && Object.keys(child).length === 0) delete parent[key];
      else break;
    }
  }

  private persist(paths: string[]): void {
    if (paths.some((p) => p === 'public' || p.startsWith('public/'))) this.events.emit('public');
    if (!this.file) return;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flush(), 50);
  }

  flush(): void {
    if (!this.file) return;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.tree, null, 1));
    renameSync(tmp, this.file);
  }

  async get<T>(path: string): Promise<T | null> {
    return clone(this.read(path)) as T | null;
  }

  async set(path: string, value: unknown): Promise<void> {
    this.write(path, value);
    this.persist([path]);
  }

  async update(updates: Record<string, unknown>): Promise<void> {
    // Validate every path first so the update is all-or-nothing.
    for (const p of Object.keys(updates)) assertSafePath(p);
    for (const [p, v] of Object.entries(updates)) this.write(p, v);
    this.persist(Object.keys(updates));
  }

  async remove(path: string): Promise<void> {
    this.write(path, null);
    this.persist([path]);
  }

  async transaction<T>(path: string, fn: (current: T | null) => T | null | undefined): Promise<boolean> {
    // Single-threaded and synchronous between read and write, hence atomic.
    const next = fn(clone(this.read(path)) as T | null);
    if (next === undefined) return false;
    this.write(path, next);
    this.persist([path]);
    return true;
  }

  newKey(): string {
    return timeKey();
  }

  async lastChildren<T>(path: string, limit: number): Promise<Record<string, T>> {
    const node = (this.read(path) ?? {}) as Record<string, T>;
    const keys = Object.keys(node).sort().slice(-limit);
    return Object.fromEntries(keys.map((k) => [k, clone(node[k] as T)]));
  }

  onPublicChange(cb: () => void): Unsubscribe {
    this.events.on('public', cb);
    return () => this.events.off('public', cb);
  }

  async close(): Promise<void> {
    this.flush();
  }
}
