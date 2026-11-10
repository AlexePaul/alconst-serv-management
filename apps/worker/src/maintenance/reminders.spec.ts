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

  describe('termene flexibile (de făcut oricând în perioadă)', () => {
    // Planificat pe 5 noiembrie, de făcut oricând până la 30 noiembrie.
    const visit = task({ dueDate: '2026-11-05', periodEnd: '2026-11-30' });
    const on = (day: string, remindDays = 3) =>
      plan([visit], [['ana', remindDays]], day).map((notification) => [
        notification.type,
        notification.title,
        notification.dedupeKey,
      ]);

    it('anunță data planificată, dar depășirea ei nu este restanță', () => {
      expect(on('2026-11-03')[0]?.slice(0, 2)).toEqual(['TASK_DUE_SOON', 'Termen apropiat']);
      expect(on('2026-11-05')[0]?.slice(0, 2)).toEqual(['TASK_DUE_TODAY', 'Planificat astăzi']);
      // Între data planificată și apropierea sfârșitului de lună nu se mai trimite nimic.
      for (const day of ['2026-11-06', '2026-11-15', '2026-11-26']) expect(on(day)).toEqual([]);
    });

    it('reamintește o dată înainte de sfârșitul perioadei și o dată în ultima zi', () => {
      expect(on('2026-11-27')).toEqual([
        ['TASK_DUE_SOON', 'Perioada se încheie curând', 'period-end:t1:ana:2026-11-30'],
      ]);
      // Aceeași cheie în zilele următoare: baza de date o păstrează o singură dată.
      expect(on('2026-11-29')[0]?.[2]).toBe('period-end:t1:ana:2026-11-30');
      expect(on('2026-11-30')).toEqual([
        ['TASK_DUE_TODAY', 'Ultima zi din perioadă', 'period-last:t1:ana:2026-11-30'],
      ]);
      // Cu reamintirile în avans oprite rămâne doar cea din ultima zi.
      expect(on('2026-11-28', 0)).toEqual([]);
      expect(on('2026-11-30', 0)).toHaveLength(1);
    });

    it('restanța începe după perioadă și se numără de la sfârșitul ei', () => {
      expect(on('2026-12-01')).toEqual([
        ['TASK_OVERDUE', 'Task restant', 'overdue:t1:ana:2026-11-30:0'],
      ]);
      expect(on('2026-12-07')[0]?.[2]).toBe('overdue:t1:ana:2026-11-30:0');
      expect(on('2026-12-08')[0]?.[2]).toBe('overdue:t1:ana:2026-11-30:1');
      expect(plan([visit], [], '2026-12-01')[0]?.body).toContain('termen 30.11.2026');
    });

    it('o dată mutată dincolo de perioadă devine ea termenul', () => {
      const moved = task({ dueDate: '2026-12-03', periodEnd: '2026-11-30' });
      expect(plan([moved], [], '2026-12-01')[0]?.type).toBe('TASK_DUE_SOON');
      expect(plan([moved], [], '2026-12-03')[0]?.title).toBe('Termen astăzi');
      expect(plan([moved], [], '2026-12-04')[0]?.dedupeKey).toBe('overdue:t1:ana:2026-12-03:0');
    });
  });
});
