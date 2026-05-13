# Milo Block Inventory — Standard C1 Library

These blocks are provided by Milo (`libs/blocks/`) and are available on any proto-muse page without creating any new block files. They render with Milo's default styling.

**Priority rule:** Prefer hub-* blocks (see block-inventory.md) when they cover the pattern — those are custom-styled for this site. Use Milo blocks when no hub-* block fits and the pattern calls for functionality that exists in Milo's library (accordion, tabs, etc.).

---

## Block reference

---

### marquee

**Use when:** Full-width hero banner with a large heading, body text, CTAs, and optional background image or video. This is Milo's own hero block — distinct from `hub-hero` (which is custom-styled for this site).

**Choose hub-hero over marquee when** the Figma design closely matches proto-muse's dark gradient hero style. Use Milo `marquee` when the design is lighter or more generic.

**Visual signals:** Large heading (h1 or display size), 1–2 CTA buttons, optional background fill or image, optional small icon/logo above the heading.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Marquee (large, light)</td></tr>
    <tr>
      <td>
        <h1>Main headline</h1>
        <p>Supporting text.</p>
        <p><strong><a href="https://www.adobe.com/">Primary CTA</a></strong></p>
        <p><em><a href="https://www.adobe.com/">Secondary CTA</a></em></p>
      </td>
      <td>
        <!-- Optional foreground media image -->
        <picture><img src="https://content.da.live/.../hero-image.png" alt="Hero image"></picture>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = text (heading + body + CTAs), Col 1 = optional foreground media. The block auto-detects which column contains the heading.
**Variants:** `small`, `medium`, `large`, `xlarge` (heading size). Also: `light`, `quiet` (light backgrounds), `split` (side-by-side layout).
**Important — dark is the default:** The block applies a `dark` class automatically unless `light` or `quiet` is specified. If the Figma design has a light background, add `light` to the variant list: `Marquee (large, light)`.
**Optional background row:** To add a background image, insert a row before the content row with a single image cell. The block treats it as the background layer.

---

### aside

**Use when:** A compact side panel, notification banner, or callout box. Typically narrower than a full editorial panel — used for contextual information, alerts, or subscription prompts.

**Visual signals:** Smaller than a hero, often inset or contained width, may have a close/dismiss button, icon or small image paired with short text and a link.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Aside (split)</td></tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/.../icon.png" alt="Icon"></picture>
      </td>
      <td>
        <h3>Aside heading</h3>
        <p>Short supporting text.</p>
        <p><a href="https://www.adobe.com/">Learn more</a></p>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = icon/image (optional), Col 1 = text.
**Variants:** `split` (image + text side-by-side), `inline` (compact inline), `notification` (dismissible banner). Also: `extra-small`, `small`, `medium`, `large`.

---

### text

**Use when:** A standalone text section — heading, body copy, optional icon, and optional CTAs — without a dedicated image column. Used for centered copy sections, introductory paragraphs, or supporting text between other blocks.

**Visual signals:** No prominent image, purely typographic content. May have a small icon above or beside the heading.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Text (large)</td></tr>
    <tr>
      <td colspan="2">
        <h2>Section heading</h2>
        <p>Body copy here.</p>
        <p><a href="https://www.adobe.com/">Link text</a></p>
      </td>
    </tr>
  </tbody>
</table>
```

**Variants:** `large`, `medium`, `small`, `xlarge`. Also: `inset` (padded), `full-width`.
**Notes:** For text-only sections without images, this is almost always the right block.

---

### columns

**Use when:** A side-by-side layout with N equal or custom-width columns, where each column contains arbitrary mixed content (text, image, list, links). Not to be confused with hub-featured (which has a fixed 2-col text+image pattern). Use `columns` when there are 3+ columns or when content is not the standard text+image pair.

**Visual signals:** 2–4 columns of similar-height content, each column self-contained. No single large hero image.

**DA table format (3-column example):**

```html
<table>
  <tbody>
    <tr><td colspan="3">Columns</td></tr>
    <tr>
      <td>
        <h3>Column one</h3>
        <p>Content for column one.</p>
      </td>
      <td>
        <h3>Column two</h3>
        <p>Content for column two.</p>
      </td>
      <td>
        <h3>Column three</h3>
        <p>Content for column three.</p>
      </td>
    </tr>
  </tbody>
</table>
```

**Variants:** None standard — layout is purely determined by the number of `<td>` cells per row.
**Notes:** Each row becomes a grid row; each cell becomes a column. Keep cell counts consistent across rows.

---

### accordion

**Use when:** Expandable FAQ or feature comparison sections. Each item has a short heading and a hidden body that expands on click.

**Visual signals:** A vertical list of items with chevrons or +/- indicators. Items expand to reveal content. Commonly used for FAQs.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td>Accordion</td></tr>
    <tr><td>Question one</td></tr>
    <tr><td><p>Answer to question one.</p></td></tr>
    <tr><td>Question two</td></tr>
    <tr><td><p>Answer to question two with <a href="https://www.adobe.com/">a link</a>.</p></td></tr>
    <tr><td>Question three</td></tr>
    <tr><td><p>Answer to question three.</p></td></tr>
  </tbody>
</table>
```

**Row structure:** Alternating single-cell rows — **odd rows** (1st, 3rd, 5th…) are the question/trigger text; **even rows** (2nd, 4th, 6th…) are the expandable answer content. Each row has exactly one `<td>`. Do NOT use two cells per row.
**Variants:** `seo` (generates FAQPage schema markup), `editorial` (richer layout with media), `expand-all-button`.

---

### quote *(Milo)*

**Use when:** A pull-quote or testimonial where attribution is on the same line or immediately below. Similar to `hub-quote` but uses a 3-cell row for quote / author / cite separately.

**Choose hub-quote over this** when the design closely matches proto-muse's styled testimonial card. Use Milo `quote` for simpler, more typographic pull-quotes.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="3">Quote</td></tr>
    <tr>
      <td>The quote text goes here. No curly quotes needed.</td>
      <td>Author Name</td>
      <td>Title, Company</td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = blockquote text, Col 1 = author (figcaption), Col 2 = cite/title.
**Variants:** `long-form` (larger display size for featured quotes).
**Optional background row:** Add a row with an image before the content row for a background image.

---

### tabs

**Use when:** Content that needs to be organized into switchable panels — e.g., pricing tiers, product comparisons, feature breakdowns by audience.

**Visual signals:** Horizontal tab labels at the top, content panel below that changes on click.

**DA table format (tab labels block):**

```html
<table>
  <tbody>
    <tr><td colspan="3">Tabs</td></tr>
    <tr>
      <td>Tab One</td>
      <td>Tab Two</td>
      <td>Tab Three</td>
    </tr>
  </tbody>
</table>
```

Each tab's content goes in a **separate section** of the document with a `section-metadata` block that tags it:

```html
<div>
  <!-- Tab One content: any blocks go here -->
  <div class="section-metadata">
    <div><div>tab</div><div>Tab One</div></div>
  </div>
</div>
```

**Variants:** `segmented-control`, `stacked-mobile`.
**Notes:** The tabs block only renders the tab labels. Content for each tab is authored as separate sections tagged with matching tab names in section-metadata.

---

### carousel

**Use when:** A horizontal slider of images, cards, or content panels. Users swipe or click arrows to navigate.

**Visual signals:** Multiple cards/images side by side with prev/next arrows and dot indicators.

**DA table format (carousel anchor block):**

```html
<table>
  <tbody>
    <tr><td>Carousel Name</td></tr>
  </tbody>
</table>
```

Each slide goes in a **separate section** tagged with the carousel name:

```html
<div>
  <!-- Slide content: image, heading, text, CTA -->
  <div class="section-metadata">
    <div><div>carousel</div><div>Carousel Name</div></div>
  </div>
</div>
```

**Notes:** Like tabs, the carousel block is just an anchor. All slide content is authored as tagged sections elsewhere in the document.

---

### media

**Use when:** A standalone image or video component, optionally with a heading and text. Used for product screenshots, demo videos, or large feature images that stand alone rather than paired with text in a 2-col layout.

**Visual signals:** Dominant image or video (often full-width or large), minimal text, no CTA prominence.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Media (large)</td></tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/.../screenshot.png" alt="Product screenshot"></picture>
      </td>
      <td>
        <h2>Optional caption heading</h2>
        <p>Optional supporting text.</p>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = image/video, Col 1 = text (optional).
**Variants:** `small`, `medium`, `large`, `xlarge`, `rounded-corners`.
**Notes:** If there's no text, use a single-column table (one `<td>` in the content row). Background image optional as a first row with a single image cell.

---

### icon-block

**Use when:** A grid of small icons paired with labels or short text — typically used for feature lists, trust signals, or capability grids.

**Visual signals:** Uniform grid of icon + label pairs. Icons are roughly equal size. Often 2–4 items per row.

**DA table format:**

```html
<table>
  <tbody>
    <tr><td colspan="2">Icon Block</td></tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/.../icon1.svg" alt="Feature 1"></picture>
      </td>
      <td>
        <h3>Feature name</h3>
        <p>Short description.</p>
        <p><a href="https://www.adobe.com/">Learn more</a></p>
      </td>
    </tr>
    <tr>
      <td>
        <picture><img src="https://content.da.live/.../icon2.svg" alt="Feature 2"></picture>
      </td>
      <td>
        <h3>Another feature</h3>
        <p>Short description.</p>
      </td>
    </tr>
  </tbody>
</table>
```

**Column order:** Col 0 = icon image, Col 1 = text.
**Variants:** `vertical` (icon above text), `bio` (circular avatar style), `inline` (icon + text on same line), `full-width`.
**Notes:** For multi-column icon grids, pair with section-metadata `two-up` / `three-up` / `four-up`.

---

## When to use Milo vs hub-* blocks

| Scenario | Prefer |
|---|---|
| Hero banner matching proto-muse's dark gradient style | `hub-hero` |
| Generic hero / marquee with lighter design | Milo `marquee` |
| Editorial 2-col text + image | `hub-featured` |
| Product grid with icons | `hub-cards` |
| Full-width CTA band | `hub-cta` |
| Key metrics / numbers | `hub-stats` |
| Testimonial with avatar | `hub-quote` |
| Logo scroll strip | `hub-marquee` |
| FAQ / expandable items | Milo `accordion` |
| Switchable content panels | Milo `tabs` |
| Image/video slider | Milo `carousel` |
| Standalone text section | Milo `text` |
| N-column equal-content grid | Milo `columns` |
| Standalone large image/video | Milo `media` |
| Dismissible notification | Milo `aside (notification)` |
| Icon + label feature grid | Milo `icon-block` |
| Pull-quote, typographic | Milo `quote` |
