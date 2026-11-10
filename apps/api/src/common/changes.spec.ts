import { definedChanges } from './changes.js';

describe('definedChanges', () => {
  const existing = { name: 'Vechi', notes: 'ceva' as string | null, isActive: true };

  it('ignoră câmpurile netrimise și pe cele neschimbate', () => {
    expect(
      definedChanges({ name: 'Vechi', notes: undefined, isActive: undefined }, existing),
    ).toEqual({});
  });

  it('păstrează valorile schimbate, inclusiv null (ștergere)', () => {
    expect(definedChanges({ name: 'Nou', notes: null, isActive: false }, existing)).toEqual({
      name: 'Nou',
      notes: null,
      isActive: false,
    });
  });

  it('compară datele calendaristice după valoare', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    expect(definedChanges({ date: new Date(date) }, { date })).toEqual({});
  });
});
