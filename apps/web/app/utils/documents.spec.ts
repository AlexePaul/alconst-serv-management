import { describe, expect, it } from 'vitest'
import { documentIcon, folderOptions } from './documents'

describe('folderOptions', () => {
  const folders = [
    { id: 'c', parentId: null, name: 'Contracte' },
    { id: 'c26', parentId: 'c', name: '2026' },
    { id: 'c26a', parentId: 'c26', name: 'Acte adiționale' },
    { id: 'f', parentId: null, name: 'Fișe' }
  ]

  it('arată drumul complet al fiecărui dosar, în ordine alfabetică', () => {
    expect(folderOptions(folders).map(option => option.label)).toEqual([
      'Contracte',
      'Contracte / 2026',
      'Contracte / 2026 / Acte adiționale',
      'Fișe'
    ])
  })

  it('exclude dosarul mutat și tot ce conține', () => {
    expect(folderOptions(folders, 'c26').map(option => option.id)).toEqual(['c', 'f'])
    expect(folderOptions(folders, 'c').map(option => option.id)).toEqual(['f'])
  })

  it('nu se blochează dacă datele conțin un ciclu', () => {
    const loop = [{ id: 'a', parentId: 'b', name: 'A' }, { id: 'b', parentId: 'a', name: 'B' }]
    expect(folderOptions(loop)).toEqual([])
  })
})

describe('documentIcon', () => {
  it('alege iconița după tip', () => {
    expect(documentIcon('pdf')).toBe('i-lucide-file-text')
    expect(documentIcon('xlsx')).toBe('i-lucide-file-spreadsheet')
    expect(documentIcon('jpg')).toBe('i-lucide-file-image')
    expect(documentIcon('zip')).toBe('i-lucide-file-archive')
    expect(documentIcon('pptx')).toBe('i-lucide-file')
  })
})
