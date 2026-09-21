import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { VellumState, VellumAction, SidebarTab } from '../types/vellum';
import type { ComposedFilters } from '../core/filters/types';
import { IDENTITY_FILTERS } from '../core/filters/compose';
import { clipboardContext } from '../core/clipboardContext';
import { copyText } from '../../extension/storage';

export function useVellumActions(
  state: VellumState,
  dispatch: Dispatch<VellumAction>,
  composedFilters: ComposedFilters = IDENTITY_FILTERS,
) {
  const toggleSelect = useCallback(() => {
    dispatch({ type: 'SET_MODE', mode: state.mode === 'selecting' ? 'idle' : 'selecting' });
  }, [state.mode, dispatch]);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, [dispatch]);

  const toggleDots = useCallback(() => {
    dispatch({ type: 'TOGGLE_DOTS' });
  }, [dispatch]);

  const toggleSettings = useCallback(() => {
    dispatch({ type: 'TOGGLE_SETTINGS' });
  }, [dispatch]);

  const setSidebarTab = useCallback((tab: SidebarTab) => {
    dispatch({ type: 'SET_SIDEBAR_TAB', tab });
  }, [dispatch]);

  const toggleTheme = useCallback(() => {
    dispatch({ type: 'TOGGLE_THEME' });
  }, [dispatch]);

  const toggleClearOnCopy = useCallback(() => {
    dispatch({ type: 'TOGGLE_CLEAR_ON_COPY' });
  }, [dispatch]);

  const toggleFilters = useCallback(() => {
    dispatch({ type: 'TOGGLE_FILTERS' });
  }, [dispatch]);

  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyAnnotations = useCallback(async () => {
    if (state.annotations.length === 0) return;
    try {
      await copyText(await clipboardContext(state.annotations, composedFilters, state.tags));
      setCopySuccess(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopySuccess(false), 1400);
      if (state.clearOnCopy) {
        dispatch({ type: 'CLEAR_ANNOTATIONS' });
      }
    } catch {
      // copyText displays the failure. Never clear annotations on failure.
    }
  }, [state.annotations, state.tags, state.clearOnCopy, dispatch, composedFilters]);

  // Two-step delete: first call arms, second call within 3s confirms
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAnnotations = useCallback(() => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      deleteTimerRef.current = setTimeout(() => setDeleteArmed(false), 3000);
    } else {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setDeleteArmed(false);
      dispatch({ type: 'CLEAR_ANNOTATIONS' });
    }
  }, [deleteArmed, dispatch]);

  const cancelMode = useCallback(() => {
    if (state.mode !== 'idle') {
      dispatch({ type: 'SET_MODE', mode: 'idle' });
    }
  }, [state.mode, dispatch]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  return {
    toggleSelect,
    toggleSidebar,
    toggleDots,
    toggleSettings,
    setSidebarTab,
    toggleTheme,
    toggleClearOnCopy,
    toggleFilters,
    copyAnnotations,
    copySuccess,
    clearAnnotations,
    deleteArmed,
    cancelMode,
  };
}
