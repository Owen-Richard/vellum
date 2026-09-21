import { useEffect } from 'react';

export function usePopoverToggle(ref: React.RefObject<HTMLElement | null>, visible: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visible) {
      if (!el.matches(':popover-open')) el.showPopover();
    } else {
      if (el.matches(':popover-open')) el.hidePopover();
    }
  }, [visible]);
}
