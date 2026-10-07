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
    // Button variants. The bare `button` defaults (filled accent) stay in global.css; these override them.
    link: 'bg-transparent text-muted w-auto p-0 m-0 border-0 shadow-none font-medium no-underline hover:text-fg hover:filter-none',
    danger: 'bg-danger text-white',
    ghost: 'bg-transparent text-fg border-line shadow-none [&:hover:not(:disabled)]:bg-card2 [&:hover:not(:disabled)]:filter-none',
    // Navigation. `nav`, `tabbar` and `sheet` also stay on the elements as markers (wall mode, print and pwa.ts select on them).
    // Side rail, tablet and up. On phones it is hidden: the tabbar and the More sheet take over.
    rail: 'hidden md:flex fixed top-[env(safe-area-inset-top)] bottom-0 left-0 z-10 w-24 flex-col items-stretch gap-[.55rem] py-4 pr-2 pl-[max(.5rem,env(safe-area-inset-left))] overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-card shadow-[inset_-1px_0_var(--border)] [&>*]:shrink-0',
    // The active rail link is a "folder tab": it takes the page colour, runs out over the rail's edge, and curves into the page.
    'rail-link': 'flex flex-col items-center justify-center gap-[.3rem] min-w-0 min-h-14 py-[.65rem] px-[.2rem] rounded-[18px] no-underline text-muted font-semibold text-[.74rem] leading-[1.15] text-center transition-[background-color,color] duration-150 [&:not([aria-current]):hover]:text-fg [&:not([aria-current]):hover]:bg-card2 [&_.icon]:block [&_.icon:not(.icon-img)]:size-[1.6rem] [&_.icon-img]:size-[1.9rem] [&[aria-current]]:relative [&[aria-current]]:-mr-2 [&[aria-current]]:pr-[.7rem] [&[aria-current]]:rounded-[18px_0_0_18px] [&[aria-current]]:bg-bg [&[aria-current]]:text-accent [&[aria-current]]:before:content-[""] [&[aria-current]]:before:absolute [&[aria-current]]:before:right-0 [&[aria-current]]:before:size-[14px] [&[aria-current]]:before:pointer-events-none [&[aria-current]]:before:-top-[14px] [&[aria-current]]:before:bg-[radial-gradient(circle_at_0_0,transparent_14px,var(--bg)_14.5px)] [&[aria-current]]:after:content-[""] [&[aria-current]]:after:absolute [&[aria-current]]:after:right-0 [&[aria-current]]:after:size-[14px] [&[aria-current]]:after:pointer-events-none [&[aria-current]]:after:-bottom-[14px] [&[aria-current]]:after:bg-[radial-gradient(circle_at_0_100%,transparent_14px,var(--bg)_14.5px)]',
    'rail-act': 'inline-flex flex-col items-center justify-center gap-[.3rem] min-w-0 min-h-14 py-[.65rem] px-[.2rem] rounded-[18px] bg-transparent border-0 shadow-none text-muted no-underline font-semibold text-[.74rem] leading-[1.15] text-center [button&]:m-0 [&[hidden]]:hidden',
    'rail-btn': 'rail-act hover:bg-card2 hover:text-fg hover:filter-none',
    // Phone bottom bar and its More sheet.
    tabbar: 'fixed inset-x-0 bottom-0 z-20 flex gap-[.15rem] pt-[.3rem] pb-[max(.3rem,env(safe-area-inset-bottom))] pl-[max(.4rem,env(safe-area-inset-left))] pr-[max(.4rem,env(safe-area-inset-right))] bg-[color-mix(in_srgb,var(--card)_92%,transparent)] backdrop-saturate-[1.6] backdrop-blur-[14px] [border-top:1px_solid_var(--border)] [view-transition-name:tabbar] md:!hidden',
    'tab-item': 'flex flex-col items-center justify-center gap-[.15rem] flex-[1_1_0] min-w-0 min-h-14 py-[.3rem] px-[.15rem] border-0 rounded-[14px] bg-transparent shadow-none text-muted text-[.7rem] font-semibold leading-[1.1] no-underline [button&]:m-0 [button&]:w-auto hover:bg-card2 hover:text-fg hover:filter-none [&[aria-current]]:text-accent [&[aria-current]]:bg-accent-soft [&[aria-expanded=true]]:text-accent [&[aria-expanded=true]]:bg-accent-soft [&>span]:max-w-full [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap [&_.icon:not(.icon-img)]:size-[1.4rem] [&_.icon-img]:size-[1.5rem]',
    'sheet-pop': 'm-0 inset-x-[.6rem] top-auto bottom-[calc(4.6rem+env(safe-area-inset-bottom))] w-auto max-h-[70dvh] overflow-auto p-[.6rem] bg-card text-fg border border-solid border-line rounded-[var(--radius)] shadow-[var(--shadow-md)] backdrop:bg-[rgb(0_0_0/.35)] md:!hidden',
    'sheet-link': 'flex items-center gap-[.9rem] min-h-13 px-[.9rem] rounded-[14px] text-fg font-semibold no-underline [&:not([aria-current]):hover]:bg-card2 [&[aria-current]]:text-accent [&[aria-current]]:bg-accent-soft [&_.icon:not(.icon-img)]:size-[1.4rem] [&_.icon-img]:size-[1.5rem]',
    'sheet-utils': 'flex flex-wrap items-center gap-x-3 gap-y-2 pt-[.6rem] px-2 pb-[.2rem] [&_.theme]:border [&_.theme]:border-solid [&_.theme]:border-line [.sheet-links+&]:mt-2 [.sheet-links+&]:[border-top:1px_solid_var(--border)]',
    'sheet-act': 'inline-flex items-center min-h-11 py-[.4rem] px-[.9rem] border border-solid border-line rounded-[12px] bg-transparent shadow-none text-fg text-[.9rem] font-semibold no-underline [button&]:m-0 [button&]:w-auto [&[hidden]]:hidden',
    // Compact button (row actions) and bare field inside a flex form. `&&` outranks `.row button`, as the old scoped `.small` did.
    small: '[&&]:w-auto [&&]:m-0 [&&]:py-[.3rem] [&&]:px-[.8rem] [&&]:text-[.85rem] pointer-coarse:min-h-11',
    field: 'm-0 w-auto',
    // Weekday toggle in the chore editor.
    'day-chip': '[&&]:w-auto [&&]:m-0 py-[.3rem] px-[.65rem] rounded-full bg-transparent text-inherit border-[1.5px] border-solid border-line shadow-none text-[.85rem] pointer-coarse:min-h-11 [&[aria-pressed=true]]:bg-accent [&[aria-pressed=true]]:border-accent [&[aria-pressed=true]]:text-white [&:disabled:not([aria-pressed=true])]:opacity-35 [&:disabled:not([aria-pressed=true])]:line-through',
    // Round check button. Colour comes from --c (a person's colour) and falls back to the accent; size is set where it is used.
    tick: 'grid place-items-center flex-none m-0 p-0 rounded-full bg-transparent border-[2.5px] border-solid border-[var(--c,var(--accent))] shadow-none text-transparent [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--c,var(--accent))_14%,transparent)] [&:hover:not(:disabled)]:filter-none [&[aria-pressed=true]]:bg-[var(--c,var(--accent))] [&[aria-pressed=true]]:text-white [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:3] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]',
    'icon-btn': 'grid place-items-center flex-none size-11 m-0 p-0 rounded-full bg-transparent text-muted border-0 shadow-none [&:hover:not(:disabled)]:bg-card2 [&:hover:not(:disabled)]:text-fg [&:hover:not(:disabled)]:filter-none [&_svg]:size-[1.1rem] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2] [&_svg]:[stroke-linecap:round]',
    // Inputs inside a flex list row: one that grows, one fixed-width number.
    'fill-in': 'm-0 flex-[1_1_12rem]',
    'num-in': 'm-0 flex-[0_0_5.5rem] w-[5.5rem]',
    'row-item': 'flex flex-wrap items-center gap-2 mb-2',
    // Secondary text under a heading or beside a control.
    note: 'text-muted text-[.9rem] font-normal',
    'ledger-row': 'flex flex-wrap gap-x-[.6rem] gap-y-[.1rem] py-[.3rem] [border-top:1px_solid_var(--border)]',
    // Person avatar disc (colour from --c, size set where used) and progress bars.
    avatar: 'grid place-items-center flex-none rounded-full bg-[var(--c)] text-white font-bold',
    track: 'rounded-full bg-card2 overflow-hidden',
    fill: 'block h-full rounded-[inherit] transition-[width] duration-[250ms] ease-out',
    'list-row': 'flex items-center gap-[.85rem] py-[.55rem] [li+&]:[border-top:1px_solid_var(--border)]',
    // Card heading in the person page, and a stat tile.
    'card-h': 'mt-0 mb-[.6rem] text-[1.15rem]',
    stat: 'grid gap-[.1rem] min-w-[8.5rem] py-[.6rem] px-[.9rem] rounded-[var(--radius)] bg-card shadow-[var(--shadow-sm)]',
    'stat-n': 'text-[1.8rem] [font-weight:750] tracking-[-.02em] text-fg tabular-nums [&>span[aria-hidden=true]]:text-[color:var(--c)]',
    // Chores page: filter chips, segmented control, count badge.
    'person-chip': 'inline-flex items-center gap-[.4rem] w-auto m-0 p-[.15rem] rounded-full text-[.85rem] font-semibold text-fg shadow-none bg-[color-mix(in_srgb,var(--c)_14%,var(--card))] [border:1px_dashed_color-mix(in_srgb,var(--c)_65%,transparent)] [&:not([aria-pressed=true]):hover]:filter-none [&:not([aria-pressed=true]):hover]:bg-[color-mix(in_srgb,var(--c)_24%,var(--card))] [&[aria-pressed=true]]:[border-style:solid] [&[aria-pressed=true]]:border-[var(--c)] [&[aria-pressed=true]]:bg-[color-mix(in_srgb,var(--c)_26%,var(--card))] [&[aria-pressed=true]]:pr-[.7rem] pointer-coarse:min-h-11',
    'seg-group': 'inline-flex p-[3px] gap-[2px] bg-card2 border border-solid border-line rounded-full max-[40rem]:flex-[1_1_100%]',
    'seg-btn': 'flex flex-col items-center justify-center gap-[.15rem] min-h-14 w-auto m-0 py-[.4rem] px-[.85rem] text-[.9rem] rounded-full bg-transparent text-muted border-0 shadow-none [&:not([aria-pressed=true]):hover]:text-fg [&:not([aria-pressed=true]):hover]:filter-none [&[aria-pressed=true]]:bg-card [&[aria-pressed=true]]:text-accent [&[aria-pressed=true]]:shadow-[var(--shadow-sm)] pointer-coarse:min-h-11 max-[40rem]:flex-1 max-[40rem]:px-0',
    'count-badge': 'inline-grid place-items-center min-w-[1.4rem] h-[1.4rem] px-[.4rem] box-border leading-none rounded-full text-[.8rem] text-center',
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
