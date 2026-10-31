import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Renders the chores components on the server with the demo data. The type check and the build do not run a component, so a runtime
// mistake (a rune renamed into a store, a missing field) only shows up here, as a blank page.
let server: ViteDevServer;
let render: (c: unknown, o: { props: Record<string, unknown> }) => { body: string };
const load = async (path: string) => (await server.ssrLoadModule(path)).default;

beforeAll(async () => {
  server = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom', plugins: [svelte({ preprocess: vitePreprocess() })] });
  render = (await server.ssrLoadModule('svelte/server')).render;
}, 30_000);
afterAll(() => server.close());

describe('chores components render', () => {
  const props = async () => {
    const d = await server.ssrLoadModule('/src/demo/data.ts');
    return { initial: d.demoChores(), people: d.demoPeople, demo: true };
  };
  it('the manager overview shows what needs attention and today', async () => {
    const p = await props();
    const html = render(await load('/src/components/ManageOverview.svelte'), { props: { chores: p.initial, people: p.people, demo: true, inboxHref: '/demo/inbox', go() {}, openChores() {} } }).body;
    expect(html).toContain('Needs you');
    expect(html).toContain('Today');
    expect(html).toContain('held until');
  });
  it('the chore planner lists each chore with its days, points and time of day', async () => {
    const p = await props();
    const r = p.initial.routines.find((x: { person: string }) => x.person === 'agnes');
    const html = render(await load('/src/components/RoutineEditor.svelte'), { props: { person: 'agnes', name: 'Agnes', items: r.items, bonuses: r.bonuses, day: p.initial.day, busy: false, send: async () => true, routines: p.initial.routines } }).body;
    expect(html).toContain('Make your bed');
    expect(html).toContain('Points for Feed Fluffy');
  });
  it('the manager page, a person page and the board', async () => {
    const p = await props();
    expect(render(await load('/src/components/ChoreManager.svelte'), { props: p }).body).toContain('Overview');
    expect(render(await load('/src/components/PersonChores.svelte'), { props: { ...p, who: 'agnes' } }).body).toContain('Rewards');
    expect(render(await load('/src/components/Chores.svelte'), { props: p }).body).toContain('Together');
  });
}, 30_000);
