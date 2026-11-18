# Design template

Every screen is built from the pieces in this folder and the tokens at the top
of `app/globals.css`. If a screen needs a button, panel, toggle or tool window,
use these; do not hand-write a new one.

| Rule   | Value |
|--------|-------|
| Colour | `gold-*` is the only accent, `ink-*` the surfaces. Green, red, amber and blue are reserved for meaning: success, danger, warning, info. |
| Shape  | Controls 12px (`rounded-xl`). Cards and panels 16px (`rounded-2xl`). Dialogs 24px (`rounded-3xl`). Pills, avatars and floating buttons fully round. A shape nested inside padding uses the next radius down. |
| Size   | Controls are 32 / 40 / 48px tall (`sm` / `md` / `lg`). Icons 14 / 16 / 20px. |
| Space  | 4px grid. Panels pad 12-16px, cards 20-24px. 16px between cards, 24px between page sections. |
| Type   | Inter everywhere, Cormorant Garamond for `h1`-`h3`. 12 caption, 14 body, 16 card title, 20 section title, 30-36 page title. Never below 11px. |
| Focus  | One gold outline on keyboard focus, set globally. Do not remove it. |
| Motion | Colour transitions of 150ms. Animations switch off under "reduce motion". |

## Components

- `button.tsx`: `Button` and `buttonVariants()` (for links). Variants: `primary`
  (one per surface), `secondary` (default), `outline`, `ghost`, `danger`, `success`.
- `panel.tsx`: `Panel` (grouped area), `Stat` (number with caption), `Eyebrow` (small label).
- `segmented.tsx`: `Segmented`, pick one of a few options.
- `tool-dialog.tsx`: `ToolDialog`, the window every practice tool opens in.
- `pitch-trail.tsx`: `PitchTrail`, the moving line of a singer's voice against a target note.
- `lib/use-draggable-fab.ts`: makes a floating button draggable.

## Screens on the template so far

Teacher dashboard, Calendar, the weekly lesson editor, Pitch Perfect, Rhythm
Trainer, Scale Trainer. Other screens still use older hand-written styles and
should be moved over when they are next touched.
