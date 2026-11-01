/**
 * Public data provider — one live subscription to the published tree.
 *  - production: Firebase Realtime Database `public/` (onValue), loaded lazily.
 *  - demo: server-sent events from this server's local demo store.
 * There is no fallback between the two: a failed production connection is
 * shown as an error, never replaced by demo data.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicTree } from '../../shared/schemas';
import { api, type PublicClientConfig } from './api';
import { getFirebaseDatabase } from './firebase-client';

export type LoadState = 'loading' | 'ready' | 'error';

interface PublicDataValue {
  state: LoadState;
  data: PublicTree;
  error: string | null;
  config: PublicClientConfig | null;
  /** Server-reported data mode; null until /api/config answers. */
  mode: PublicClientConfig['mode'] | null;
}

const PublicDataContext = createContext<PublicDataValue | null>(null);

async function subscribeFirebase(cfg: Record<string, string>, onData: (t: PublicTree) => void, onError: (m: string) => void): Promise<() => void> {
  const [db, { ref, onValue }] = await Promise.all([getFirebaseDatabase(cfg), import('firebase/database')]);
  return onValue(
    ref(db, 'public'),
    (snap) => onData((snap.val() ?? {}) as PublicTree),
    () => onError('تعذّر الاتصال بقاعدة البيانات. تحقّق من الاتصال وحاول لاحقًا.'),
  );
}

function subscribeDemo(onData: (t: PublicTree) => void, onError: (m: string) => void): () => void {
  const es = new EventSource('/api/public/stream');
  let gotData = false;
  es.addEventListener('snapshot', (ev) => {
    gotData = true;
    onData(JSON.parse((ev as MessageEvent<string>).data) as PublicTree);
  });
  es.onerror = () => {
    // EventSource reconnects by itself; surface an error only if nothing ever arrived.
    if (!gotData) onError('تعذّر تحميل البيانات من الخادم.');
  };
  return () => es.close();
}

export function PublicDataProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicClientConfig | null>(null);
  const [data, setData] = useState<PublicTree>({});
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const onData = (t: PublicTree) => {
      if (cancelled) return;
      setData(t);
      setState('ready');
      setError(null);
    };
    const onError = (m: string) => {
      if (cancelled) return;
      setError(m);
      setState((s) => (s === 'ready' ? s : 'error'));
    };
    api<PublicClientConfig>('/api/config')
      .then(async (cfg) => {
        if (cancelled) return;
        setConfig(cfg);
        if (cfg.mode === 'production') {
          if (!cfg.firebase) return onError('إعدادات قاعدة البيانات غير مكتملة.');
          const off = await subscribeFirebase(cfg.firebase, onData, onError);
          if (cancelled) off();
          else unsubscribe = off;
        } else {
          unsubscribe = subscribeDemo(onData, onError);
        }
      })
      .catch(() => onError('تعذّر الوصول إلى الخادم. تحقّق من اتصال الإنترنت.'));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<PublicDataValue>(() => ({ state, data, error, config, mode: config?.mode ?? null }), [state, data, error, config]);
  return <PublicDataContext.Provider value={value}>{children}</PublicDataContext.Provider>;
}

export function usePublicData(): PublicDataValue {
  const ctx = useContext(PublicDataContext);
  if (!ctx) throw new Error('usePublicData must be used inside PublicDataProvider');
  return ctx;
}
