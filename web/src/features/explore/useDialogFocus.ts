import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour of a modal dialog:
 *   - focus moves into the dialog when it opens
 *   - Tab and Shift+Tab cycle inside the dialog instead of escaping behind it
 *   - Escape calls onClose
 *   - when the dialog closes, focus returns to the element that opened it
 */
export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const elementFocusedBeforeOpening = document.activeElement as HTMLElement | null;

    const listFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    listFocusableElements()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = listFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      elementFocusedBeforeOpening?.focus();
    };
  }, [dialogRef, onClose]);
}
