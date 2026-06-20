# Compute Current Design System

## 1. Atmosphere & Identity

Compute Current feels like a sober infrastructure intelligence desk: dark, source-linked, and operational rather than promotional. The signature is a command-center surface where copper, teal, and restrained linework separate power, capacity, capital, supply-chain, and risk signals without making the product look like a generic AI blog.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/site | `--bg` | `#f5f5f7` | `#040607` | Global page background |
| Surface/panel | `--surface` | `#ffffff` | `rgba(7, 10, 12, 0.88)` | Cards, intelligence panels |
| Surface/soft | `--surface-soft` | `#f2f2f4` | `rgba(255, 255, 255, 0.05)` | Secondary panels and pills |
| Text/primary | `--text` | `#1d1d1f` | `#fff7e8` | Headlines and primary body |
| Text/secondary | `--muted` | `#6e6e73` | `#b8c2c8` | Decks, captions, metadata |
| Text/dim | `--public-dim` | `#77828c` | `#77828c` | Low-emphasis market context |
| Border/default | `--line` | `rgba(29, 29, 31, 0.1)` | `rgba(255, 247, 232, 0.14)` | Dividers and card outlines |
| Accent/copper | `--public-copper` | `#e2a34d` | `#e2a34d` | Primary public CTA and active signal |
| Accent/copper-strong | `--public-copper-strong` | `#ffd083` | `#ffd083` | High-emphasis links |
| Accent/teal | `--public-teal` | `#64e0c7` | `#64e0c7` | Secondary links and source trail |
| Status/risk | `--public-red` | `#ff624d` | `#ff624d` | Risk marker and alert line |

### Rules

- Copper is the primary action color; teal is for reference/source navigation.
- Purple, violet, and blue-purple AI gradients are not part of the public brand.
- Public pages should stay dark and operational; policy pages may keep the lighter legacy shell.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display | `clamp(3.1rem, 6.4vw, 5.6rem)` | 800 | 0.92 | 0 | Masthead brand |
| H1 | `clamp(2.4rem, 5vw, 4.6rem)` | 780 | 1.0 | 0 | Page titles |
| H2 | `clamp(1.8rem, 3vw, 2.6rem)` | 760 | 1.1 | 0 | Section titles |
| H3 | `1.05rem` to `1.35rem` | 750 | 1.2 | 0 | Card headlines |
| Body | `1rem` | 400 | 1.62 | 0 | Default copy |
| Body/sm | `0.9rem` | 500 | 1.45 | 0 | Card decks and metadata |
| Caption | `0.72rem` to `0.86rem` | 750 | 1.3 | 0.1em | Labels and provenance |

### Font Stack

- Primary: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`
- Display: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`
- Mono: system monospace only where operational numbers require it.

### Rules

- Letter spacing remains `0` for normal prose and headlines; uppercase labels may use positive tracking.
- Body text must not drop below `14px`.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of `4px`.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Tight inline gaps |
| `--space-2` | `8px` | Pills and compact grid gaps |
| `--space-3` | `12px` | Card inner groups |
| `--space-4` | `16px` | Standard card padding |
| `--space-5` | `20px` | Header and grid gaps |
| `--space-6` | `24px` | Large card padding |
| `--space-7` | `28px` | Command header padding |
| `--space-8` | `32px` | Page shell gutters |
| `--space-12` | `48px` | Section rhythm |
| `--space-18` | `72px` | Page bottom padding |

### Grid

- Max content width: `1360px`.
- Primary public card grid: three columns on desktop, one column on mobile.
- First viewport masthead: asymmetric two-column layout that collapses to one column below `720px`.

### Rules

- Fixed-format media uses stable aspect ratios or explicit minimum heights.
- No text should rely on viewport-width font scaling inside compact cards.

## 5. Components

### Public Article Card

- **Structure**: image/provenance block, metadata row, headline, deck, why-it-matters, impact pills, actions.
- **Variants**: feed card, lead card, related card.
- **Spacing**: `--space-3` to `--space-5`.
- **States**: image link hover, CTA hover, focus-visible outline.
- **Accessibility**: meaningful alt text for content images; decorative only when no destination exists.
- **Motion**: hover translates by `-1px` using transform only.

### Intelligence Desk

- **Structure**: market read, three context cells, lead visual card.
- **Variants**: homepage first viewport only.
- **Spacing**: `--space-4` to `--space-7`.
- **States**: lead link hover and focus.
- **Accessibility**: stable heading and labelled context group.
- **Motion**: subtle transform hover only.

### Category Navigation

- **Structure**: horizontal or wrapping link row.
- **Variants**: homepage header, taxonomy page back links.
- **Spacing**: `--space-2` and `--space-3`.
- **States**: hover border shift and focus-visible outline.
- **Accessibility**: nav landmark labels.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | `160ms` | `ease` | Link and card hover |
| Standard | `240ms` | `ease-in-out` | Panel transitions |
| Emphasis | `400ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Reserved for future page transitions |

### Rules

- Animate only `transform`, `opacity`, or color/border-color.
- All links and controls need hover and focus-visible states.
- No scroll-driven motion is required for the current public surface.

## 7. Depth & Surface

### Strategy

Mixed: dark tonal surfaces with thin borders and rare deep shadows for the command-center masthead.

| Level | Value | Usage |
|-------|-------|-------|
| Border/default | `1px solid var(--public-line)` | Public cards and panels |
| Border/strong | `1px solid var(--public-line-strong)` | Lead intelligence desk |
| Shadow/deep | `0 28px 80px rgba(0, 0, 0, 0.42)` | First viewport command header |
| Shadow/card | `0 18px 42px rgba(0, 0, 0, 0.08)` | Legacy light panels |

### Rules

- Avoid nested cards inside cards except for the homepage intelligence desk, where inner cells are market context controls.
- Do not introduce decorative orbs, purple gradients, or stock-looking abstract backgrounds.
