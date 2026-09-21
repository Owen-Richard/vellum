const touched = new Map<HTMLElement, { value: string; priority: string }>();

export function setAnchorName(el: HTMLElement, name: string): void {
  const current = el.style.getPropertyValue('anchor-name');
  if (!touched.has(el)) {
    touched.set(el, { value: current, priority: el.style.getPropertyPriority('anchor-name') });
  }
  const names = current
    ? current
        .split(',')
        .map(n => n.trim())
        .filter(n => n !== 'none' && n !== '')
    : [];

  if (!names.includes(name)) {
    names.push(name);
  }

  el.style.setProperty('anchor-name', names.join(', '));
}

export function clearVellumAnchors(): void {
  for (const [el, original] of touched) {
    const remaining = el.style.getPropertyValue('anchor-name').split(',')
      .map(name => name.trim()).filter(name => name && !name.startsWith('--vellum-'));
    if (remaining.length) {
      el.style.setProperty('anchor-name', remaining.join(', '), original.priority);
    } else if (original.value) {
      el.style.setProperty('anchor-name', original.value, original.priority);
    } else {
      el.style.removeProperty('anchor-name');
    }
  }
  touched.clear();
}

export function removeAnchorName(el: HTMLElement, name: string): void {
  const current = el.style.getPropertyValue('anchor-name');
  if (!current) return;

  const names = current
    .split(',')
    .map(n => n.trim())
    .filter(n => n !== name && n !== '');

  if (names.length > 0) {
    el.style.setProperty('anchor-name', names.join(', '));
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
