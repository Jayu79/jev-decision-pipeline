# Design: a calibration certificate for Jev

The project is a calibration study, and calibration comes from metrology. The
page is set like a well-made measurement report: instrument scales, fine ticks,
technical-drawing linework, numbered figures, margin notes and an inspection
tag. Every choice below follows from that.

## Color

Light only (`color-scheme: light`). A report is printed on paper; one surface
keeps the figures honest.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F5F6F4` | Page. Cool white, not cream. |
| `--raised` | `#FFFFFF` | Rarely: the specimen card and tooltips. |
| `--ink` | `#1D2124` | Graphite. Text, rules, correct answers, jev-1.13.0. |
| `--ink-2` | `#5A6168` | Secondary text, axis labels, captions. |
| `--hairline` | `#C9CDD0` | Rules, table rows, ticks. |
| `--grid` | `#E3E6E4` | Graph-paper grid inside plots only. |
| `--signal` | `#F2B705` | Only the cutoff cursor/tag, the split line, the active target mark and the inspection tag. |
| `--wrong` | `#D9480F` | Wrong answers (rings). Marks only, never text. |
| `--m114` | `#0F7B8A` | jev-1.14.0 (deep teal). |

Measured, not assumed (`python3` check, WCAG 2.x and Machado 2009 at full severity):

- Ink on paper 14.96:1, secondary on paper 5.79:1, teal on paper 4.59:1, ink on signal 8.92:1: all AA for text.
- Vermilion on paper is 3.97:1, so it's used only for graphics (3:1), never for text.
- Signal yellow on paper is 1.68:1, so it never carries meaning alone: the split line has a graphite hairline core, and dots below the cutoff also fade.
- Correct vs wrong under deuteranopia ΔE 76.9, protanopia ΔE 60.2; 1.13 vs 1.14 ΔE 36.7 and 38.4. Each pair also differs by shape (filled dot vs ring, circle vs square).

No gradients, glows, blurs, glass or drop shadows.

## Type

- **Archivo** (variable, width axis). Display at `font-stretch: 125%`, weight 600,
  `letter-spacing: -0.01em`. UI labels at normal width, regular, sentence case.
  Every number that changes or aligns uses tabular figures.
- **Source Serif 4** (variable, optical sizes) for prose: 18px, line-height 1.6,
  measure 62 to 68ch. Margin notes in italic, 14.5px.
- Scale: 13 / 15 / 18 / 22 / 30 / 44 / 72. 72 only for the instrument readouts.
- Never: tracked all-caps eyebrows, a single highlighted word, middle-dot meta
  strings, arrows after links, monospace labels.

## Grid

- 12 columns, max width 1240px, 24px gutters, 24px page margin (16px on phones).
- Main content spans columns 1 to 8. Margin notes span 10 to 12, tied to a
  superscript marker in the text. Below 1100px, notes sit under their paragraph.
- Left-aligned throughout. Sections are separated by space and one full-width
  hairline, never by boxes. Structural radius is 0; small controls at most 2px.
- Figures are numbered Fig. 1 to Fig. 5, with a small Archivo caption under each.

## Motion

One orchestrated moment: on first view the dot field fills in sorted order over
about 600ms. Everything else moves only when the reader drags, clicks or types.
All of it is skipped under `prefers-reduced-motion`.

## Sections

0. **Masthead.** A report header, not a hero banner: title, one-line question,
   a 2x3 metadata grid, and an inspection tag stating the measured result.
1. **Fig. 1, the instrument.** The one bold moment. The dot field shows every
   ticket at once, the ruler makes the cutoff a measurement, and the dials in
   the margin read out what that cutoff buys.
2. **Fig. 2, reliability.** Graph paper because it's a plotted measurement; the
   diagonal is the standard the instrument is checked against.
3. **Fig. 3, 1.13 vs 1.14.** A results table from a test report: hairlines,
   right-aligned tabular numbers, a small dot for the better value.
4. **Fig. 4, the tickets.** A specimen viewer: pick any sample and inspect it.
   Top-5 probabilities are drawn as fine measurement bars.
5. **Fig. 5, how it's built.** A technical drawing with numbered callouts, since
   the pipeline is a real sequence and each step has a design decision.
6. **What I'd build at TypeSafe.** A numbered list, plainly set.
7. **About the author.** A colophon at the end, not a pitch.
8. **Footer.** Credits and the source link.

## Details

- Focus: 2px graphite outline, 2px offset, on every control.
- Hover changes only what's needed: underline or ink weight. No lift or scale.
- Favicon: a ruler with a graphite cursor and a yellow tick.
- Open Graph image (1200x630): generated at build time from the data.
- Print: controls hidden, figures kept, no page breaks inside a figure.
