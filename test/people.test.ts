import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { resolveLoginUser } from '../src/lib/auth/users';
import { loadPeople, removePerson, savePerson } from '../src/lib/peopleStore';

let db: D1Database;
beforeEach(() => { db = createTestDb(); });
const manager = async () => (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: 1 }))!;
const agnes = { name: 'Agnes', color: '#e8590c' };

describe('people', () => {
  it('starts empty with no config people', async () => {
    expect(await loadPeople(db)).toEqual([]);
  });
  it('adds, edits (id stays) and removes a person', async () => {
    const m = await manager();
    expect(await savePerson(db, m, { ...agnes, match: ['Aggie'] })).toBe('ok');
    expect(await loadPeople(db)).toEqual([{ id: 'agnes', name: 'Agnes', color: '#e8590c', match: ['Aggie'] }]);
    expect(await savePerson(db, m, { name: 'Agnes B', color: '#1c7ed6' }, 'agnes')).toBe('ok');
    expect(await loadPeople(db)).toEqual([{ id: 'agnes', name: 'Agnes B', color: '#1c7ed6', match: ['Agnes B'] }]);
    expect(await removePerson(db, m, 'agnes')).toBe('ok');
    expect(await loadPeople(db)).toEqual([]);
  });
  it('refuses duplicates, bad colours and unknown ids', async () => {
    const m = await manager();
    await savePerson(db, m, agnes);
    expect(await savePerson(db, m, { name: 'agnes', color: '#000000' })).toBe('duplicate');
    expect(await savePerson(db, m, { name: 'Family', color: '#000000' })).toBe('duplicate');
    expect(await savePerson(db, m, { name: 'Theo', color: 'red' })).toBe('bad_request');
    expect(await savePerson(db, m, agnes, 'nobody')).toBe('not_found');
    expect(await removePerson(db, m, 'nobody')).toBe('not_found');
  });
});
