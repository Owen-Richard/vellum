import { useEffect, useState } from 'react';
import { getFiberFromHostInstance, type FiberRoot } from 'bippy';

function findFiberRoot(): FiberRoot | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => node instanceof Element && node.closest('[data-vellum]')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let element: Node | null = walker.currentNode;
  while (element) {
    if (element instanceof Element) {
      let fiber = getFiberFromHostInstance(element);
      if (fiber) {
        while (fiber.return) fiber = fiber.return;
        if (fiber.stateNode?.current) return fiber.stateNode as FiberRoot;
      }
    }
    element = walker.nextNode();
  }
  return null;
}

export function useFiberRoot() {
  const [snapshot, setSnapshot] = useState<{ fiberRoot: FiberRoot | null; treeRevision: number }>({
    fiberRoot: null, treeRevision: 0,
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      setSnapshot(prev => ({ fiberRoot: findFiberRoot(), treeRevision: prev.treeRevision + 1 }));
    };
    const observer = new MutationObserver(records => {
      const hostChanged = records.some(record =>
        !(record.target instanceof Element && record.target.closest('[data-vellum]')) &&
        [...record.addedNodes, ...record.removedNodes].some(node =>
          !(node instanceof Element && node.hasAttribute('data-vellum'))));
      if (!hostChanged || timer) return;
      timer = setTimeout(() => { timer = undefined; refresh(); }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    refresh();
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  return snapshot;
}
