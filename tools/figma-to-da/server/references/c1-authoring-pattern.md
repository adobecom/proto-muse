# C1 Authoring Pattern — DA HTML for proto-muse

This file defines the HTML structure for DA documents that use C1 blocks (`hub-*`).

**Critical differences from C2 authoring:**
- **No** `foundation: c2` metadata section
- **No** `Mobile-viewport` / `Tablet-viewport` / `Desktop-viewport` rows
- **No** `--s2a-` typography token variants in block names
- **No** `section-metadata` with `container, wide`
- C1 blocks handle responsive layout entirely through CSS; no per-viewport content authoring is needed

---

## Document skeleton

```html
<!doctype html>
<html>
<head><title>Page Title</title></head>
<body>
  <header></header>
  <main>
    <div>
      <!-- Block 1 table goes here -->
    </div>
    <div>
      <!-- Block 2 table goes here -->
    </div>
    <!-- One <div> per block/section; each wraps exactly one <table> -->
  </main>
  <footer></footer>
</body>
</html>
```

Each `<div>` inside `<main>` is one section. Each section contains one block `<table>`.

---

## Block table structure

```html
<table>
  <tbody>
    <tr><td colspan="2">Block Name</td></tr>   <!-- Name row: always first -->
    <tr>
      <td><!-- column 0 content --></td>
      <td><!-- column 1 content --></td>
    </tr>
  </tbody>
</table>
```

**Name row rules:**
- First row of every table: one `<td>` containing the block name
- EDS lowercases and hyphenates it: `Hub Featured` → class `hub-featured`
- Variants in parentheses, comma-separated: `Hub Featured (dark, media-right)` → classes `hub-featured dark media-right`
- `colspan="2"` on the name cell is conventional for 2-column blocks but not required
- Never use `<th>` — always `<td>`

---

## CTA / link conventions

EDS and the hub-* blocks use `<strong>` and `<em>` to convey button style:

```html
<!-- Primary CTA (filled button) -->
<p><strong><a href="https://www.adobe.com/">Try for free</a></strong></p>

<!-- Secondary CTA (ghost / outline button) -->
<p><em><a href="https://www.adobe.com/">Learn more</a></em></p>

<!-- Plain text link (no button styling) -->
<p><a href="https://www.adobe.com/">See all plans</a></p>
```

Use `https://www.adobe.com/` as a placeholder URL for all links. The user will replace them with real destinations after reviewing in DA.

---

## Image authoring

After uploading images to the DA shadow folder, reference them with their `content.da.live` URL:

```html
<td>
  <picture>
    <img src="https://content.da.live/<org>/<repo>/drafts/<username>/.<slug>/<filename>" alt="Description">
  </picture>
</td>
```

Shadow folder convention: page at `drafts/<username>/<slug>.html` stores images at `drafts/<username>/.<slug>/<filename>`.

---

## Per-block authoring tables

### hub-hero

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Hero</td></tr>
    <tr>
      <td>
        <p>Eyebrow text</p>
        <h1>Main headline</h1>
        <p>Supporting descriptor text.</p>
        <p><strong><a href="https://www.adobe.com/">Get started free</a></strong></p>
        <p><em><a href="https://www.adobe.com/">View plans</a></em></p>
      </td>
      <td>
        <picture><img src="https://content.da.live/.../hero-image.png" alt="Hero illustration"></picture>
      </td>
    </tr>
  </tbody>
</table>
```

Col 0 = text (eyebrow optional, then h1, body, CTAs). Col 1 = media image.

---

### hub-featured (image left, default)

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Featured</td></tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/.../feature.png" alt="Feature image"></picture>
      </td>
      <td>
        <p>Eyebrow text</p>
        <h2>Feature heading</h2>
        <p>Description of this feature or product.</p>
        <p><strong><a href="https://www.adobe.com/">Try it now</a></strong></p>
      </td>
    </tr>
  </tbody>
</table>
```

Col 0 = media (always). Col 1 = text. For image-on-right: `Hub Featured (media-right)` — the DOM column order stays the same, CSS flips the visual.

---

### hub-featured (dark, image right)

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Featured (dark, media-right)</td></tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/.../product.png" alt="Product screenshot"></picture>
      </td>
      <td>
        <p>Eyebrow</p>
        <h2>Heading on dark background</h2>
        <p>Body text.</p>
        <p><strong><a href="https://www.adobe.com/">CTA</a></strong></p>
      </td>
    </tr>
  </tbody>
</table>
```

---

### hub-cards

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Cards</td></tr>
    <!-- Optional section heading row (single cell): -->
    <tr>
      <td colspan="2">
        <p>What's included</p>
        <h2>Creative Cloud apps</h2>
        <p>Everything you need to create, collaborate, and ship.</p>
      </td>
    </tr>
    <!-- One row per card: -->
    <tr>
      <td><picture><img src="https://content.da.live/.../photoshop-icon.png" alt="Photoshop"></picture></td>
      <td>
        <h3>Photoshop</h3>
        <p>Create beautiful images, graphics, and art.</p>
        <p><a href="https://www.adobe.com/">Learn more</a></p>
      </td>
    </tr>
    <tr>
      <td><picture><img src="https://content.da.live/.../illustrator-icon.png" alt="Illustrator"></picture></td>
      <td>
        <h3>Illustrator</h3>
        <p>Create logos, icons, and illustrations.</p>
        <p><a href="https://www.adobe.com/">Learn more</a></p>
      </td>
    </tr>
  </tbody>
</table>
```

Heading row detection: single cell with h2/h3. Card rows: col 0 = icon image (optional — block auto-generates initials if absent), col 1 = text. No icon cell needed if the Figma card shows no icon.

---

### hub-cta

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub CTA</td></tr>
    <tr>
      <td colspan="2">
        <p>Ready to create?</p>
        <h2>Start your free trial today</h2>
        <p>No credit card required. Cancel anytime.</p>
        <p><strong><a href="https://www.adobe.com/">Start free trial</a></strong></p>
        <p><em><a href="https://www.adobe.com/">See all plans</a></em></p>
      </td>
    </tr>
  </tbody>
</table>
```

Single cell, full-width (colspan=2). Eyebrow, heading, optional body, CTAs.

---

### hub-stats

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Stats</td></tr>
    <!-- Optional section heading: -->
    <tr>
      <td colspan="2"><h2>Trusted by millions</h2></td>
    </tr>
    <!-- One row per stat: -->
    <tr>
      <td colspan="2">
        <p>200M+</p>
        <p>Creative Cloud members</p>
        <p>as of FY2024</p>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <p>$3B</p>
        <p>Annual revenue</p>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <p>99.9%</p>
        <p>Uptime SLA</p>
      </td>
    </tr>
  </tbody>
</table>
```

Each stat row: Para 1 = big number (auto-animated), Para 2 = label, Para 3 = optional footnote.

---

### hub-quote

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Quote</td></tr>
    <tr>
      <td>
        <p>This tool completely transformed how our team collaborates on design projects. The speed is unmatched.</p>
      </td>
      <td>
        <picture><img src="https://content.da.live/.../avatar.png" alt="Jane Smith headshot"></picture>
        <p>Jane Smith</p>
        <p>Creative Director, Acme Corp</p>
      </td>
    </tr>
  </tbody>
</table>
```

Col 0 = quote text (no curly quotes — the block adds a decorative mark). Col 1 = attribution: optional avatar image first, then name `<p>`, then role/company `<p>`.

---

### hub-marquee

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Marquee</td></tr>
    <tr><td><picture><img src="https://content.da.live/.../logo1.png" alt="Partner 1"></picture></td></tr>
    <tr><td><picture><img src="https://content.da.live/.../logo2.png" alt="Partner 2"></picture></td></tr>
    <tr><td><picture><img src="https://content.da.live/.../logo3.png" alt="Partner 3"></picture></td></tr>
    <tr><td><picture><img src="https://content.da.live/.../logo4.png" alt="Partner 4"></picture></td></tr>
    <tr><td><picture><img src="https://content.da.live/.../logo5.png" alt="Partner 5"></picture></td></tr>
  </tbody>
</table>
```

One row per item (logo or text). The block duplicates items automatically for seamless looping. Aim for 6–12 items.

---

## Multi-block page example

A 5-section page (hero + marquee + featured + cards + cta):

```html
<!doctype html>
<html>
<head><title>Hub Page</title></head>
<body>
  <header></header>
  <main>
    <div>
      <table><tbody>
        <tr><td colspan="2">Hub Hero</td></tr>
        <tr>
          <td><p>Creative Suite</p><h1>Make anything you can imagine</h1><p><strong><a href="https://www.adobe.com/">Get started free</a></strong></p></td>
          <td><picture><img src="https://content.da.live/.../hero.png" alt="Hero image"></picture></td>
        </tr>
      </tbody></table>
    </div>
    <div>
      <table><tbody>
        <tr><td colspan="2">Hub Marquee</td></tr>
        <tr><td><picture><img src="https://content.da.live/.../logo1.png" alt="Brand 1"></picture></td></tr>
        <tr><td><picture><img src="https://content.da.live/.../logo2.png" alt="Brand 2"></picture></td></tr>
      </tbody></table>
    </div>
    <div>
      <table><tbody>
        <tr><td colspan="2">Hub Featured</td></tr>
        <tr>
          <td><picture><img src="https://content.da.live/.../feature.png" alt="Feature"></picture></td>
          <td><h2>Featured product</h2><p>Description.</p><p><strong><a href="https://www.adobe.com/">Try it</a></strong></p></td>
        </tr>
      </tbody></table>
    </div>
    <div>
      <table><tbody>
        <tr><td colspan="2">Hub Cards</td></tr>
        <tr><td colspan="2"><h2>All apps</h2></td></tr>
        <tr>
          <td><picture><img src="https://content.da.live/.../app1.png" alt="App 1"></picture></td>
          <td><h3>App Name</h3><p>Description.</p></td>
        </tr>
      </tbody></table>
    </div>
    <div>
      <table><tbody>
        <tr><td colspan="2">Hub CTA</td></tr>
        <tr><td colspan="2"><h2>Start free today</h2><p><strong><a href="https://www.adobe.com/">Get started</a></strong></p></td></tr>
      </tbody></table>
    </div>
  </main>
  <footer></footer>
</body>
</html>
```

---

## Special Milo block patterns

### Tabs and Carousel — content lives in tagged sections

The `Tabs` and `Carousel` blocks are just anchors. Their content is authored in **separate `<div>` sections** tagged with `section-metadata`:

```html
<!-- Tabs anchor block -->
<div>
  <table><tbody>
    <tr><td colspan="3">Tabs</td></tr>
    <tr><td>Tab One</td><td>Tab Two</td><td>Tab Three</td></tr>
  </tbody></table>
</div>

<!-- Tab One content section -->
<div>
  <table><tbody>
    <tr><td colspan="2">Hub Featured</td></tr>
    <tr>
      <td><picture><img src="..." alt="..."></picture></td>
      <td><h2>Tab One heading</h2><p>Content.</p></td>
    </tr>
  </tbody></table>
  <div class="section-metadata">
    <div><div>tab</div><div>Tab One</div></div>
  </div>
</div>

<!-- Tab Two content section -->
<div>
  <table><tbody>
    <tr><td colspan="2">Hub Cards</td></tr>
    <!-- cards content -->
  </tbody></table>
  <div class="section-metadata">
    <div><div>tab</div><div>Tab Two</div></div>
  </div>
</div>
```

The `section-metadata` div is structured as: row → key div + value div.

---

## Common mistakes to avoid

- Do NOT add a `<div class="metadata"><div>foundation</div><div>c2</div></div>` — that is for C2 only
- Do NOT add `<div class="section-metadata">` blocks — not needed for C1, **except** when using Milo `tabs` or `carousel` blocks (see "Special Milo block patterns" above)
- Do NOT use `Mobile-viewport` / `Tablet-viewport` rows inside tables — C1 blocks are CSS-responsive only
- Do NOT use `<th>` in block tables — always `<td>`
- Do NOT embed images as base64 — always use `content.da.live` URLs
- For newly-created custom blocks, derive the DA table name from the block folder name using title-case: `icon-stats` → `Icon Stats`, `metric-strip` → `Metric Strip`
