import { useCallback, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Selecting one column of a chart, by mouse or keyboard.
 *
 * The columns form one tab stop (roving tabindex): Tab enters the chart on
 * the selected column (or the first), the arrow keys, Home and End move
 * between columns, Enter or Space selects, and Escape clears the selection.
 * Clicking the selected column again clears it too.
 */
export function useColumnSelection(columnCount: number) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const columnElements = useRef<Array<HTMLElement | null>>([]);

  const clearSelection = useCallback(() => setSelectedIndex(null), []);

  const moveFocus = (index: number) => {
    const target = Math.max(0, Math.min(columnCount - 1, index));
    columnElements.current[target]?.focus();
  };

  function handleKeyDown(event: KeyboardEvent<HTMLElement>, index: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        event.preventDefault();
        moveFocus(columnCount - 1);
        break;
      case 'Escape':
        if (selectedIndex !== null) {
          // Clears the selection first; a second Escape reaches the dialog and closes it.
          event.preventDefault();
          event.stopPropagation();
          setSelectedIndex(null);
        }
        break;
    }
  }

  const tabStopIndex = selectedIndex ?? focusedIndex ?? 0;

  /** Props for the element of column `index` (a button). */
  function columnProps(index: number) {
    return {
      ref: (element: HTMLElement | null) => {
        columnElements.current[index] = element;
      },
      tabIndex: index === tabStopIndex ? 0 : -1,
      'aria-pressed': selectedIndex === index,
      onClick: () => setSelectedIndex((current) => (current === index ? null : index)),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleKeyDown(event, index),
      onFocus: () => setFocusedIndex(index),
      onBlur: () => setFocusedIndex((current) => (current === index ? null : current)),
    };
  }

  return { selectedIndex, focusedIndex, clearSelection, columnProps };
}
