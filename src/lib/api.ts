/** Centralised HTTP client for the server API. */
import type { PublicClientConfig } from '../../shared/api-types';

export type { PublicClientConfig };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get issues(): Array<{ path: string; message: string }> {
    return (this.body.issues as Array<{ path: string; message: string }>) ?? [];
  }
}

const FALLBACK_MESSAGE: Record<number, string> = {
  401: 'انتهت الجلسة. سجّل الدخول من جديد.',
  403: 'لا تملك صلاحية لهذا الإجراء.',
  404: 'العنصر غير موجود.',
  409: 'يوجد تعارض مع بيانات موجودة.',
  429: 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
};

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Required by the server's CSRF guard on every state-changing request.
  headers.set('x-amal-request', '1');
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...init, body, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم. تحقّق من اتصال الإنترنت.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.message === 'string' ? data.message : (FALLBACK_MESSAGE[res.status] ?? 'حدث خطأ غير متوقع.');
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}
