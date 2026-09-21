import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Trash2, EllipsisVertical, Copy, X } from 'lucide-react';
import { useVellum } from '../context/VellumContext';
import { getUniqueSelector } from '../core/selectors';
import { setAnchorName } from '../core/anchors';
import { isElementHidden } from '../core/visibility';
import { useDisplayToggle } from '../hooks/useDisplayToggle';
import { getAppliedStylesText, collectCascadeSources } from '../core/elementStyles';
import { describeElement } from '../core/describeElement';
import { transformSnippetWithContext } from '../core/reference/context';
import { formatAnnotationBlock } from '../core/clipboardContext';
import { Button, PopoverMenu, Textarea, Tooltip } from '../common';
import popoverStyles from '../styles/popover.module.css';
import { TagPicker } from './TagPicker';
import styles from './AnnotationPopover.module.css';
import type { CommentAnnotation } from '../types/vellum';

export function AnnotationPopover() {
  const { state, dispatch, composedFilters, pathname } = useVellum();
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editingAnnotation = state.editingAnnotationId
    ? (state.annotations.find(
        (a): a is CommentAnnotation =>
          a.id === state.editingAnnotationId && a.kind === 'comment',
      ) ?? null)
    : null;

  const visible =
    state.mode === 'annotating' &&
    !!state.selectedElement &&
    !isElementHidden(state.selectedElement);
  useDisplayToggle(ref, visible);

  useEffect(() => {
    if (visible) {
      setText(editingAnnotation?.text ?? '');
      setSelectedTagId(editingAnnotation?.tag ?? null);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setText('');
      setSelectedTagId(null);
      setMenuOpen(false);
      setCopySuccess(false);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    }
  }, [visible, editingAnnotation]);

  // Clean up copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyHTML = async () => {
    if (!state.selectedElement) return;
    try {
      const shallowTag = state.selectedElement.cloneNode(false) as HTMLElement;
      const context = await transformSnippetWithContext(
        state.selectedElement,
        composedFilters,
      );
      const tagLabel = selectedTagId
        ? state.tags.find(t => t.id === selectedTagId)?.label
        : undefined;
      const block = formatAnnotationBlock(
        text.trim(),
        tagLabel,
        context.trim(),
      );
      const htmlBlock = '```html\n' + shallowTag.outerHTML + '\n```';
      const output = [htmlBlock, block].filter(Boolean).join('\n\n');
      await navigator.clipboard.writeText(output);
    } catch {
      /* clipboard unavailable */
    }
    setMenuOpen(false);
  };

  const handleCopyStyles = async () => {
    if (!state.selectedElement) return;
    try {
      const applied = getAppliedStylesText(collectCascadeSources(state.selectedElement));
      const selector = describeElement(state.selectedElement, {
        detail: 'medium',
        filters: composedFilters,
      });
      const indentedBody = applied
        .split('\n')
        .map(line => (line ? '  ' + line : line))
        .join('\n');
      const ruleBlock = `${selector} {\n${indentedBody}\n}`;
      const context = await transformSnippetWithContext(
        state.selectedElement,
        composedFilters,
      );
      const tagLabel = selectedTagId
        ? state.tags.find(t => t.id === selectedTagId)?.label
        : undefined;
      const block = formatAnnotationBlock(
        text.trim(),
        tagLabel,
        context.trim(),
      );
      const cssBlock = '```css\n' + ruleBlock + '\n```';
      const output = [cssBlock, block].filter(Boolean).join('\n\n');
      await navigator.clipboard.writeText(output);
    } catch {
      /* clipboard unavailable */
    }
    setMenuOpen(false);
  };

  const handleCopyContext = async () => {
    if (!state.selectedElement) return;
    try {
      const context = await transformSnippetWithContext(
        state.selectedElement,
        composedFilters,
      );
      const tagLabel = selectedTagId
        ? state.tags.find(t => t.id === selectedTagId)?.label
        : undefined;
      await navigator.clipboard.writeText(
        formatAnnotationBlock(text.trim(), tagLabel, context.trim()),
      );
      setCopySuccess(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopySuccess(false), 1400);
    } catch {
      /* */
    }
  };

  const handleSave = () => {
    if (!state.selectedElement) return;

    if (editingAnnotation) {
      dispatch({
        type: 'UPDATE_ANNOTATION',
        id: editingAnnotation.id,
        text: text.trim(),
        tag: selectedTagId ?? undefined,
      });
    } else {
      // Create new annotation
      const id = crypto.randomUUID().slice(0, 8);
      const elementSelector = getUniqueSelector(state.selectedElement);

      setAnchorName(state.selectedElement, `--vellum-dot-${id}`);

      dispatch({
        type: 'ADD_ANNOTATION',
        annotation: {
          id,
          kind: 'comment',
          elementSelector,
          text: text.trim(),
          timestamp: Date.now(),
          tag: selectedTagId ?? undefined,
          route: pathname,
        },
      });
    }
  };

  const handleCancel = () => {
    dispatch({ type: 'CANCEL_ANNOTATION' });
  };

  const handleDelete = () => {
    if (!editingAnnotation) return;
    dispatch({ type: 'DELETE_ANNOTATION', id: editingAnnotation.id });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  const elementDescription = useMemo(() => {
    if (!state.selectedElement) return '';
    const tag = state.selectedElement.tagName.toLowerCase();
    return state.selectedComponentName
      ? `${state.selectedComponentName}.${tag}`
      : tag;
  }, [state.selectedElement, state.selectedComponentName]);

  return (
    <div
      ref={ref}
      className={clsx(styles.popover, popoverStyles.popoverBottom)}
      data-vellum
    >
      <div className={styles.body}>
        <div className={styles.elementNameRow}>
          <span className={styles.elementName}>{elementDescription}</span>
          <div className={styles.elementNameActions}>
            <Tooltip
              text={copySuccess ? 'Copied!' : 'Copy element context'}
              forceShow={copySuccess}
            >
              <Button
                variant={copySuccess ? 'secondary' : 'ghost'}
                intent={copySuccess ? 'success' : 'info'}
                size="icon"
                onClick={handleCopyContext}
                aria-label="Copy element context"
              >
                <Copy size={14} />
              </Button>
            </Tooltip>
            <PopoverMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              content={
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    align="start"
                    onClick={handleCopyHTML}
                  >
                    Copy HTML
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    align="start"
                    onClick={handleCopyStyles}
                  >
                    Copy styles
                  </Button>
                </>
              }
            >
              <Button variant="ghost" size="icon" aria-label="Element actions">
                <EllipsisVertical size={14} />
              </Button>
            </PopoverMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              aria-label="Close annotation"
            >
              <X size={14} />
            </Button>
          </div>
        </div>
        <Textarea
          ref={inputRef}
          placeholder="Add annotation..."
          rows={3}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.actions}>
          <TagPicker
            selectedTagId={selectedTagId}
            onSelectTag={setSelectedTagId}
            visible={visible}
          />
          <div className={styles.actionButtons}>
            {editingAnnotation && (
              <Button
                variant="ghost"
                intent="danger"
                size="icon"
                onClick={handleDelete}
              >
                <Trash2 size={14} />
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleSave}>
              {editingAnnotation ? 'Update' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
