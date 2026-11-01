/**
 * Service worker registration (production builds only).
 * When a new version is installed, an "update available" event is raised and
 * the UpdatePrompt lets the user reload into it — never mid-action.
 */
export const SW_UPDATE_EVENT = 'amal:sw-update';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const notify = (worker: ServiceWorker) => window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: worker }));
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) notify(installing);
          });
        });
        // Check for updates periodically (kiosk TVs stay open for days).
        window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      })
      .catch(() => undefined);

    // Reload only when an existing controller is replaced (a real update) —
    // never on the very first install, which would wipe what the visitor is typing.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    });
  });
}
