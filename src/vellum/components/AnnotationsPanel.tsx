import { useMemo, useRef, useEffect, type CSSProperties } from 'react';
import clsx from 'clsx';
import { Pencil, ExternalLink } from 'lucide-react';
import { useVellum } from '../context/VellumContext';
import { useAnnotationInteraction } from '../hooks/useAnnotationInteraction';
import { Badge, Button, Tooltip } from '../common';
import { removeAnchorName } from '../core/anchors';
import { findElementBySelector } from '../core/selectors';
import { describeElement } from '../core/describeElement';
import { summarizeCssEdits } from '../core/cssEdits';
import {
  resolveTagColor,
  isExcludedByTagFilter,
  contrastTextColor,
  UNTAGGED_FILTER_ID,
} from '../core/tags';
import { useTagColorMap } from '../hooks/useTagColorMap';
import styles from './AnnotationsPanel.module.css';

interface FilterPillProps {
  label: string;
  active: boolean;
  /** Dot color shown to the left of the label. Omitted = no dot (e.g. "All"). */
  dotColor?: string;
  /** Inline style applied when `active`. Lets each variant tint itself. */
  activeStyle?: CSSProperties;
  onClick: () => void;
}

function FilterPill({ label, active, dotColor, activeStyle, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      className={clsx(styles.filterPill, active && styles.filterPillActive)}
      style={active ? activeStyle : undefined}
      onClick={onClick}
    >
      {dotColor && (
        <span
          className={styles.filterDot}
          style={{ backgroundColor: dotColor }}
        />
      )}
      {label}
    </button>
  );
}

export function AnnotationsPanel() {
  const { state, dispatch, displayFilters, treeRevision, pathname, navigate } =
    useVellum();
  const { handleHover, handleClick } = useAnnotationInteraction();

  // Keep a ref to the latest hovered element so the unmount cleanup can access it
  const hoveredRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    hoveredRef.current = state.hoveredElement;
  }, [state.hoveredElement]);

  // Remove hover anchor if the panel unmounts while a list item is hovered
  useEffect(() => {
    return () => {
      if (hoveredRef.current) {
        removeAnchorName(hoveredRef.current, '--vellum-hover');
        dispatch({ type: 'HOVER_ELEMENT', element: null });
      }
    };
  }, [dispatch]);

  const usedTagIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of state.annotations) {
      if (a.kind === 'comment' && a.tag) ids.add(a.tag);
    }
    return ids;
  }, [state.annotations]);

  const visibleTags = useMemo(
    () => state.tags.filter(t => usedTagIds.has(t.id)),
    [state.tags, usedTagIds],
  );

  const hasActiveFilter = state.activeTagFilter.length > 0;
  const tagColorMap = useTagColorMap(state.tags);
  const hasUntagged = useMemo(
    () => state.annotations.some(a => a.kind === 'comment' && !a.tag),
    [state.annotations],
  );
  const showFilterBar =
    state.annotations.length > 0 && (visibleTags.length > 0 || hasUntagged);

  const sortedAnnotations = useMemo(() => {
    if (!hasActiveFilter) return state.annotations;
    return [...state.annotations].sort((a, b) => {
      const aExcluded = isExcludedByTagFilter(a, state.activeTagFilter);
      const bExcluded = isExcludedByTagFilter(b, state.activeTagFilter);
      if (!aExcluded && bExcluded) return -1;
      if (aExcluded && !bExcluded) return 1;
      return 0;
    });
  }, [state.annotations, state.activeTagFilter, hasActiveFilter]);

  // Map of annotation id -> resolved anchor element (or null when not on page).
  // Recomputed when annotations change, the route changes, or the fiber tree updates.
  // pathname & treeRevision intentionally included to retrigger DOM lookups.
  const elementMap = useMemo(() => {
    const map = new Map<string, HTMLElement | null>();
    for (const a of state.annotations) {
      map.set(a.id, findElementBySelector(a.elementSelector));
    }
    return map;
  }, [state.annotations, pathname, treeRevision]);

  return (
    <>
      {showFilterBar && (
        <div className={styles.filterBar}>
          <FilterPill
            label="All"
            active={!hasActiveFilter}
            onClick={() => dispatch({ type: 'SET_TAG_FILTER', tagId: null })}
          />
          {hasUntagged && (
            <FilterPill
              label="Untagged"
              active={state.activeTagFilter.includes(UNTAGGED_FILTER_ID)}
              dotColor="var(--vellum-accent)"
              activeStyle={{
                backgroundColor: 'var(--vellum-accent-alpha)',
                color: 'var(--vellum-accent)',
              }}
              onClick={() =>
                dispatch({
                  type: 'SET_TAG_FILTER',
                  tagId: UNTAGGED_FILTER_ID,
                })
              }
            />
          )}
          {visibleTags.map(tag => (
            <FilterPill
              key={tag.id}
              label={tag.label}
              active={state.activeTagFilter.includes(tag.id)}
              dotColor={tag.color}
              activeStyle={{
                // 26 hex ≈ 15% alpha — matches the visual weight of
                // --vellum-accent-alpha used by the Untagged variant.
                backgroundColor: `${tag.color}26`,
                color: tag.color,
              }}
              onClick={() =>
                dispatch({ type: 'SET_TAG_FILTER', tagId: tag.id })
              }
            />
          ))}
        </div>
      )}
      {state.annotations.length === 0 ? (
        <p className={styles.empty}>No annotations yet.</p>
      ) : (
        <ul className={styles.list}>
          {sortedAnnotations.map((a, index) => {
            const excluded = isExcludedByTagFilter(a, state.activeTagFilter);
            const tagColor =
              a.kind === 'comment' ? resolveTagColor(tagColorMap, a) : null;
            const el = elementMap.get(a.id) ?? null;
            const visibleOnPage = el !== null;
            const route = a.kind === 'comment' ? a.route : undefined;
            const canNavigate = !!route && route !== pathname;
            return (
              <li
                key={a.id}
                className={clsx(
                  styles.item,
                  state.editingAnnotationId === a.id && styles.active,
                  excluded && styles.itemFiltered,
                  !visibleOnPage && styles.itemNotVisible,
                )}
                onPointerEnter={
                  excluded || !visibleOnPage
                    ? undefined
                    : () => handleHover(a.id, true)
                }
                onPointerLeave={
                  excluded || !visibleOnPage
                    ? undefined
                    : () => handleHover(a.id, false)
                }
                onClick={
                  excluded || !visibleOnPage
                    ? undefined
                    : () => handleClick(a.id)
                }
              >
                {canNavigate && (
                  <Tooltip text={`Go to ${route}`} className={styles.navigateBtn}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Navigate to ${route}`}
                      onClick={e => {
                        e.stopPropagation();
                        if (route) navigate(route);
                      }}
                    >
                      <ExternalLink size={12} />
                    </Button>
                  </Tooltip>
                )}
                <span className={styles.selector}>
                  {el
                    ? describeElement(el, {
                        detail: 'medium',
                        filters: displayFilters,
                      })
                    : a.elementSelector}
                </span>
                <span className={styles.textRow}>
                  <Badge
                    variant="index"
                    style={{
                      backgroundColor: tagColor || 'var(--vellum-accent)',
                      color: tagColor
                        ? contrastTextColor(tagColor)
                        : '#ffffff',
                    }}
                  >
                    {index + 1}
                  </Badge>
                  {a.kind === 'comment' ? (
                    <span className={styles.text}>{a.text}</span>
                  ) : (
                    <span className={clsx(styles.text, styles.cssEditText)}>
                      <Pencil size={11} className={styles.cssEditIcon} />
                      {summarizeCssEdits(a.edits)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
