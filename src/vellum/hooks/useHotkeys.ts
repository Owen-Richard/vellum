import { useEffect, useRef } from 'react';
import type { VellumState } from '../types/vellum';
import type { useVellumActions } from './useVellumActions';

type VellumActions = ReturnType<typeof useVellumActions>;

export function useHotkeys(state: VellumState, actions: VellumActions) {
  // Use a ref so the listener always reads fresh actions without re-registering
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Esc: exit/cancel selection mode (works even when typing in a text field)
      if (e.key === 'Escape' && stateRef.current.mode !== 'idle') {
        actionsRef.current.cancelMode();
        return;
      }

      // Single-key shortcuts — skip when typing or when modifier keys are held
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      switch (e.key.toLowerCase()) {
        case 'h':
          actionsRef.current.toggleDots();
          break;
        case 'c':
          await actionsRef.current.copyAnnotations();
          break;
        case 'x':
          actionsRef.current.clearAnnotations();
          break;
        case 'l':
          actionsRef.current.toggleSidebar();
          break;
        case 's':
          actionsRef.current.toggleSelect();
          break;
        case '/':
          actionsRef.current.toggleSettings();
          break;
        case '1':
          actionsRef.current.setSidebarTab('annotations');
          break;
        case '2':
          actionsRef.current.setSidebarTab('editor');
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // Registered once; always reads fresh state/actions via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
