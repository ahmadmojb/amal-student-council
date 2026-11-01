/**
 * Content service: the only code path that writes administrator content.
 * Every write updates the private record, the public projection and the
 * audit log in ONE atomic multi-path update.
 */
import {
  collectionSchemas,
  leagueConfigInput,
  siteSettingsInput,
  type CollectionName,
  type CollectionRecordMap,
  type LeagueConfig,
  type SiteSettings,
} from '../../shared/schemas.js';
import { todayInSchool } from '../../shared/dates.js';
import type { Store } from '../store/types.js';

export const SCHEMA_VERSION = 1;

type AnyRecord = CollectionRecordMap[CollectionName];

/** Fields that never leave the server even for published records. */
const PRIVATE_FIELDS: Partial<Record<CollectionName, string[]>> = {
  exams: ['adminNotes'],
  teams: ['notes'],
};

/**
 * What the public may see for a record, or null if it must not be public.
 * Expiry is applied here as well as at render time.
 */
export function toPublic<C extends CollectionName>(collection: C, record: CollectionRecordMap[C], today = todayInSchool()): Record<string, unknown> | null {
  if (record.visibility !== 'published') return null;
  const r = record as unknown as Record<string, unknown>;
  const expiresOn = typeof r.expiresOn === 'string' ? r.expiresOn : '';
  if (expiresOn && expiresOn < today) return null;
  const copy: Record<string, unknown> = { ...r };
  for (const f of PRIVATE_FIELDS[collection] ?? []) delete copy[f];
  return copy;
}

export class ConflictError extends Error {}

export interface AuditEntry {
  at: number;
  action: string;
  collection?: string;
  recordId?: string;
  summary?: string;
  /** Truncated hash only — never a raw IP address. */
  client?: string;
}

export class ContentService {
  constructor(private readonly store: Store) {}

  auditUpdate(entry: Omit<AuditEntry, 'at'>, at = Date.now()): Record<string, unknown> {
    return { [`private/adminAudit/${this.store.newKey()}`]: { at, ...entry } };
  }

  async audit(entry: Omit<AuditEntry, 'at'>): Promise<void> {
    await this.store.update(this.auditUpdate(entry));
  }

  async list<C extends CollectionName>(collection: C): Promise<CollectionRecordMap[C][]> {
    const all = (await this.store.get<Record<string, CollectionRecordMap[C]>>(`content/${collection}`)) ?? {};
    return Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getRecord<C extends CollectionName>(collection: C, id: string): Promise<CollectionRecordMap[C] | null> {
    return this.store.get<CollectionRecordMap[C]>(`content/${collection}/${id}`);
  }

  /** Validates and writes; returns the stored record. */
  writeUpdates<C extends CollectionName>(collection: C, record: CollectionRecordMap[C]): Record<string, unknown> {
    return {
      [`content/${collection}/${record.id}`]: record,
      [`public/${collection}/${record.id}`]: toPublic(collection, record),
      'public/meta/updatedAt': record.updatedAt,
    };
  }

  /** Business uniqueness rules that a schema alone cannot express. */
  private async assertUnique(collection: CollectionName, data: Record<string, unknown>, selfId?: string): Promise<void> {
    if (collection !== 'teams') return;
    const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    const teams = await this.list('teams');
    const clash = teams.find((t) => t.id !== selfId && t.grade === data.grade && (norm(t.className) === norm(data.className) || norm(t.displayName) === norm(data.displayName)));
    if (clash) throw new ConflictError('يوجد فريق آخر في هذا الصف بنفس الشعبة أو الاسم.');
  }

  async create<C extends CollectionName>(collection: C, input: unknown, client?: string, id?: string): Promise<CollectionRecordMap[C]> {
    const data = collectionSchemas[collection].parse(input);
    await this.assertUnique(collection, data as Record<string, unknown>);
    const now = Date.now();
    const record = { ...data, id: id ?? this.store.newKey(), createdAt: now, updatedAt: now } as unknown as CollectionRecordMap[C];
    await this.store.update({
      ...this.writeUpdates(collection, record),
      ...this.auditUpdate({ action: 'create', collection, recordId: record.id, summary: summarize(record), client }, now),
    });
    return record;
  }

  async replace<C extends CollectionName>(collection: C, id: string, input: unknown, client?: string): Promise<CollectionRecordMap[C] | null> {
    const existing = await this.getRecord(collection, id);
    if (!existing) return null;
    const data = collectionSchemas[collection].parse(input);
    await this.assertUnique(collection, data as Record<string, unknown>, id);
    const now = Date.now();
    const record = { ...data, id, createdAt: existing.createdAt, updatedAt: now } as unknown as CollectionRecordMap[C];
    const visibilityChanged = existing.visibility !== record.visibility;
    await this.store.update({
      ...this.writeUpdates(collection, record),
      ...this.auditUpdate(
        {
          action: visibilityChanged ? `update+${record.visibility}` : 'update',
          collection,
          recordId: id,
          summary: summarize(record),
          client,
        },
        now,
      ),
    });
    return record;
  }

  async setVisibility<C extends CollectionName>(collection: C, id: string, visibility: AnyRecord['visibility'], client?: string): Promise<CollectionRecordMap[C] | null> {
    const existing = await this.getRecord(collection, id);
    if (!existing) return null;
    const now = Date.now();
    const record = { ...existing, visibility, updatedAt: now } as CollectionRecordMap[C];
    await this.store.update({
      ...this.writeUpdates(collection, record),
      ...this.auditUpdate({ action: visibility, collection, recordId: id, summary: summarize(record), client }, now),
    });
    return record;
  }

  async remove(collection: CollectionName, id: string, client?: string): Promise<boolean> {
    const existing = await this.getRecord(collection, id);
    if (!existing) return false;
    await this.store.update({
      [`content/${collection}/${id}`]: null,
      [`public/${collection}/${id}`]: null,
      'public/meta/updatedAt': Date.now(),
      ...this.auditUpdate({ action: 'delete', collection, recordId: id, summary: summarize(existing), client }),
    });
    return true;
  }

  async getLeagueConfig(): Promise<LeagueConfig> {
    const stored = await this.store.get<LeagueConfig>('content/leagueConfig');
    return { ...leagueConfigInput.parse(stored ?? {}), updatedAt: stored?.updatedAt };
  }

  async saveLeagueConfig(input: unknown, client?: string): Promise<LeagueConfig> {
    const now = Date.now();
    const config = { ...leagueConfigInput.parse(input), updatedAt: now };
    await this.store.update({
      'content/leagueConfig': config,
      'public/leagueConfig': config,
      'public/meta/updatedAt': now,
      ...this.auditUpdate({ action: 'update', collection: 'leagueConfig', client }, now),
    });
    return config;
  }

  async getSettings(): Promise<SiteSettings> {
    const stored = await this.store.get<SiteSettings>('content/settings');
    return { ...siteSettingsInput.parse(stored ?? {}), updatedAt: stored?.updatedAt };
  }

  async saveSettings(input: unknown, client?: string): Promise<SiteSettings> {
    const now = Date.now();
    const settings = { ...siteSettingsInput.parse(input), updatedAt: now };
    await this.store.update({
      'content/settings': settings,
      'public/settings': settings,
      'public/meta/updatedAt': now,
      ...this.auditUpdate({ action: 'update', collection: 'settings', client }, now),
    });
    return settings;
  }

  /**
   * Rebuilds the entire public tree from content. Run daily (and on demand
   * from the admin dashboard) so expired items also leave the public tree.
   */
  async republishAll(client?: string): Promise<number> {
    const updates: Record<string, unknown> = {};
    const today = todayInSchool();
    let count = 0;
    for (const collection of Object.keys(collectionSchemas) as CollectionName[]) {
      const records = (await this.store.get<Record<string, AnyRecord>>(`content/${collection}`)) ?? {};
      const pub: Record<string, unknown> = {};
      for (const [id, rec] of Object.entries(records)) {
        const p = toPublic(collection, rec as never, today);
        if (p) {
          pub[id] = p;
          count++;
        }
      }
      updates[`public/${collection}`] = Object.keys(pub).length ? pub : null;
    }
    updates['public/leagueConfig'] = await this.store.get('content/leagueConfig');
    updates['public/settings'] = await this.store.get('content/settings');
    updates['public/meta'] = { updatedAt: Date.now(), schemaVersion: SCHEMA_VERSION };
    await this.store.update({ ...updates, ...this.auditUpdate({ action: 'republish', summary: `${count} published records`, client }) });
    return count;
  }
}

function summarize(record: AnyRecord): string {
  const r = record as unknown as Record<string, unknown>;
  // Never copy student personal data into the audit log; titles/names of content are fine.
  const label = r.title ?? r.nameAr ?? r.name ?? r.displayName ?? r.businessName ?? r.id;
  return String(label).slice(0, 80);
}
