/**
 * Theme presets reference file
 *
 * Not a runtime system — just a reference. To switch themes:
 * 1. Pick a preset below
 * 2. Copy its tokens into globals.css :root block
 *
 * Current active theme: editorial
 */

export const themes = {
  /** Current: Light editorial with Westfield blue accents */
  editorial: {
    ink: "#1A1A1A",
    "ink-light": "#4A4A4A",
    "ink-muted": "#8A8A8A",
    paper: "#FAF8F4",
    "paper-dark": "#F0EDE6",
    "paper-pure": "#FFFFFF",
    accent: "#2B5EA7",
    "accent-light": "#3A71C1",
    sage: "#6B7F5E",
    sienna: "#A0522D",
    blue: "#4A6B8A",
  },

  /** Dark mode editorial — warm twilight palette */
  twilight: {
    ink: "#E8E4DE",
    "ink-light": "#B8B0A4",
    "ink-muted": "#7A7268",
    paper: "#1C1A17",
    "paper-dark": "#14120F",
    "paper-pure": "#242220",
    accent: "#5B8FD4",
    "accent-light": "#7BAAE0",
    sage: "#8FA882",
    sienna: "#C47A5A",
    blue: "#6B92B8",
  },

  /** V1 premium — navy + gold from original design */
  premium: {
    ink: "#E8E4DE",
    "ink-light": "#B8B0A4",
    "ink-muted": "#7A7268",
    paper: "#0A1628",
    "paper-dark": "#060F1E",
    "paper-pure": "#122240",
    accent: "#B8860B",
    "accent-light": "#D4A843",
    sage: "#6B7F5E",
    sienna: "#A0522D",
    blue: "#4A6B8A",
  },
} as const;
