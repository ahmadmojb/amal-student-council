/**
 * Storage abstraction used by every server route. Two implementations:
 *  - FileStore: demo mode, a JSON file on this machine only.
 *  - FirebaseStore: production, Firebase Realtime Database via the Admin SDK.
 *
 * Database layout (see docs/database.md):
 *   content/<collection>/<id>   full records incl. drafts      (private)
 *   content/leagueConfig        league configuration          (private)
 *   content/settings            site settings                 (private)
 *   public/<collection>/<id>    published projection only     (public read)
 *   public/leagueConfig, public/settings, public/meta
 *   private/certificates/<sha256(code)>                        (private)
 *   private/adminAudit/<id>                                    (private)
 *   private/revokedSessions/<sid>                              (private)
 *   system/schemaVersion                                       (private)
 */
export type Unsubscribe = () => void;

export interface Store {
  readonly kind: 'file' | 'firebase';
  get<T = unknown>(path: string): Promise<T | null>;
  set(path: string, value: unknown): Promise<void>;
  /** Atomic multi-path update. A `null` value deletes that path. */
  update(updates: Record<string, unknown>): Promise<void>;
  remove(path: string): Promise<void>;
  /**
   * Atomic read-modify-write of one path. `fn` returns the new value, `null`
   * to delete, or `undefined` to abort. Resolves to whether it committed.
   */
  transaction<T>(path: string, fn: (current: T | null) => T | null | undefined): Promise<boolean>;
  /** Push-style key ordered by time. */
  newKey(): string;
  /** Last N children ordered by key (used for the audit log). */
  lastChildren<T = unknown>(path: string, limit: number): Promise<Record<string, T>>;
  /** Change notifications for the public tree (demo-mode SSE only). */
  onPublicChange?(cb: () => void): Unsubscribe;
  close?(): Promise<void>;
}

export function assertSafePath(path: string): void {
  if (!/^[A-Za-z0-9_\-/]+$/.test(path) || path.includes('//') || path.startsWith('/') || path.endsWith('/')) {
    throw new Error(`Unsafe database path: ${path}`);
  }
}
