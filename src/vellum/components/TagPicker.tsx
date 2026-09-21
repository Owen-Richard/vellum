import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { useVellum } from '../context/VellumContext';
import { Button, Input, PopoverMenu } from '../common';
import { TAG_COLOR_PALETTE } from '../core/tags';
import type { AnnotationTag } from '../types/vellum';
import styles from './TagPicker.module.css';

interface TagPickerProps {
  selectedTagId: string | null;
  onSelectTag: (id: string | null) => void;
  visible: boolean;
}

export function TagPicker({
  selectedTagId,
  onSelectTag,
  visible,
}: TagPickerProps) {
  const { state, dispatch } = useVellum();
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagLabel, setEditingTagLabel] = useState('');

  const selectedTag = state.tags.find(t => t.id === selectedTagId) ?? null;

  // Reset internal state when popover visibility changes
  useEffect(() => {
    setTagDropdownOpen(false);
    setCreatingTag(false);
    setNewTagLabel('');
    setNewTagColor(null);
    setEditingTagId(null);
    setEditingTagLabel('');
  }, [visible]);

  const handleOpenChange = useCallback((open: boolean) => {
    setTagDropdownOpen(open);
    setCreatingTag(false);
    setNewTagLabel('');
    setNewTagColor(null);
    setEditingTagId(null);
    setEditingTagLabel('');
  }, []);

  const handleCreateTag = () => {
    const label = newTagLabel.trim();
    if (!label) return;
    const color =
      newTagColor ??
      TAG_COLOR_PALETTE[state.tags.length % TAG_COLOR_PALETTE.length];
    const tag: AnnotationTag = {
      id: crypto.randomUUID().slice(0, 8),
      label,
      color,
    };
    dispatch({ type: 'ADD_TAG', tag });
    onSelectTag(tag.id);
    setTagDropdownOpen(false);
    setCreatingTag(false);
    setNewTagLabel('');
    setNewTagColor(null);
  };

  const handleDeleteTag = (tagId: string) => {
    dispatch({ type: 'DELETE_TAG', id: tagId });
    if (selectedTagId === tagId) onSelectTag(null);
    setEditingTagId(null);
    setEditingTagLabel('');
  };

  const handleRenameTag = (tagId: string) => {
    const label = editingTagLabel.trim();
    if (!label) return;
    dispatch({ type: 'UPDATE_TAG', id: tagId, label });
    setEditingTagId(null);
    setEditingTagLabel('');
  };

  return (
    <div className={styles.tagRow}>
      <PopoverMenu
        open={tagDropdownOpen}
        onOpenChange={handleOpenChange}
        position="bottom"
        className={styles.tagDropdown}
        content={
          <>
            {state.tags.map(tag => (
              <div key={tag.id} className={styles.tagOptionRow}>
                {editingTagId === tag.id ? (
                  <div
                    className={styles.tagEditRow}
                    style={{ backgroundColor: `${tag.color}0F` }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <div className={styles.tagEditInputWrap}>
                        <Input
                          value={editingTagLabel}
                          onChange={e => setEditingTagLabel(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                              handleRenameTag(tag.id);
                            if (e.key === 'Escape') {
                              setEditingTagId(null);
                              setEditingTagLabel('');
                            }
                          }}
                          autoFocus
                        />
                        <span className={styles.tagEditHint}>⌘↵</span>
                      </div>
                    </div>
                    <div className={styles.tagColorSwatches}>
                      {TAG_COLOR_PALETTE.map(color => (
                        <button
                          key={color}
                          className={clsx(
                            styles.tagSwatch,
                            tag.color === color && styles.tagSwatchActive,
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() =>
                            dispatch({ type: 'UPDATE_TAG', id: tag.id, color })
                          }
                          type="button"
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className={clsx(
                      styles.tagOption,
                      styles.tagOptionSelectable,
                      tag.id === selectedTagId && styles.tagOptionSelected,
                    )}
                  >
                    <button
                      className={styles.tagOptionClickArea}
                      onClick={e => {
                        e.stopPropagation();
                        if (tag.id === selectedTagId) {
                          onSelectTag(null);
                        } else {
                          onSelectTag(tag.id);
                          setTagDropdownOpen(false);
                        }
                      }}
                      type="button"
                    >
                      <span
                        className={styles.tagDot}
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.label}</span>
                    </button>
                    {tag.id === selectedTagId && (
                      <Check
                        size={14}
                        className={styles.tagCheckIcon}
                        style={{
                          flexShrink: 0,
                          marginLeft: 'auto',
                          color: 'var(--vellum-text)',
                        }}
                      />
                    )}
                    <div className={styles.tagOptionActions}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => {
                          e.stopPropagation();
                          setEditingTagId(tag.id);
                          setEditingTagLabel(tag.label);
                        }}
                        title="Edit tag"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        intent="danger"
                        size="icon"
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteTag(tag.id);
                        }}
                        title="Delete tag"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {creatingTag ? (
              <div
                className={styles.tagCreateForm}
                style={{ backgroundColor: 'var(--vellum-accent-alpha)' }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Input
                    placeholder="Tag name…"
                    value={newTagLabel}
                    onChange={e => setNewTagLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateTag();
                      if (e.key === 'Escape') {
                        setCreatingTag(false);
                        setNewTagLabel('');
                        setNewTagColor(null);
                      }
                    }}
                    autoFocus
                  />
                </div>
                <div className={styles.tagColorSwatches}>
                  {TAG_COLOR_PALETTE.map(color => (
                    <button
                      key={color}
                      className={clsx(
                        styles.tagSwatch,
                        color ===
                          (newTagColor ??
                            TAG_COLOR_PALETTE[
                              state.tags.length % TAG_COLOR_PALETTE.length
                            ]) && styles.tagSwatchActive,
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewTagColor(color)}
                      type="button"
                    />
                  ))}
                </div>
                <div className={styles.tagCreateActions}>
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setCreatingTag(false);
                      setNewTagLabel('');
                      setNewTagColor(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleCreateTag}>
                    Create
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                align="start"
                onClick={() => setCreatingTag(true)}
              >
                <Plus size={10} style={{ flexShrink: 0 }} />
                <span>New tag</span>
              </Button>
            )}
          </>
        }
      >
        <button
          className={clsx(
            styles.tagPill,
            selectedTag && styles.tagPillFilled,
            tagDropdownOpen && styles.tagPillActive,
          )}
          style={
            selectedTag
              ? {
                  backgroundColor: `${selectedTag.color}26`,
                  borderColor: 'transparent',
                }
              : undefined
          }
          type="button"
        >
          {selectedTag && (
            <span
              className={styles.tagDot}
              style={{ backgroundColor: selectedTag.color }}
            />
          )}
          <span
            className={styles.tagLabel}
            style={selectedTag ? { color: selectedTag.color } : undefined}
          >
            {selectedTag ? selectedTag.label : 'Tag'}
          </span>
          <ChevronDown
            className={styles.tagChevron}
            size={10}
            style={tagDropdownOpen ? { rotate: '180deg' } : undefined}
          />
        </button>
      </PopoverMenu>
    </div>
  );
}
