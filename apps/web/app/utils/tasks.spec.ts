import { describe, expect, it } from 'vitest'
import { describeHistoryChange, groupTasks, recurrencePresetFor, taskDueInfo } from './tasks'

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
