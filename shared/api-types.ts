/** Response shapes shared by server routes and the client. */
export interface PublicClientConfig {
  mode: 'demo' | 'production';
  firebase: Record<string, string> | null;
  siteUrl: string;
}

export interface AdminSession {
  authenticated: boolean;
  expiresAt?: number;
  mode: 'demo' | 'production';
  demoPin: boolean;
}

export interface AdminOverview {
  mode: 'demo' | 'production';
  storeKind: 'file' | 'firebase';
  usingDemoPin: boolean;
  counts: Record<string, { total: number; published: number; draft: number; archived: number }>;
  certificates: number;
}

export interface AuditRow {
  id: string;
  at: number;
  action: string;
  collection?: string;
  recordId?: string;
  summary?: string;
  client?: string;
}

export interface AdminScheduleVideo {
  current: import('./schemas.js').ScheduleVideoRecord | null;
  active: boolean;
  maxBytes: number;
}
