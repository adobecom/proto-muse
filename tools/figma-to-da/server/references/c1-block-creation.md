# C1 Block Creation Guide — proto-muse

This guide applies when Phase 0 identifies a section that requires a `NEW:` block. Follow every step before writing any code.

---

## Step 0: Read existing blocks first

Before writing any new code, read TWO existing block implementations as structural templates:

```
REPO_PATH/blocks/hub-hero/hub-hero.js
REPO_PATH/blocks/hub-featured/hub-featured.js
```

Study:
- How `decorate(block)` queries rows and cells using `:scope > div`
- How semantic wrapper divs are created and given class names
- How links are gathered into an actions container
- How optional content (eyebrow, avatar, icon) is detected and handled

---

## File structure

Every block lives in its own folder:

```
REPO_PATH/blocks/<block-name>/
  <block-name>.js    ← required: default export is decorate(block)
  <block-name>.css   ← required: scoped styles
```

The folder name, the JS filename, and the CSS filename must all match exactly and use **kebab-case**. Example: `hub-promo/hub-promo.js`.

EDS auto-discovers blocks by class name on the page DOM. No registration needed. The block's class on the outer `div` matches the folder name (`hub-promo` → loads `blocks/hub-promo/hub-promo.js`).

---

## JavaScript pattern

### Minimum viable structure

```js
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (!rows.length) return;

  // 1. Read the authored DOM (rows and cells)
  // 2. Create semantic wrapper elements
  // 3. Reparent content into wrappers
  // 4. Replace block content or append wrappers
}
```

The function signature is always `decorate(block)` — never `init`. EDS calls it synchronously on page load.

### DOM reading conventions

Authored tables become nested divs: `block > div (row) > div (cell)`.

```js
// All rows
const rows = [...block.querySelectorAll(':scope > div')];

// Cells of a row
const cells = [...row.querySelectorAll(':scope > div')];

// Two-column destructuring
const [leftCell, rightCell] = [...row.querySelectorAll(':scope > div')];

// Detect single-cell heading row
const firstCells = rows[0].querySelectorAll(':scope > div');
const isHeadingRow = firstCells.length === 1 && firstCells[0].querySelector('h2, h3, strong');

// Safe single-cell read (handles both authored structures)
const cell = row.querySelector(':scope > div') || row;
```

### Creating wrapper elements

```js
// Create a wrapper div
const wrapper = document.createElement('div');
wrapper.className = 'hub-promo-content';

// Move all children into it
[...sourceCell.childNodes].forEach((node) => wrapper.append(node));

// Build a CTA actions container
const links = [...textCell.querySelectorAll('a')];
if (links.length) {
  const actions = document.createElement('div');
  actions.className = 'hub-promo-actions';
  const parents = [...new Set(links.map((a) => a.closest('p') || a))];
  parents.forEach((node) => actions.append(node));
  textCell.append(actions);
}
```

### Optional content detection

```js
// Eyebrow: first <p> before the heading, no link inside
const firstP = textCell.querySelector('p:first-child');
const heading = textCell.querySelector('h2, h3');
if (firstP && heading && firstP !== heading && !firstP.querySelector('a')) {
  firstP.classList.add('hub-promo-eyebrow');
}

// Eager LCP image
const img = mediaCell?.querySelector('img');
if (img) img.loading = 'eager';
```

### Replacing block content

```js
// Clear and rebuild
block.innerHTML = '';
if (headingRow) block.append(headingRow);
const wrapper = document.createElement('div');
wrapper.append(grid);  // or whatever inner element you built
block.append(wrapper);
```

### Dark variant

CSS handles dark mode — no JS needed. Simply check the class if you need to branch on it:

```js
if (block.classList.contains('dark')) {
  // any JS-specific dark handling, usually nothing
}
```

---

## CSS pattern

### File skeleton

```css
/* ── Block wrapper ── */
.hub-promo {
  --hub-promo-bg: #f8f8f8;
  --hub-promo-text: #2c2c2c;
  --hub-promo-accent: #eb1000;

  background: var(--hub-promo-bg);
  padding: 80px 48px;
}

/* ── Inner container ── */
.hub-promo > div {
  max-width: 1280px;
  margin: 0 auto;
}

/* ── Layout ── */
.hub-promo-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}

/* ── Typography ── */
.hub-promo h2 {
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 700;
  color: var(--hub-promo-text);
  margin: 0 0 16px;
}

.hub-promo p {
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--hub-promo-text);
}

/* ── CTA actions ── */
.hub-promo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.hub-promo-actions strong a {
  display: inline-block;
  padding: 13px 28px;
  border-radius: 4px;
  background: var(--hub-promo-accent);
  color: #fff;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.9375rem;
}

.hub-promo-actions em a {
  display: inline-block;
  padding: 12px 28px;
  border-radius: 4px;
  border: 2px solid var(--hub-promo-accent);
  color: var(--hub-promo-accent);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.9375rem;
}

/* ── Media ── */
.hub-promo-media img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
}

/* ── Dark variant ── */
.hub-promo.dark {
  --hub-promo-bg: #141414;
  --hub-promo-text: #fff;
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .hub-promo {
    padding: 60px 32px;
  }

  .hub-promo-inner {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .hub-promo {
    padding: 48px 20px;
  }

  .hub-promo-actions {
    flex-direction: column;
  }
}
```

---

## CSS conventions

### CSS custom properties

- Scope all block-specific vars to the block root: `.hub-<name> { --hub-<name>-<prop>: value; }`
- Property names: `--hub-<name>-bg`, `--hub-<name>-text`, `--hub-<name>-accent`, `--hub-<name>-border`, etc.
- Override vars in `.hub-<name>.dark { }` — never duplicate property declarations

### Class naming

- Block root: `.hub-<name>` (matches the block div, already set by EDS)
- Inner container: `.hub-<name> > div` (direct child, the EDS row wrapper)
- Sub-components: `.hub-<name>-<component>` (e.g., `.hub-promo-eyebrow`, `.hub-promo-actions`)
- State: `.hub-<name>.dark`, `.hub-<name>.media-right`

### Layout

- Always: `max-width: 1280px; margin: 0 auto;` on the inner container
- Two-column: `display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center;`
- Stack at ≤900px: `grid-template-columns: 1fr;`
- No fixed widths on the block wrapper — it fills 100% of its section

### Typography scale (match existing blocks)

```css
/* Display / H1 */
font-size: clamp(2.25rem, 4.5vw, 3.75rem); font-weight: 700;

/* Section heading / H2 */
font-size: clamp(1.75rem, 3vw, 2.5rem); font-weight: 700;

/* Card heading / H3 */
font-size: 1rem; font-weight: 700;

/* Body */
font-size: 1.0625rem; line-height: 1.65;

/* Eyebrow */
font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
```

### Color palette (reuse these — do not invent new ones)

```css
--hub-accent:   #eb1000;   /* Adobe red — primary CTA background */
--hub-link:     #0265dc;   /* blue — secondary/ghost border and text */
--hub-text:     #2c2c2c;   /* dark body text on light bg */
--hub-muted:    #6e6e6e;   /* secondary/muted text */
--hub-bg-light: #f8f8f8;   /* light section background */
--hub-dark-bg:  #141414;   /* dark variant background */
--hub-dark-text: #fff;     /* text on dark background */
```

Use these as the values of your block-specific CSS vars:
```css
.hub-promo {
  --hub-promo-accent: #eb1000;   /* = --hub-accent */
  --hub-promo-bg:     #f8f8f8;   /* = --hub-bg-light */
}
```

---

## Checklist before finishing a new block

- [ ] `export default function decorate(block)` — no other export
- [ ] All DOM queries use `:scope > div` to avoid reaching into nested blocks
- [ ] LCP image (first/hero image) has `img.loading = 'eager'`
- [ ] Links gathered into a `.hub-<name>-actions` container
- [ ] Dark variant handled via CSS vars only (no JS branching needed)
- [ ] `max-width: 1280px; margin: 0 auto` on inner container
- [ ] Two-column collapses to single column at ≤900px
- [ ] All class names prefixed with `hub-<name>-`
- [ ] No TypeScript, no `import` statements, no build tools
