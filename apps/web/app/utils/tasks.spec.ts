import { describe, expect, it } from 'vitest'
import { describeHistoryChange, groupTasks, recurrencePresetFor, taskDueInfo, taskPeriodLabel } from './tasks'

const today = '2026-11-10'

describe('taskDueInfo', () => {
  it('evidențiază restanțele și termenele apropiate', () => {
    expect(taskDueInfo({ dueDate: '2026-11-07', status: 'TODO' }, today)).toEqual({ label: 'Restant de 3 zile', color: 'error', overdue: true })
    expect(taskDueInfo({ dueDate: '2026-11-09', status: 'IN_PROGRESS' }, today).label).toBe('Restant de 1 zi')
    expect(taskDueInfo({ dueDate: today, status: 'TODO' }, today).label).toBe('Azi')
    expect(taskDueInfo({ dueDate: '2026-11-11', status: 'TODO' }, today).label).toBe('Mâine')
    expect(taskDueInfo({ dueDate: '2026-11-13', status: 'TODO' }, today).label).toBe('vineri, 13 nov.')
    expect(taskDueInfo({ dueDate: '2026-12-31', status: 'TODO' }, today).label).toBe('31 dec. 2026')
  })

  it('task-urile finalizate nu sunt niciodată „restante”', () => {
    expect(taskDueInfo({ dueDate: '2026-11-01', status: 'DONE' }, today)).toMatchObject({ overdue: false, color: 'neutral' })
  })
})

describe('termene flexibile', () => {
  // Planificat pe 5 noiembrie, de făcut oricând în noiembrie.
  const visit = { dueDate: '2026-11-05', periodStart: '2026-11-01', periodEnd: '2026-11-30', status: 'TODO' as const }

  it('data planificată depășită nu este restanță cât timp perioada nu s-a încheiat', () => {
    expect(taskDueInfo(visit, today)).toEqual({ label: 'până la 30 nov.', color: 'warning', overdue: false })
    expect(taskDueInfo(visit, '2026-11-30')).toMatchObject({ label: 'Ultima zi', overdue: false })
    expect(taskDueInfo(visit, '2026-12-03')).toEqual({ label: 'Restant de 3 zile', color: 'error', overdue: true })
    expect(taskDueInfo(visit, '2026-11-05').label).toBe('Azi')
  })

  it('o dată mutată dincolo de perioadă devine ea termenul', () => {
    const moved = { ...visit, dueDate: '2026-12-02' }
    expect(taskDueInfo(moved, '2026-12-01').label).toBe('Mâine')
    expect(taskDueInfo(moved, '2026-12-03')).toMatchObject({ label: 'Restant de 1 zi', overdue: true })
  })

  it('apar într-o grupă separată, între restanțe și azi', () => {
    const tasks = [
      { dueDate: '2026-10-05', periodEnd: '2026-10-31' },
      { dueDate: '2026-11-05', periodEnd: '2026-11-30' },
      { dueDate: '2026-11-07', periodEnd: null },
      { dueDate: today, periodEnd: '2026-11-30' }
    ]
    expect(groupTasks(tasks, today).map(entry => [entry.group, entry.tasks.length])).toEqual([
      ['overdue', 2],
      ['pending', 1],
      ['today', 1]
    ])
  })

  it('perioada se afișează ca lună sau ca interval', () => {
    expect(taskPeriodLabel(visit)).toBe('noiembrie 2026')
    expect(taskPeriodLabel({ periodStart: '2026-11-09', periodEnd: '2026-11-15' })).toBe('9–15 nov. 2026')
    expect(taskPeriodLabel({ periodStart: null, periodEnd: null })).toBeNull()
  })
})

describe('groupTasks', () => {
  it('grupează după urgență și omite grupele goale', () => {
    const tasks = ['2026-11-01', '2026-11-10', '2026-11-12', '2026-11-17', '2026-12-25'].map(dueDate => ({ dueDate }))
    expect(groupTasks(tasks, today).map(entry => [entry.group, entry.tasks.length])).toEqual([
      ['overdue', 1],
      ['today', 1],
      ['week', 2],
      ['later', 1]
    ])
    expect(groupTasks([{ dueDate: today }], today)).toHaveLength(1)
  })
})

describe('recurrencePresetFor', () => {
  it('recunoaște frecvențele uzuale și cade pe „custom” pentru rest', () => {
    expect(recurrencePresetFor('MONTH', 3)).toBe('MONTH:3')
    expect(recurrencePresetFor('DAY', 10)).toBe('custom')
  })
})

describe('describeHistoryChange', () => {
  const labels = { status: { TODO: 'De făcut', DONE: 'Finalizat' } }

  it('traduce câmpurile și valorile', () => {
    expect(describeHistoryChange({ field: 'status', from: 'TODO', to: 'DONE' }, labels)).toBe('statusul: De făcut → Finalizat')
    expect(describeHistoryChange({ field: 'dueDate', from: '2026-11-10', to: '2026-11-13' }, labels)).toBe('termenul: 10 nov. 2026 → 13 nov. 2026')
    expect(describeHistoryChange({ field: 'assignee', from: null, to: 'Ana Pop' }, labels)).toBe('responsabilul: — → Ana Pop')
    expect(describeHistoryChange({ field: 'notes', from: null, to: null }, labels)).toBe('observațiile')
  })
})
