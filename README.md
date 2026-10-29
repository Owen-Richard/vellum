<p align="center">
  <img src=".github/assets/vellum-brand.png" alt="Vellum" width="640">
</p>

# Vellum

Inspect elements, write annotations, and preview CSS changes on a web page.
Vellum is a desktop browser extension built for Chromium, including Chrome and
Microsoft Edge.

## Install

Requires Node.js 22 or newer to build, and a desktop Chromium browser based on
Chromium 131 or newer. Use a current browser release. Vellum needs Manifest V3
extension support, HTML popovers, and CSS anchor positioning.

```sh
npm ci
npm run build
```

Open your browser's extension manager:

| Browser | Extension manager |
| --- | --- |
| Chrome / Chromium | `chrome://extensions` |
| Microsoft Edge | `edge://extensions` |

Enable **Developer mode**, select **Load unpacked**, and choose this repository's
`dist/` folder. Pin Vellum in the extension menu.

Open an ordinary web page and click the Vellum browser icon to start it.
Click the icon again to stop it. After reloading the page, start Vellum again.

`npm run package` produces `artifacts/vellum.zip` for manual distribution.
Unzip it and load the extracted folder with **Load unpacked**. Vellum is not
published to the Chrome Web Store or Microsoft Edge Add-ons.

Automated browser checks run in Chromium. Other Chromium-based browsers have not
been separately verified. This package does not support Firefox or Safari.

## Features

- Element selection and annotation markers.
- Create, edit, delete, tag, and filter annotations.
- Copy feedback with element and available React component context.
- DOM layer tree on ordinary pages; React tree when React metadata is available.
- Applied CSS editing, authored CSS rules, copyable diffs, and reset.
- Draggable toolbar, keyboard shortcuts, dark/light themes, and component gallery.
- One-click start and stop from the browser icon, with no popup.
- Startup errors appear in the icon tooltip with a `!` badge.
- Visible save/copy failures. Failed copies never clear annotations.

Stop restores CSS overrides and Vellum anchor names. The sidebar overlays the
page rather than changing the host layout.

| Shortcut | Action |
| --- | --- |
| `S` | Select an element |
| `H` | Show or hide markers |
| `L` | Show or hide the sidebar |
| `1` / `2` | Annotations / Editor |
| `/` | Settings |
| `C` | Copy feedback |
| `X`, then `X` | Clear feedback |
| `Escape` | Cancel selection |
| `Ctrl` / `Cmd` + `Enter` | Save an annotation |

Single-key shortcuts are ignored while typing in an input or editable region.

## Storage and permissions

No backend, telemetry, or account is required. Notes are stored in this
extension's `chrome.storage.local`, not in the website's local storage.
Annotations are scoped to origin, pathname, query, and hash. Settings and tags
are scoped to the origin. There is no automatic import from the embedded tool.

The manifest requests `activeTab`, `scripting`, `storage`, and `clipboardWrite`.
There are no persistent host permissions or always-on content scripts. Starting
Vellum grants temporary access to the current tab.

The inspector runs in the page's JavaScript world to read React metadata.
A separate isolated script handles storage through a bounded, validated message
protocol. The page can see its displayed notes and can interact with this
same-page bridge. Do not use annotations to store secrets. The bridge does not
expose other origins, arbitrary extension storage keys, or extension APIs.

## Limits

- Browser-internal pages, extension stores, PDFs, and file URLs are not supported.
- Inspection is limited to the top document. Cross-origin frames and closed
  shadow roots are not traversed.
- React names and source locations depend on metadata available in the page.
  Production bundles may not provide readable names or source maps.
- Cross-origin stylesheets may not expose their authored rules to the page.
  You can still add explicit inline overrides in Applied CSS.
- Notes use DOM selectors. Large page restructures can leave notes without a
  matching target. Notes remain in the list and can still be copied or deleted.
- Two tabs editing the same page share storage. The last save wins.
- Mini Foundry's host-specific feature/variant routing is retained in the source
  import but is not a browser-extension feature.

## Development and verification

```sh
npm ci
npx playwright install chromium
npm run check
```

`npm run check` runs these steps:

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

Browser checks use Playwright's Chromium in a separate temporary profile. They
load the actual extension, trigger its browser action, and exercise the
one-click action and storage. They do not change your normal browser profile.

To select an installed Microsoft Edge build that supports the test harness:

```sh
VELLUM_BROWSER=msedge npm run test:browser
```

Tests use a local example site, not private work pages. Captures go to
`artifacts/states/`. After browser checks, `node scripts/state-board.mjs` creates
an editable HTML state board. `npm run preview` serves it at
`http://127.0.0.1:5198/board`. That developer-only board loads Figma's capture
script; the packaged extension never does.

Source changes for the extension live in `src/extension/`. `src/vellum/` retains
the source component layout and design tokens. The import commit separates the
original library from browser-specific changes.

## Source and design

This extension derives from `coreai-microsoft/mini-foundry`, not the standalone
Vellum repository. The initial `src/vellum/` import is unchanged from
`packages/vellum/src/` at commit `0104e3b1`.

The [Vellum Figma file](https://www.figma.com/design/ZRXd0l2ccHC388qwGBoNlc/Vellum)
contains design references. The implementation remains authoritative for
interactions and edge cases.

Existing source attribution and ownership are retained. No additional license
grant is implied.
