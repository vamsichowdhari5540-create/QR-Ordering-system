import { useEffect, useState } from 'react';

// Chrome/Android fire this once install criteria (manifest + registered SW)
// are met, then leave it to the page to decide when/how to offer install —
// we hold onto it and only fire it from an explicit button tap.
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    function handler(e) {
      e.preventDefault();
      setDeferred(e);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function promptInstall() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return { canInstall: !!deferred, promptInstall };
}
