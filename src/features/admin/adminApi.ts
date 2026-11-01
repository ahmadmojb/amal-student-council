import { api } from '../../lib/api';
import type { CollectionName, CollectionRecordMap, Visibility } from '../../../shared/schemas';

export const adminApi = {
  list: <C extends CollectionName>(c: C) => api<CollectionRecordMap[C][]>(`/api/admin/content/${c}`),
  create: <C extends CollectionName>(c: C, body: unknown) => api<CollectionRecordMap[C]>(`/api/admin/content/${c}`, { method: 'POST', json: body }),
  update: <C extends CollectionName>(c: C, id: string, body: unknown) => api<CollectionRecordMap[C]>(`/api/admin/content/${c}/${encodeURIComponent(id)}`, { method: 'PUT', json: body }),
  setVisibility: <C extends CollectionName>(c: C, id: string, visibility: Visibility) =>
    api<CollectionRecordMap[C]>(`/api/admin/content/${c}/${encodeURIComponent(id)}/visibility`, { method: 'PATCH', json: { visibility } }),
  remove: (c: CollectionName, id: string) => api<void>(`/api/admin/content/${c}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  upload: async (file: File, kind: 'image' | 'attachment' = 'image') => {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    return api<{ url: string; contentType: string; width?: number; height?: number }>('/api/admin/uploads', { method: 'POST', body: fd });
  },
};

export const VISIBILITY_LABEL: Record<Visibility, string> = { draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };
export const VISIBILITY_BADGE: Record<Visibility, string> = { draft: 'badge-outline', published: 'badge-success', archived: 'badge' };
