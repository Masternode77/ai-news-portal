# Compute Current Design System

## 1. Atmosphere & Identity

Compute Current is a light, source-linked editorial product for AI-infrastructure readers. The public surface is calm and legible: a white canvas, neutral type, hairline dividers, soft elevation, and a restrained blue action color. It should feel like a considered publication, not a trading terminal, a dark command center, or a generic AI landing page.

## 2. Color & Surface

### Core tokens

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Page canvas | `--al-bg` | `#ffffff` | Main public background |
| Soft surface | `--al-soft` | `#f5f5f7` | Cards, house promotions, secondary actions |
| Primary text | `--al-text` | `#1d1d1f` | Headlines and primary copy |
| Muted text | `--al-muted` | `#6e6e73` | Decks, metadata, supporting copy |
| Faint text | `--al-faint` | `#a1a1a6` | Low-emphasis labels |
| Divider | `--al-hairline` | `rgba(0, 0, 0, 0.08)` | Borders and separators |
| Strong divider | `--al-hairline-strong` | `rgba(0, 0, 0, 0.14)` | Hover and active borders |
| Primary action | `--al-blue` | `#0071e3` | Primary buttons and action links |
| Primary action/hover | `--al-blue-deep` | `#0066cc` | Strong action emphasis |
| Fresh status only | `--al-green` | `#34c759` | Verified-current status dot only |

### Rules

- Public and policy pages use the same light, neutral foundation; policy pages are not a separate legacy theme.
- Blue is reserved for actions and clear interactive affordances. Decorative background gradients are prohibited; the small, aria-hidden masthead mark is the sole blue-gradient exception and serves as the product identifier, not a page or surface treatment.
- Category colors may distinguish coverage lanes, but must not replace the neutral reading surface.
- Status color is semantic: a stale or failed update must not retain a green live indicator.

## 3. Typography

| Level | Size | Weight | Line height | Usage |
| --- | --- | --- | --- | --- |
| Display | `clamp(3.1rem, 6.4vw, 5.6rem)` | 800 | 0.92 | Homepage wordmark |
| H1 | `clamp(2.4rem, 5vw, 4.6rem)` | 760–780 | 0.98–1.0 | Page titles |
| H2 | `clamp(1.6rem, 3vw, 2.6rem)` | 700–760 | 1.0–1.1 | Section titles |
| Body | `1rem` | 400–560 | 1.6+ | Reading copy |
| Label | `0.64rem`–`0.86rem` | 600–750 | 1.3 | Eyebrows, provenance, status |

- Use the existing system stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`.
- Keep prose at 14px or larger and avoid tight tracking in paragraphs.
- Uppercase labels may use modest positive tracking; do not uppercase body copy.

## 4. Layout & Spacing

- Spacing follows a 4px rhythm, with common steps of 8, 12, 16, 20, 24, 32, 48, and 72px.
- The primary public shell is at most 1360px wide. Policy content narrows to a readable 980px shell.
- The homepage masthead is a lightly elevated, rounded white bar. Its desktop composition may be asymmetric; it collapses cleanly below 720px.
- Content cards use explicit media ratios or minimum heights. Do not use clipping to hide reserved ad space or reading content.
- Interactive controls retain a minimum target size of 40px, with 44px preferred for primary actions.

## 5. Components

### Editorial masthead and status line

- The masthead is sticky, light, rounded, and separated by a hairline border with a soft shadow.
- Compact masthead actions retain a 40px minimum target; primary actions outside that compact context prefer 44px.
- The status line communicates operational state precisely. It may show a green dot only for a verified fresh state.
- When source scanning, scheduled updates, and authorized long-form publishing differ, name each state plainly. Never imply a fresh original article from a source-linked record.

### Article and feed cards

- Cards combine image/provenance, metadata, headline, deck, and source-oriented actions.
- Use meaningful image alt text when an image links to editorial content.
- Hover motion is limited to a small transform and shadow change; focus-visible must remain obvious.

### House promotions and advertising

- A no-inventory route may show a clearly identified Compute Current house promotion rather than a blank paid-ad shell.
- Paid advertising, when active, is labeled exactly `Advertisements` and uses stable, variant-specific reserved dimensions.
- Promotion CTAs are keyboard reachable and retain a visible focus outline.

### Policy pages

- Policy pages inherit the public light system, with an eyebrow, a prominent H1, a readable lead, and ruled sections.
- Inline text adjacent to links, dates, or dynamic values must render with deliberate spaces; source formatting alone is not sufficient.

## 6. Interaction & Accessibility

- All links and controls need hover and `:focus-visible` states.
- Use semantic landmarks and explicit accessible names for navigation, promotional asides, and status groups where appropriate.
- Respect reduced motion. Animate only transform, opacity, color, background-color, border-color, and box-shadow; micro-interactions should remain around 160ms.
- Do not rely on color alone for a material status or disclosure.

## 7. Depth & Restraint

| Level | Value | Usage |
| --- | --- | --- |
| Card shadow | `0 4px 22px rgba(0, 0, 0, 0.05)` | Resting masthead and elevated cards |
| Hover shadow | `0 14px 36px rgba(0, 0, 0, 0.1)` | Interactive card emphasis |
| Radius | `18px` | Primary cards and house promotions |

- Favor open canvas and single-level cards over nested panels.
- Avoid dark visual identity, copper or teal primary controls, decorative orbs, and purple-gradient AI motifs.
- Preserve the existing light/neutral/blue editorial language; this system governs refinements, not a redesign.
