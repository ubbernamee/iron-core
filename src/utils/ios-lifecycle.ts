import { App } from '@capacitor/app';

export type LifecycleEventType = 'active' | 'background' | 'hidden';
export type LifecycleListener = (state: LifecycleEventType) => void;

/**
 * Unified lifecycle hook for pausing 3D rendering, camera streams,
 * and heavy loops when the iPhone app goes to background or a tab is hidden.
 */
export function subscribeAppLifecycle(listener: LifecycleListener): () => void {
  let isDisposed = false;
  let removeNativeListener: (() => void) | undefined;

  const notify = (next: LifecycleEventType) => {
    if (!isDisposed) {
      listener(next);
    }
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      notify('hidden');
    } else {
      notify('active');
    }
  };

  const handlePageHide = () => {
    notify('background');
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);

  App.addListener('appStateChange', ({ isActive }) => {
    notify(isActive ? 'active' : 'background');
  })
    .then((handle) => {
      if (isDisposed) {
        handle.remove().catch(() => {});
      } else {
        removeNativeListener = () => {
          handle.remove().catch(() => {});
        };
      }
    })
    .catch(() => {
      // Fallback to browser visibility/pagehide events when native plugin is unavailable
    });

  return () => {
    isDisposed = true;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
    if (removeNativeListener) {
      removeNativeListener();
    }
  };
}
