# Block Inventory — proto-muse C1 Blocks

## How to use this file (Phase 0)

Read each major page section top-to-bottom from the Figma design. For each section:

1. Identify the **visual pattern**: layout shape, number of columns, content types present.
2. Compare against the matching heuristics below to find the best existing block.
3. Assign the block name, or mark as `NEW: hub-<descriptive-noun>` if nothing fits.

**Bias strongly toward existing blocks.** Prefer variants (`dark`, `media-right`) over creating new blocks. Only mark a section as NEW when the visual pattern is genuinely not served by any existing block + variant combination.

---

## Quick matching heuristics

| Visual pattern | Block |
|---|---|
| Full-width dark/gradient bg + large heading left + image right | `hub-hero` |
| Two-column editorial: image on one side, text on the other | `hub-featured` |
| Grid of 3–8 cards each with icon + title + short description | `hub-cards` |
| Full-width centered band: single heading + 1–2 CTA buttons | `hub-cta` |
| Row of large numbers / percentages / metrics with labels below | `hub-stats` |
| Single pull-quote or testimonial with attribution text | `hub-quote` |
| Horizontal strip of logos, award badges, or short trust signals | `hub-marquee` |
| No match | `NEW: hub-<descriptive-noun>` |

---

## Block reference

---

### hub-hero

**Use when:** Opening hero section. Largest heading on the page. Primary CTA. Two-column layout with text on the left and a product/scene image on the right.

**Visual signals:** Dark or gradient background, h1-size heading, prominent CTA button, illustration or screenshot taking up roughly half the width.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Hero</td></tr>
    <tr>
      <td>
        <p>eyebrow text</p>
        <h1>Main headline</h1>
        <p>Body / descriptor text.</p>
        <p><strong><a href="#">Primary CTA</a></strong></p>
        <p><em><a href="#">Secondary CTA</a></em></p>
      </td>
      <td>
        <picture><img src="https://content.da.live/..." alt="Hero image"></picture>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = text, Col 1 = media.
**Variants:** None standard.
**Notes:** Eyebrow is optional. Only one CTA is fine. `img.loading = 'eager'` is set automatically by the block.

---

### hub-featured

**Use when:** Two-column editorial panel alternating text and image down the page. Often used in pairs where one panel has image-left and the next has image-right.

**Visual signals:** Roughly equal text column and media column side-by-side, body-size heading (h2), 1–2 CTAs, optional tag chips at the bottom of the text column.

**DA table format (default — image left):**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Featured</td></tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/..." alt="Feature image"></picture>
      </td>
      <td>
        <p>eyebrow text</p>
        <h2>Section heading</h2>
        <p>Body text describing the feature.</p>
        <p><strong><a href="#">Primary CTA</a></strong></p>
        <p><em><a href="#">Secondary CTA</a></em></p>
      </td>
    </tr>
  </tbody>
</table>
```

**DA table format (image right — `media-right` variant):**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Featured (media-right)</td></tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/..." alt="Feature image"></picture>
      </td>
      <td>
        <p>eyebrow text</p>
        <h2>Section heading</h2>
        <p>Body text.</p>
        <p><strong><a href="#">CTA</a></strong></p>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = media (always), Col 1 = text (always). The `media-right` variant flips the visual layout via CSS — the DOM column order stays the same.

**Variants:** `media-right` (image appears on right visually), `dark` (dark bg), or both: `Hub Featured (dark, media-right)`.

**Tags:** To render tag chips below the CTA, add a final `<p>` in the text cell with pipe-separated values: `<p>Tag One | Tag Two | Tag Three</p>`. The block converts this automatically.

---

### hub-cards

**Use when:** Product grid or feature grid. 3–8 items each with a small icon or product logo, a title, a short description, and an optional link.

**Visual signals:** Regular grid of identically-sized cards, icon in the top-left or top-center of each card, card title below the icon, short body text, optional link at the bottom.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Cards</td></tr>
    <!-- Optional section heading row (single cell): -->
    <tr>
      <td colspan="2">
        <p>eyebrow</p>
        <h2>Section heading</h2>
        <p>Optional intro text.</p>
      </td>
    </tr>
    <!-- One row per card: -->
    <tr>
      <td><picture><img src="https://content.da.live/..." alt="Product icon"></picture></td>
      <td>
        <h3>Card title</h3>
        <p>Short description of this item.</p>
        <p><a href="#">Learn more</a></p>
      </td>
    </tr>
    <tr>
      <td><picture><img src="https://content.da.live/..." alt="Product icon"></picture></td>
      <td>
        <h3>Another card</h3>
        <p>Short description.</p>
        <p><a href="#">Learn more</a></p>
      </td>
    </tr>
    <!-- repeat for each card -->
  </tbody>
</table>
```

**Column order:** Col 0 = icon/image (optional; auto-generated from title initials if absent), Col 1 = text.

**Variants:** None standard. Card colors cycle automatically from an Adobe palette (`#eb1000`, `#1473e6`, `#e34850`, `#2d9d78`, `#9256d9`, …).

**Notes:** The heading row is detected as a single-cell row containing an h2, h3, or `<strong>`. Include it when the Figma design shows a section title above the card grid. Omit it if the cards stand alone.

---

### hub-cta

**Use when:** Full-width call-to-action band. Centered text. High-contrast background (Adobe red or dark). 1–2 buttons.

**Visual signals:** Single centered text block spanning the full width, no image, prominent button(s) below the heading.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub CTA</td></tr>
    <tr>
      <td colspan="2">
        <p>eyebrow</p>
        <h2>CTA heading</h2>
        <p>Optional supporting text.</p>
        <p><strong><a href="#">Primary button</a></strong></p>
        <p><em><a href="#">Secondary button</a></em></p>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Single cell (colspan=2). No media column.

**Variants:** None standard. Background color is a CSS variable (`--hub-cta-bg`).

**Notes:** Eyebrow optional. Only one CTA button is common. Supporting text is optional.

---

### hub-stats

**Use when:** A row of large numbers, percentages, or metrics — each with a short label and an optional footnote beneath it. Typically used to communicate scale or social proof.

**Visual signals:** 3–5 oversized numbers (e.g., "200M+", "99.9%", "$3B") arranged horizontally, each with a short label line below, possibly a footnote line in smaller type.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Stats</td></tr>
    <!-- Optional section heading (single cell with h2): -->
    <tr>
      <td colspan="2"><h2>By the numbers</h2></td>
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
        <p>99.9%</p>
        <p>Uptime SLA</p>
      </td>
    </tr>
    <!-- repeat for each stat -->
  </tbody>
</table>
```

**Column order:** All single-cell rows. Para 1 = big number (animated count-up). Para 2 = label. Para 3 = optional footnote.

**Variants:** `dark` → `Hub Stats (dark)`.

**Notes:** The count-up animation is automatic for numeric values. Non-numeric stat values (e.g., "Enterprise") are displayed as-is without animation.

---

### hub-quote

**Use when:** A single pull-quote or customer testimonial with attribution. Quote text on the left, name/role/avatar on the right.

**Visual signals:** Large quotation mark or styled quote text block, attribution line(s) with person's name and role/company, optional headshot or avatar image.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Quote</td></tr>
    <tr>
      <td>
        <p>The quote text goes here without opening/closing curly quotes — the block adds the decorative mark automatically.</p>
      </td>
      <td>
        <picture><img src="https://content.da.live/..." alt="Avatar"></picture>
        <p>Person Name</p>
        <p>Title, Company</p>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = quote text, Col 1 = attribution (optional avatar img first, then name p, then role/company p).

**Variants:** `dark` → `Hub Quote (dark)`.

**Notes:** Avatar image is optional. If no image, omit the `<picture>` tag and start the attribution cell with the name `<p>` directly. Do NOT include curly quotes in the quote text — the block inserts a decorative `"` mark automatically.

---

### hub-marquee

**Use when:** An infinite-scroll horizontal strip of logos, award badges, partner icons, or short trust-signal text items.

**Visual signals:** A row of repeating items that would naturally scroll or loop horizontally. Items are uniform in size. Often used between content sections as a visual separator.

**DA table format (one row per item):**

```html
<table>
  <tbody>
    <tr><td colspan="2">Hub Marquee</td></tr>
    <tr><td><picture><img src="https://content.da.live/..." alt="Partner logo"></picture></td></tr>
    <tr><td><picture><img src="https://content.da.live/..." alt="Award badge"></picture></td></tr>
    <tr><td><p>Trust signal text</p></td></tr>
    <!-- repeat for each item (8–12 items typical) -->
  </tbody>
</table>
```

**Column order:** Single-cell rows. Each row is one marquee item (image or text).

**Variants:** `dark` → `Hub Marquee (dark)`.

**Notes:** Items are automatically duplicated by the block to create a seamless looping animation. You only need to author each item once. The marquee pauses on hover automatically.

---

## NEW block decision rule

Mark a section as `NEW: hub-<name>` only if:
- No existing block covers the layout pattern, AND
- No variant combination (`dark`, `media-right`) resolves the difference.

When in doubt, stretch an existing block to fit — a slightly imperfect match is better than an unnecessary new block for a prototype.

If you do create a new block, name it `hub-<descriptive-noun>` in kebab-case (e.g., `hub-promo`, `hub-timeline`, `hub-comparison`).
