import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { readStored } from '../../extension/storage';

type EdgePos = {
  anchor: { v: 'top' | 'bottom'; h: 'left' | 'right' };
  offset: { x: number; y: number };
};

function toEdgePos(x: number, y: number, w: number, h: number): EdgePos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  return {
    anchor: {
      h: centerX < vw / 2 ? 'left' : 'right',
      v: centerY < vh / 2 ? 'top' : 'bottom',
    },
    offset: {
      x: centerX < vw / 2 ? x : vw - x - w,
      y: centerY < vh / 2 ? y : vh - y - h,
    },
  };
}

function clampAndResolve(x: number, y: number, w: number, h: number): EdgePos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampedX = Math.max(0, Math.min(x, vw - w));
  const clampedY = Math.max(0, Math.min(y, vh - h));
  return toEdgePos(clampedX, clampedY, w, h);
}

export function useDrag(ref: React.RefObject<HTMLElement | null>, onDragStart?: () => void, storageKey = 'vellum-toolbar-pos') {
  const [edgePos, setEdgePos] = useLocalStorage<EdgePos | null>(storageKey, null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ offsetX: 0, offsetY: 0 });
  const initializedRef = useRef(false);

  // On mount: restore saved position (clamped to current viewport) or set default
  useLayoutEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const saved = readStored<EdgePos | null>(storageKey, null);

    if (saved) {
      // Clamp restored position in case the viewport changed since last visit
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const x = saved.anchor.h === 'left' ? saved.offset.x : vw - saved.offset.x - rect.width;
      const y = saved.anchor.v === 'top' ? saved.offset.y : vh - saved.offset.y - rect.height;
      setEdgePos(clampAndResolve(x, y, rect.width, rect.height));
    } else {
      setEdgePos({
        anchor: { v: 'bottom', h: 'left' },
        offset: {
          x: Math.round((window.innerWidth - rect.width) / 2),
          y: 4,
        },
      });
    }
  }, [ref, setEdgePos]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - dragOffset.current.offsetX;
      const y = e.clientY - dragOffset.current.offsetY;
      setEdgePos(clampAndResolve(x, y, rect.width, rect.height));
    };

    const handleUp = () => setIsDragging(false);

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging, ref]);

  // Re-clamp position when the viewport resizes so the toolbar stays visible
  useEffect(() => {
    const handleResize = () => {
      setEdgePos(prev => {
        if (!prev) return prev;
        const el = ref.current;
        if (!el) return prev;
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Convert edge-relative offset to absolute x/y
        const x = prev.anchor.h === 'left' ? prev.offset.x : vw - prev.offset.x - rect.width;
        const y = prev.anchor.v === 'top' ? prev.offset.y : vh - prev.offset.y - rect.height;

        // Clamp to viewport
        const clampedX = Math.max(0, Math.min(x, vw - rect.width));
        const clampedY = Math.max(0, Math.min(y, vh - rect.height));

        // Only reset EdgePos if clamping occurred (element hit an edge)
        if (clampedX === x && clampedY === y) return prev;

        return toEdgePos(clampedX, clampedY, rect.width, rect.height);
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [ref]);

  const handleDragStart = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !edgePos) return;
    e.preventDefault();
    onDragStart?.();
    const rect = el.getBoundingClientRect();
    dragOffset.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    setIsDragging(true);
  };

  const posStyle: React.CSSProperties | undefined = edgePos
    ? {
        [edgePos.anchor.v]: edgePos.offset.y,
        [edgePos.anchor.h]: edgePos.offset.x,
        [edgePos.anchor.v === 'top' ? 'bottom' : 'top']: 'auto',
        [edgePos.anchor.h === 'left' ? 'right' : 'left']: 'auto',
        transform: 'none',
      }
    : { visibility: 'hidden' as const };

  return { isDragging, handleDragStart, posStyle };
}
