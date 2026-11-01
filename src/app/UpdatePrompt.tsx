import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SW_UPDATE_EVENT } from '../lib/pwa';

export function UpdatePrompt() {
  const [worker, setWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const w = (e as CustomEvent<ServiceWorker>).detail;
      // The TV display updates itself without asking; everyone else gets a prompt.
      if (window.location.pathname.startsWith('/display')) w.postMessage('SKIP_WAITING');
      else setWorker(w);
    };
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
  }, []);

  if (!worker) return null;
  return (
    <div className="update-prompt" role="status">
      <span>يتوفّر إصدار أحدث من الموقع.</span>
      <button type="button" className="btn btn-accent btn-sm" onClick={() => worker.postMessage('SKIP_WAITING')}>
        <RefreshCw aria-hidden="true" />
        تحديث الآن
      </button>
    </div>
  );
}
