import { useEffect, useRef, useState } from 'react';

const EXIT_WINDOW_MS = 2000;

// The staff app runs the physical Android back button through the TWA's
// normal browser history — with no history entries of our own, a single
// back press pops straight out from under a dashboard (e.g. to the login
// screen it arrived from, or straight out of the app). This hook gives a
// top-level staff route two behaviors instead:
//  - while an overlay (a table's ledger panel) is open, back closes it
//    rather than leaving the page
//  - at the dashboard root, back needs a second press within 2s to exit —
//    the "press back again to exit" convention Android users expect.
//
// `isOverlayOpen` must be a ref (not a plain boolean) so the popstate
// listener — attached once on mount — always reads the current value.
export function useBackGuard({ isOverlayOpenRef, closeOverlay }) {
  const armedRef = useRef(false);
  const [showExitWarning, setShowExitWarning] = useState(false);

  // closeOverlay is typically a fresh arrow function every render — read it
  // through a ref so the effect below can stay mount-once. Re-running it on
  // every render (dashboards poll every few seconds) would silently push a
  // new history entry each time, defeating the two-press-to-exit count.
  const closeOverlayRef = useRef(closeOverlay);
  closeOverlayRef.current = closeOverlay;

  useEffect(() => {
    // Claim one history entry so the very first back press is always ours
    // to intercept, no matter how this screen was reached.
    window.history.pushState({ fpGuard: true }, '');

    function handlePop() {
      if (isOverlayOpenRef.current) {
        closeOverlayRef.current();
        window.history.pushState({ fpGuard: true }, '');
        return;
      }
      if (!armedRef.current) {
        armedRef.current = true;
        setShowExitWarning(true);
        window.history.pushState({ fpGuard: true }, '');
        setTimeout(() => {
          armedRef.current = false;
          setShowExitWarning(false);
        }, EXIT_WINDOW_MS);
        return;
      }
      // Second press within the window — don't re-claim the entry, so the
      // pop actually goes through and the app exits.
    }

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { showExitWarning };
}
