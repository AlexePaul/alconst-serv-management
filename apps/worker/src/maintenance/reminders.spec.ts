import { planReminders, type ReminderTask } from './reminders.js';

const today = '2026-11-10';
const users = new Set(['ana', 'dan']);
const task = (overrides: Partial<ReminderTask>): ReminderTask => ({
  id: 't1',
  title: 'Deplasare',
  dueDate: today,
  clientName: 'SC Exemplu SRL',
  assigneeId: 'ana',
  clientResponsibleIds: [],
  ...overrides,
});
const plan = (tasks: ReminderTask[], settings: [string, number][] = [], day = today) =>
  planReminders(tasks, day, users, new Map(settings));

describe('planReminders', () => {
  it('anunță termenul de azi responsabilului', () => {
    expect(plan([task({})])).toEqual([
      {
        userId: 'ana',
        taskId: 't1',
        type: 'TASK_DUE_TODAY',
        title: 'Termen astăzi',
        body: 'Deplasare · SC Exemplu SRL',
        dedupeKey: 'due-today:t1:ana:2026-11-10',
      },
    ]);
  });

  it('include intervalul orar în reamintire, dacă există', () => {
    expect(plan([task({ timeRange: '10:00–12:00' })])[0]?.body).toBe(
      'Deplasare · SC Exemplu SRL · 10:00–12:00',
    );
    expect(plan([task({ clientName: null, timeRange: null })])[0]?.body).toBe('Deplasare');
  });

  it('reamintește în avans doar în fereastra aleasă de utilizator', () => {
    const inThree = task({ dueDate: '2026-11-13' });
    expect(plan([inThree])[0]).toMatchObject({
      type: 'TASK_DUE_SOON',
      body: 'Deplasare · SC Exemplu SRL · în 3 zile',
    });
    expect(plan([task({ dueDate: '2026-11-14' })])).toEqual([]);
    expect(plan([task({ dueDate: '2026-11-14' })], [['ana', 7]])).toHaveLength(1);
    expect(plan([inThree], [['ana', 0]])).toEqual([]);
    expect(plan([task({ dueDate: '2026-11-11' })])[0]?.body).toContain('mâine');
  });

  it('aceeași reamintire are aceeași cheie în zile diferite, deci nu se repetă', () => {
    const due = task({ dueDate: '2026-11-13' });
    expect(plan([due], [], '2026-11-10')[0]?.dedupeKey).toBe(
      plan([due], [], '2026-11-12')[0]?.dedupeKey,
    );
  });

  it('restanțele sunt anunțate în prima zi, apoi o dată la 7 zile', () => {
    const keyOn = (day: string) => plan([task({ dueDate: '2026-11-01' })], [], day)[0]?.dedupeKey;
    expect(keyOn('2026-11-02')).toBe(keyOn('2026-11-08'));
    expect(keyOn('2026-11-09')).not.toBe(keyOn('2026-11-08'));
    expect(keyOn('2026-11-09')).toBe(keyOn('2026-11-15'));
    expect(plan([task({ dueDate: '2026-11-01' })])[0]).toMatchObject({
      type: 'TASK_OVERDUE',
      body: 'Deplasare · SC Exemplu SRL · termen 01.11.2026',
    });
  });

  it('un task reprogramat primește o reamintire nouă', () => {
    const before = plan([task({ dueDate: '2026-11-12' })])[0]?.dedupeKey;
    const after = plan([task({ dueDate: '2026-11-13' })])[0]?.dedupeKey;
    expect(before).not.toBe(after);
  });

  it('fără responsabil, sunt anunțați responsabilii clientului', () => {
    const planned = plan([task({ assigneeId: null, clientResponsibleIds: ['ana', 'dan', 'ana'] })]);
    expect(planned.map((item) => item.userId)).toEqual(['ana', 'dan']);
  });

  it('nu notifică utilizatorii dezactivați și nici task-urile fără destinatar', () => {
    expect(plan([task({ assigneeId: 'plecat' })])).toEqual([]);
    expect(plan([task({ assigneeId: null })])).toEqual([]);
  });

  describe('destinatari atunci când responsabilul lipsește sau nu mai este activ', () => {
    const active = new Set(['dan', 'admin']);
    const planFor = (overrides: Partial<ReminderTask>, admins = ['admin']) =>
      planReminders([task(overrides)], today, active, new Map(), admins).map(
        (notification) => notification.userId,
      );

    it('responsabilul activ primește reamintirea, nimeni altcineva', () => {
      expect(planFor({ assigneeId: 'dan', clientResponsibleIds: ['admin'] })).toEqual(['dan']);
    });

    it('dacă responsabilul a fost dezactivat, reamintirea ajunge la responsabilii clientului', () => {
      // „ana” nu mai are cont activ (a plecat din firmă), dar task-ul a rămas pe numele ei.
      expect(planFor({ assigneeId: 'ana', clientResponsibleIds: ['ana', 'dan'] })).toEqual(['dan']);
    });

    it('dacă nici clientul nu are responsabili activi, sunt anunțați administratorii', () => {
      expect(planFor({ assigneeId: 'ana', clientResponsibleIds: ['ana'] })).toEqual(['admin']);
      expect(planFor({ assigneeId: null, clientResponsibleIds: [] })).toEqual(['admin']);
    });

    it('fără niciun utilizator activ potrivit nu se creează nimic', () => {
      expect(planFor({ assigneeId: 'ana', clientResponsibleIds: [] }, [])).toEqual([]);
    });
  });
});
