import clsx from 'clsx';
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type RefObject,
} from 'react';
import {
  Sun,
  Moon,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Palette,
} from 'lucide-react';
import { useVellum } from '../context/VellumContext';
import { usePopoverToggle } from '../hooks/usePopoverToggle';
import { Button, Checkbox, Divider, Kbd, Tooltip } from '../common';
import { ComponentGallery } from './ComponentGallery';
import popoverStyles from '../styles/popover.module.css';
import styles from './SettingsPanel.module.css';

type SettingsView = 'main' | 'hotkeys';

const HOTKEYS: { key: string; label: string; hint?: string }[] = [
  { key: 'S', label: 'Toggle select mode' },
  { key: 'H', label: 'Toggle markers' },
  { key: 'C', label: 'Copy output' },
  { key: 'X', label: 'Clear all', hint: 'Press twice to confirm' },
  { key: '/', label: 'Toggle settings' },
  { key: '1', label: 'Annotations tab' },
  { key: '2', label: 'Editor tab' },
  { key: 'L', label: 'Toggle annotations list' },
  { key: 'Esc', label: 'Exit / cancel' },
];

function HotkeysView({ onBack }: { onBack: () => void }) {
  return (
    <div className={clsx(styles.inner, styles.innerHotkeys)}>
      <Button
        variant="ghost"
        size="sm"
        align="start"
        className={styles.backButton}
        onClick={onBack}
      >
        <ChevronLeft size={12} aria-hidden="true" />
        <span>Hotkeys</span>
      </Button>
      <div className={styles.hotkeyList}>
        {HOTKEYS.map(hk => (
          <div key={hk.key} className={styles.hotkeyRow}>
            <Kbd size="lg">{hk.key}</Kbd>
            <div className={styles.hotkeyInfo}>
              <span className={styles.hotkeyLabel}>{hk.label}</span>
              {hk.hint && <span className={styles.hotkeyHint}>{hk.hint}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MainSettingsView({
  onShowHotkeys,
  onShowGallery,
  theme,
  onToggleTheme,
  clearOnCopy,
  onClearOnCopy,
}: {
  onShowHotkeys: () => void;
  onShowGallery: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  clearOnCopy: boolean;
  onClearOnCopy: () => void;
}) {
  return (
    <div className={styles.inner}>
      <div className={styles.header}>
        <span className={styles.sectionTitle}>Settings</span>
        <Button
          variant="ghost"
          size="sm"
          className={styles.themeButton}
          aria-label="Toggle theme"
          onClick={onToggleTheme}
        >
          <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          {theme === 'dark' ? (
            <Sun size={14} aria-hidden="true" />
          ) : (
            <Moon size={14} aria-hidden="true" />
          )}
        </Button>
      </div>

      <div className={styles.checkboxesGroup}>
        <Checkbox
          checked={clearOnCopy}
          onChange={onClearOnCopy}
          id="vellum-label-clear-on-copy"
        >
          <div className={styles.settingMeta}>
            <div className={styles.settingLabel}>
              <span id="vellum-label-clear-on-copy">Clear on copy</span>
              <Tooltip
                text="Automatically clear all annotations after copying to clipboard"
                maxWidth={180}
              >
                <span className={styles.helpIcon}>
                  <HelpCircle size={12} aria-hidden="true" />
                </span>
              </Tooltip>
            </div>
          </div>
        </Checkbox>
      </div>

      <Divider />

      <Button
        variant="ghost"
        size="sm"
        className={styles.hotkeyLink}
        onClick={onShowHotkeys}
      >
        <span>Hotkeys</span>
        <ChevronRight size={12} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={styles.hotkeyLink}
        onClick={onShowGallery}
      >
        <span>Component Gallery</span>
        <Palette size={12} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function SettingsPanel({
  settingsBtnRef,
}: {
  settingsBtnRef: RefObject<HTMLButtonElement | null>;
}) {
  const { state, actions } = useVellum();
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<SettingsView>('main');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  usePopoverToggle(panelRef, state.settingsVisible);

  // Reset view when panel is closed
  useEffect(() => {
    if (!state.settingsVisible) {
      setView('main');
    }
  }, [state.settingsVisible]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!state.settingsVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close settings panel before other handlers see the Escape key
        e.stopPropagation();
        actionsRef.current.toggleSettings();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const panel = panelRef.current;
      const settingsBtn = settingsBtnRef.current;
      if (
        panel &&
        !panel.contains(e.target as Node) &&
        !(settingsBtn && settingsBtn.contains(e.target as Node))
      ) {
        actionsRef.current.toggleSettings();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [state.settingsVisible, settingsBtnRef]);

  // Set anchor positioning via DOM
  useEffect(() => {
    panelRef.current?.style.setProperty(
      'position-anchor',
      '--vellum-settings-btn',
    );
  }, []);

  const showHotkeys = useCallback(() => setView('hotkeys'), []);
  const showMain = useCallback(() => setView('main'), []);
  const openGallery = useCallback(() => setGalleryOpen(true), []);
  const closeGallery = useCallback(() => setGalleryOpen(false), []);

  return (
    <>
      <div
        ref={panelRef}
        popover="manual"
        className={clsx(styles.panel, popoverStyles.popoverTop)}
        data-vellum
      >
        {view === 'main' ? (
          <MainSettingsView
            onShowHotkeys={showHotkeys}
            onShowGallery={openGallery}
            theme={state.theme}
            onToggleTheme={actions.toggleTheme}
            clearOnCopy={state.clearOnCopy}
            onClearOnCopy={actions.toggleClearOnCopy}
          />
        ) : (
          <HotkeysView onBack={showMain} />
        )}
      </div>
      <ComponentGallery open={galleryOpen} onClose={closeGallery} />
    </>
  );
}
