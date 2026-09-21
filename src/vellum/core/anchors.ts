export function setAnchorName(el: HTMLElement, name: string): void {
  const current = el.style.getPropertyValue('anchor-name');
  const names = current
    ? current
        .split(',')
        .map(n => n.trim())
        .filter(Boolean)
    : [];

  if (!names.includes(name)) {
    names.push(name);
  }

  el.style.setProperty('anchor-name', names.join(', '));
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
