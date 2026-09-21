import { useState } from 'react';
import { Pencil, Trash2, Star, Settings, Copy, Check } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonGroup,
  Checkbox,
  Dialog,
  Divider,
  Input,
  Kbd,
  PopoverMenu,
  Textarea,
  Toggle,
  Tooltip,
} from '../common';
import styles from './ComponentGallery.module.css';

export function ComponentGallery({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState(true);
  const [toggled, setToggled] = useState(false);
  const [inputValue, setInputValue] = useState('Hello world');
  const [textareaValue, setTextareaValue] = useState(
    'Multi-line\ncontent here',
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      header="Component Gallery"
      className={styles.dialog}
      inline
      footer={
        <>
          <Button variant="subtle" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className={styles.gallery}>
        {/* Buttons */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Button</span>
          <span className={styles.caption}>
            <code>variant</code> (intensity), <code>intent</code> (color), and{' '}
            <code>size</code> (geometry) compose orthogonally.
            <code>variant=&quot;primary&quot;</code> auto-selects{' '}
            <code>intent=&quot;accent&quot;</code> when no intent is set.
          </span>
          <div className={styles.matrix}>
            <span />
            <span className={styles.matrixHeader}>info</span>
            <span className={styles.matrixHeader}>accent</span>
            <span className={styles.matrixHeader}>success</span>
            <span className={styles.matrixHeader}>danger</span>

            <span className={styles.matrixLabel}>primary</span>
            <span className={styles.matrixCell}>
              <Button variant="primary" intent="info">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="primary" intent="accent">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="primary" intent="success">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="primary" intent="danger">
                Action
              </Button>
            </span>

            <span className={styles.matrixLabel}>secondary</span>
            <span className={styles.matrixCell}>
              <Button variant="secondary" intent="info">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="secondary" intent="accent">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="secondary" intent="success">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="secondary" intent="danger">
                Action
              </Button>
            </span>

            <span className={styles.matrixLabel}>subtle</span>
            <span className={styles.matrixCell}>
              <Button variant="subtle" intent="info">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="subtle" intent="accent">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="subtle" intent="success">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="subtle" intent="danger">
                Action
              </Button>
            </span>

            <span className={styles.matrixLabel}>ghost</span>
            <span className={styles.matrixCell}>
              <Button variant="ghost" intent="info">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="ghost" intent="accent">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="ghost" intent="success">
                Action
              </Button>
            </span>
            <span className={styles.matrixCell}>
              <Button variant="ghost" intent="danger">
                Action
              </Button>
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Sizes</span>
            <Button size="icon">
              <Star size={14} />
            </Button>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Icon × intent</span>
            <Button variant="ghost" size="icon">
              <Settings size={14} />
            </Button>
            <Button variant="ghost" intent="accent" size="icon">
              <Copy size={14} />
            </Button>
            <Button variant="ghost" intent="success" size="icon">
              <Check size={14} />
            </Button>
            <Button variant="ghost" intent="danger" size="icon">
              <Trash2 size={14} />
            </Button>
            <Button variant="primary" size="icon">
              <Star size={14} />
            </Button>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>States</span>
            <Button variant="ghost" size="icon" active>
              <Star size={14} />
            </Button>
            <Button variant="secondary" size="sm" active>
              Active
            </Button>
            <Button variant="ghost" intent="danger" size="icon" armed>
              <Trash2 size={14} />
            </Button>
            <Button variant="ghost" size="icon" disabled>
              <Settings size={14} />
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>

        <Divider />

        {/* ButtonGroup */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>ButtonGroup</span>
          <div className={styles.row}>
            <ButtonGroup>
              <Button variant="secondary" size="sm" active>
                Select
              </Button>
            </ButtonGroup>
            <ButtonGroup>
              <Button variant="ghost" size="icon">
                <Star size={14} />
              </Button>
              <Button variant="ghost" size="icon">
                <Copy size={14} />
              </Button>
              <Button variant="ghost" size="icon">
                <Settings size={14} />
              </Button>
            </ButtonGroup>
          </div>
        </div>

        <Divider />

        {/* Tooltip */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Tooltip</span>
          <div className={styles.row}>
            <Tooltip text="Basic tooltip">
              <Button variant="secondary">Hover me</Button>
            </Tooltip>
            <Tooltip text="With shortcut" shortcut="S">
              <Button variant="ghost" size="icon">
                <Star size={14} />
              </Button>
            </Tooltip>
            <Tooltip text="Always visible" forceShow>
              <Button variant="primary" size="sm">
                Forced
              </Button>
            </Tooltip>
          </div>
        </div>

        <Divider />

        {/* PopoverMenu */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>PopoverMenu</span>
          <div className={styles.row}>
            <PopoverMenu
              content={
                <>
                  <Button variant="ghost" size="sm" align="start">
                    <Pencil size={12} /> Edit item
                  </Button>
                  <Button variant="ghost" size="sm" align="start">
                    <Copy size={12} /> Copy item
                  </Button>
                  <Divider />
                  <Button
                    variant="ghost"
                    intent="danger"
                    size="sm"
                    align="start"
                  >
                    <Trash2 size={12} /> Delete item
                  </Button>
                </>
              }
            >
              <Button variant="secondary" size="sm">
                Open menu
              </Button>
            </PopoverMenu>
          </div>
        </div>

        <Divider />

        {/* Input & Textarea */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Input & Textarea</span>
          <div className={styles.row}>
            <span className={styles.label}>Input</span>
            <Input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Type here…"
            />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Textarea</span>
            <Textarea
              value={textareaValue}
              onChange={e => setTextareaValue(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <Divider />

        {/* Badge */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Badge</span>
          <div className={styles.row}>
            <span className={styles.label}>Default</span>
            <Badge>3</Badge>
            <Badge>12</Badge>
            <Badge>99+</Badge>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Overlay</span>
            <div className={styles.badgeOverlayAnchor}>
              <Button variant="ghost" size="icon">
                <Star size={14} />
              </Button>
              <Badge variant="overlay">5</Badge>
            </div>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Index</span>
            <Badge
              variant="index"
              style={{ backgroundColor: 'var(--vellum-accent)' }}
            >
              1
            </Badge>
            <Badge variant="index" style={{ backgroundColor: '#22c55e' }}>
              2
            </Badge>
            <Badge
              variant="index"
              className={styles.badgeDarkText}
              style={{ backgroundColor: '#f59e0b' }}
            >
              3
            </Badge>
          </div>
        </div>

        <Divider />

        {/* Kbd */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Kbd</span>
          <div className={styles.row}>
            <span className={styles.label}>Small</span>
            <Kbd>S</Kbd>
            <Kbd>⌘</Kbd>
            <Kbd>Esc</Kbd>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Large</span>
            <Kbd size="lg">S</Kbd>
            <Kbd size="lg">⌘C</Kbd>
            <Kbd size="lg">Esc</Kbd>
          </div>
        </div>

        <Divider />

        {/* Toggle */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Toggle</span>
          <div className={styles.row}>
            <span className={styles.label}>Switch</span>
            <Toggle checked={toggled} onChange={() => setToggled(v => !v)} />
            <span className={styles.caption}>{toggled ? 'On' : 'Off'}</span>
          </div>
        </div>

        <Divider />

        {/* Checkbox */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Checkbox</span>
          <Checkbox checked={checked} onChange={() => setChecked(v => !v)}>
            <span className={styles.checkboxLabel}>
              Example checkbox option
            </span>
          </Checkbox>
          <Checkbox checked={!checked} onChange={() => setChecked(v => !v)}>
            <span className={styles.checkboxLabel}>
              Another option (inverse)
            </span>
          </Checkbox>
        </div>

        <Divider />

        {/* Divider */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Divider</span>
          <span className={styles.caption}>
            ↑ You've been seeing them between each section
          </span>
        </div>

        <Divider />

        {/* Dialog (meta) */}
        <div className={styles.section}>
          <span className={styles.sectionTitle}>Dialog</span>
          <span className={styles.caption}>
            You're looking at one! Native &lt;dialog&gt; with header, scrollable
            body, and footer.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
