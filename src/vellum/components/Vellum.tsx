import { useRef } from 'react';
import { VellumProvider } from '../context/VellumContext';
import { useVellum } from '../context/VellumContext';
import { Toolbar } from './Toolbar';
import { SelectionHighlight } from './SelectionHighlight';
import { AnnotationPopover } from './AnnotationPopover';
import { AnnotationDots } from './AnnotationDots';
import { Sidebar } from './Sidebar';
import { SettingsPanel } from './SettingsPanel';
import { VellumLayer } from './VellumLayer';
import { usePopoverToggle } from '../hooks/usePopoverToggle';
import type { VellumFilter } from '../core/filters/types';
import '../common.css';

interface SidebarSlotProps {
  className?: string;
}

function SidebarSlot({ className }: SidebarSlotProps) {
  const { state } = useVellum();
  const ref = useRef<HTMLElement>(null);
  usePopoverToggle(ref, state.sidebarVisible);
  return <Sidebar ref={ref} popover="manual" className={className} />;
}

interface OverlayInnerProps {
  className?: string;
}

function OverlayInner({ className }: OverlayInnerProps) {
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <SidebarSlot className={className} />
      <VellumLayer>
        <SelectionHighlight />
        <AnnotationDots />
        <AnnotationPopover />
        <Toolbar settingsBtnRef={settingsBtnRef} />
      </VellumLayer>
      <SettingsPanel settingsBtnRef={settingsBtnRef} />
    </>
  );
}

export interface VellumProps {
  className?: string;
  filters?: VellumFilter[];
  /**
   * Current pathname, supplied by the host app's router (e.g. React Router's
   * `useLocation().pathname`). Vellum never reads `window.location` itself.
   */
  pathname: string;
  /**
   * Host-app navigation handler. Receives a pathname previously captured from
   * `pathname` (e.g. when an annotation was created). Wire to your router's
   * navigation primitive — for React Router v7, `(path) => navigate(path)`.
   */
  navigate: (route: string) => void;
}

export function Vellum({ className, filters, pathname, navigate }: VellumProps) {
  return (
    <VellumProvider filters={filters} pathname={pathname} navigate={navigate}>
      <OverlayInner className={className} />
    </VellumProvider>
  );
}

// Backwards compatibility export
export const VellumOverlay = Vellum;
