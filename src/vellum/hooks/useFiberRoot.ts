import { useEffect, useRef, useState } from 'react';
import { instrument, secure } from 'bippy';
import type { Fiber, FiberRoot } from 'bippy';

function findFiberRoot(): FiberRoot | null {
  // React attaches a fiber to the container element via __reactContainer$xxx or __reactFiber$xxx.
  // React Router v7 SPA mode renders directly into <body> (no #root div), so check body as well.
  const candidates = [document.getElementById('root'), document.body].filter(Boolean) as HTMLElement[];

  for (const container of candidates) {
    const containerKey = Object.keys(container).find(
      k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'),
    );
    if (!containerKey) continue;

    const fiber = (container as unknown as Record<string, unknown>)[containerKey] as Fiber | null;
    if (!fiber) continue;

    let node: Fiber = fiber;
    while (node.return) node = node.return;
    return node.stateNode as FiberRoot;
  }

  return null;
}

export function useFiberRoot() {
  const [treeRevision, setRevision] = useState(0);
  const fiberRootRef = useRef<FiberRoot | null>(null);
  const instrumentedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let observer: MutationObserver | null = null;

    if (!instrumentedRef.current) {
      instrumentedRef.current = true;

      const bumpRevision = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          setRevision(r => r + 1);
        }, 100);
      };

      instrument(
        secure({
          onCommitFiberRoot(_rendererID, root) {
            fiberRootRef.current = root;
            bumpRevision();
          },
        }),
      );

      // MutationObserver only used to seed the fiber root on initial render
      let seeded = fiberRootRef.current != null;

      if (!seeded) {
        observer = new MutationObserver(() => {
          if (seeded) return;
          const root = findFiberRoot();
          if (root) {
            fiberRootRef.current = root;
            seeded = true;
            setRevision(r => r + 1);
            observer?.disconnect();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }

      // Seed immediately — DOM is already rendered when this effect runs
      const root = findFiberRoot();
      if (root) {
        fiberRootRef.current = root;
        seeded = true;
        setRevision(r => r + 1);
        observer?.disconnect();
      }
    }

    return () => {
      observer?.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { fiberRoot: fiberRootRef.current, treeRevision };
}
