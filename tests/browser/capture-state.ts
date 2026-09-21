import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

/** Freeze the real browser DOM as editable HTML for the Figma state sheet. */
export function snapshotDocument() {
    const properties = [
      'color', 'background-color', 'background-image', 'background-size',
      'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
      'box-shadow', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style',
      'line-height', 'letter-spacing', 'text-align', 'text-decoration',
      'text-transform', 'white-space', 'word-break', 'overflow-wrap',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'overflow-x', 'overflow-y', 'visibility', 'display', 'box-sizing',
      'align-items', 'justify-content', 'flex-direction', 'gap',
      'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
      'list-style-type', 'z-index', 'vertical-align',
    ];
    const bodyRect = document.body.getBoundingClientRect();
    const root = document.createElement('div');
    root.style.cssText = `position:relative;width:${innerWidth}px;height:${innerHeight}px;overflow:hidden;background:${getComputedStyle(document.body).backgroundColor};`;

    function freeze(node: Node, parentRect: DOMRect): Node | null {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
      if (!(node instanceof Element) || ['SCRIPT', 'STYLE', 'LINK', 'META'].includes(node.tagName)) return null;
      const rect = node.hasAttribute('data-vellum-extension-root')
        ? new DOMRect(0, 0, innerWidth, innerHeight) : node.getBoundingClientRect();
      const css = getComputedStyle(node);
      if (css.visibility === 'hidden' || css.display === 'none') return null;
      if (node instanceof SVGElement) {
        const svg = node.cloneNode(true) as SVGElement;
        svg.setAttribute('style', `position:absolute;left:${rect.left - parentRect.left}px;top:${rect.top - parentRect.top}px;width:${rect.width}px;height:${rect.height}px;color:${css.color};fill:${css.fill};stroke:${css.stroke}`);
        const originals = [node, ...node.querySelectorAll('*')];
        const copies = [svg, ...svg.querySelectorAll('*')];
        originals.forEach((original, index) => {
          const style = getComputedStyle(original);
          for (const property of ['fill', 'stroke']) {
            copies[index].setAttribute(property, style.getPropertyValue(property));
          }
        });
        return svg;
      }
      const clone = node.cloneNode(false);
      if (!(clone instanceof HTMLElement)) return null;
      clone.removeAttribute('id');
      clone.removeAttribute('popover');
      clone.removeAttribute('class');
      clone.removeAttribute('style');
      for (const attr of Array.from(clone.attributes)) {
        if (attr.name.startsWith('on')) clone.removeAttribute(attr.name);
      }
      for (const property of properties) clone.style.setProperty(property, css.getPropertyValue(property));
      clone.style.position = 'absolute';
      clone.style.left = `${rect.left - parentRect.left}px`;
      clone.style.top = `${rect.top - parentRect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.margin = '0';
      clone.style.boxSizing = 'border-box';
      clone.style.transform = 'none';
      if (node instanceof HTMLTextAreaElement) clone.textContent = node.value;
      else if (node instanceof HTMLInputElement) clone.setAttribute('value', node.value);
      else {
        const childOrigin = new DOMRect(rect.left + parseFloat(css.borderLeftWidth || '0'), rect.top + parseFloat(css.borderTopWidth || '0'), rect.width, rect.height);
        for (const child of node.childNodes) {
          const frozen = freeze(child, childOrigin);
          if (frozen) clone.append(frozen);
        }
      }
      return clone;
    }
    for (const child of document.body.childNodes) {
      const frozen = freeze(child, new DOMRect(0, 0, bodyRect.width, bodyRect.height));
      if (frozen) root.append(frozen);
    }
    return root.outerHTML;
}

export async function writeStateHtml(name: string, html: string) {
  await mkdir('artifacts/states', { recursive: true });
  await writeFile(`artifacts/states/${name}.html`, html);
}

export async function captureState(page: Page, name: string) {
  await mkdir('artifacts/states', { recursive: true });
  await page.screenshot({ path: `artifacts/states/${name}.png`, animations: 'disabled' });
  const html = await page.evaluate(snapshotDocument);
  await writeStateHtml(name, html);
}
