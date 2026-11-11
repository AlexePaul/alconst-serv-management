import type { DocumentFolderDto } from '@alconst/shared'

/** Iconița potrivită tipului de fișier. */
export function documentIcon(extension: string): string {
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'].includes(extension)) return 'i-lucide-file-image'
  if (['xls', 'xlsx', 'ods', 'csv'].includes(extension)) return 'i-lucide-file-spreadsheet'
  if (extension === 'zip') return 'i-lucide-file-archive'
  if (['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'].includes(extension)) return 'i-lucide-file-text'
  return 'i-lucide-file'
}

/** Adresa de descărcare a unui fișier. Trece prin API, deci cere autentificare. */
export function documentDownloadUrl(fileId: string): string {
  return `${useRuntimeConfig().public.apiBase}/documents/files/${fileId}/download`
}

export interface FolderOption {
  id: string
  /** Drumul complet, ex. „Contracte / 2026”. */
  label: string
}

/**
 * Dosarele unei secțiuni ca listă plată, cu drumul complet, ordonată alfabetic.
 * `excludeId` scoate un dosar împreună cu tot ce conține (un dosar nu se poate muta în el însuși).
 */
export function folderOptions(folders: Pick<DocumentFolderDto, 'id' | 'parentId' | 'name'>[], excludeId?: string): FolderOption[] {
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const pathOf = (id: string): string[] | null => {
    const names: string[] = []
    for (let current = byId.get(id), depth = 0; current; current = current.parentId ? byId.get(current.parentId) : undefined, depth++) {
      if (current.id === excludeId || depth > 50) return null
      names.unshift(current.name)
    }
    return names
  }
  return folders
    .flatMap((folder) => {
      const path = pathOf(folder.id)
      return path ? [{ id: folder.id, label: path.join(' / ') }] : []
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ro'))
}
