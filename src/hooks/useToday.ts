import { useEffect, useState } from 'react';
import { todayInSchool } from '../../shared/dates';

/** Today's date (Asia/Jerusalem), re-evaluated each minute so midnight rollovers apply. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayInSchool());
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = todayInSchool();
      setToday((prev) => (prev === t ? prev : t));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

/** Current time ticking every `intervalMs`. Only use in small leaf components. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — مجلس الطلاب، مدرسة عمال` : 'مجلس الطلاب — مدرسة عمال، الطيبة';
  }, [title]);
}

/** localStorage with a safe fallback (private mode, blocked storage). */
export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? ({ ...initial, ...JSON.parse(raw) } as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage unavailable: keep in memory only */
    }
  };
  return [value, set];
}
