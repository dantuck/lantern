import { defineConfig, presetWind4, transformerDirectives, transformerVariantGroup } from 'unocss';
import extractorSvelte from '@unocss/extractor-svelte';

// Colours and sizes point at the CSS variables in src/styles/global.css, so the light/dark theme switch
// (html[data-theme] and prefers-color-scheme) keeps working without a `dark:` variant on every element.
export default defineConfig({
  presets: [presetWind4({ preflights: { reset: false } })],
  extractors: [extractorSvelte()],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  shortcuts: {
    // Surfaces. Contextual overrides (.grid > .card, print, wall mode) stay in global.css and key off these class names.
    card: 'bg-card border border-solid border-line rounded-[var(--radius)] p-[1.1rem] shadow-[var(--shadow-sm)] sm:p-6 [section&]:mb-5 [section&]:overflow-x-auto [details&]:mb-5 [details&]:overflow-x-auto',
    notice: 'flex gap-[.6rem] py-3 px-4 mb-5 text-fg bg-accent-soft border border-solid border-[color-mix(in_srgb,var(--accent)_30%,transparent)] rounded-[var(--radius-sm)] text-[.95rem]',
    // Form row: fields grow from 12rem, buttons size to their label.
    row: 'flex flex-wrap gap-3 items-end [&>div]:flex-[1_1_12rem] [&>div]:min-w-0 [&>.role]:flex-[0_1_12rem] [&_button]:w-auto [&_button]:m-0 [&_button]:py-[.7rem] [&_button]:px-5',
  },
  theme: {
    colors: {
      bg: 'var(--bg)', fg: 'var(--fg)', muted: 'var(--muted)', card: 'var(--card)', card2: 'var(--card-2)',
      line: 'var(--border)', accent: 'var(--accent)', 'accent-fg': 'var(--accent-fg)', 'accent-soft': 'var(--accent-soft)',
      danger: 'var(--danger)', ring: 'var(--ring)',
    },
    font: { sans: 'var(--font)' },
  },
});
