type AnchorState = {
  value: string;
  priority: string;
  effectiveNames: string[];
  addedNames: Set<string>;
};
const touched = new Map<HTMLElement, AnchorState>();

function anchorNames(value: string): string[] {
  return value.split(',').map(name => name.trim()).filter(name => name && name !== 'none');
}

function restoreAnchorNames(el: HTMLElement, remaining: string[], original: AnchorState) {
  if (remaining.join(', ') === original.effectiveNames.join(', ')) {
    if (original.value) el.style.setProperty('anchor-name', original.value, original.priority);
    else el.style.removeProperty('anchor-name');
  } else if (remaining.length) {
    el.style.setProperty('anchor-name', remaining.join(', '), original.priority);
  } else {
    el.style.removeProperty('anchor-name');
  }
  touched.delete(el);
}

export function setAnchorName(el: HTMLElement, name: string): void {
  const inline = el.style.getPropertyValue('anchor-name');
  const names = anchorNames(inline || getComputedStyle(el).getPropertyValue('anchor-name'));
  if (!touched.has(el)) {
    touched.set(el, {
      value: inline,
      priority: el.style.getPropertyPriority('anchor-name'),
      effectiveNames: names.slice(),
      addedNames: new Set(),
    });
  }

  if (!names.includes(name)) {
    names.push(name);
    touched.get(el)!.addedNames.add(name);
  }

  // Internal anchors must also work when the host stylesheet uses !important.
  el.style.setProperty('anchor-name', names.join(', '), 'important');
}

export function clearVellumAnchors(): void {
  for (const [el, original] of touched) {
    const remaining = anchorNames(el.style.getPropertyValue('anchor-name'))
      .filter(name => !original.addedNames.has(name));
    restoreAnchorNames(el, remaining, original);
  }
}

export function removeAnchorName(el: HTMLElement, name: string): void {
  const current = el.style.getPropertyValue('anchor-name');
  if (!current) return;

  const names = anchorNames(current).filter(n => n !== name);
  const original = touched.get(el);
  original?.addedNames.delete(name);

  if (original && !names.some(n => original.addedNames.has(n))) {
    restoreAnchorNames(el, names, original);
  } else if (names.length > 0) {
    el.style.setProperty('anchor-name', names.join(', '), el.style.getPropertyPriority('anchor-name'));
  } else {
    el.style.removeProperty('anchor-name');
  }
}

export function hasAnchorNamePrefix(el: HTMLElement, prefix: string): boolean {
  const current = el.style.getPropertyValue('anchor-name');
  if (!current) return false;

  return current
    .split(',')
    .map(name => name.trim())
    .some(name => name.startsWith(prefix));
}
