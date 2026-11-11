import type { UserRefDto } from './clients.js';

/**
 * Secțiunea de documente: fișiere încărcate de utilizatori, organizate pe dosare.
 * Fiecare client are propria secțiune; există și o secțiune generală a firmei.
 */

/** Dimensiunea maximă implicită a unui fișier încărcat (MB). Configurabilă prin `MAX_UPLOAD_MB`. */
export const DEFAULT_MAX_UPLOAD_MB = 25;
export const MAX_DOCUMENT_NAME_LENGTH = 200;

/**
 * Tipurile de fișiere acceptate, cu tipul MIME folosit la descărcare. Lista este deliberat
 * restrânsă la documente, tabele, prezentări, imagini și arhive ZIP; fișierele executabile sau
 * paginile web nu sunt acceptate.
 */
export const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  zip: 'application/zip',
};

export const DOCUMENT_EXTENSIONS = Object.keys(DOCUMENT_TYPES);

/** Extensia unui nume de fișier, cu litere mici și fără punct; șir gol dacă nu are. */
export function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index > 0 && index < name.length - 1 ? name.slice(index + 1).toLowerCase() : '';
}

// Caracterele de control și cele care nu pot apărea într-un nume de fișier pe sistemele uzuale.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_NAME_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/;

/**
 * Verifică numele unui fișier sau al unui dosar. Întoarce mesajul de eroare (în română) sau
 * null dacă numele este acceptat. Aceeași regulă se aplică în interfață și pe server.
 */
export function documentNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Numele este obligatoriu.';
  if (trimmed.length > MAX_DOCUMENT_NAME_LENGTH) {
    return `Numele poate avea cel mult ${MAX_DOCUMENT_NAME_LENGTH} de caractere.`;
  }
  if (FORBIDDEN_NAME_CHARS.test(trimmed)) {
    return 'Numele nu poate conține caracterele < > : " / \\ | ? *';
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return 'Numele nu poate începe sau se termina cu punct.';
  }
  return null;
}

/** Verifică un fișier înainte de încărcare: nume, tip acceptat și dimensiune. */
export function documentUploadError(
  file: { name: string; size: number },
  maxUploadMb: number = DEFAULT_MAX_UPLOAD_MB,
): string | null {
  const nameError = documentNameError(file.name);
  if (nameError) return nameError;
  if (!(fileExtension(file.name) in DOCUMENT_TYPES)) {
    return `Tipul fișierului nu este acceptat. Se pot încărca: ${DOCUMENT_EXTENSIONS.join(', ')}.`;
  }
  if (file.size === 0) return 'Fișierul este gol.';
  if (file.size > maxUploadMb * 1024 * 1024) {
    return `Fișierul este prea mare. Dimensiunea maximă este ${maxUploadMb} MB.`;
  }
  return null;
}

/** Ex.: „512 B”, „12,4 KB”, „3,1 MB”. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace('.', ',');
  return `${rounded.replace(/,0$/, '')} ${units[unit]}`;
}

// --- DTO-uri -----------------------------------------------------------------------------------

/** O secțiune de documente: a unui client sau cea generală a firmei (`clientId = null`). */
export interface DocumentSectionDto {
  clientId: string | null;
  name: string;
  /** False pentru clienții arhivați; documentele lor rămân accesibile. */
  isActive: boolean;
  /** Numărul de fișiere nearhivate din secțiune. */
  fileCount: number;
}

export interface DocumentFolderDto {
  id: string;
  clientId: string | null;
  parentId: string | null;
  name: string;
  /** Câte dosare și fișiere nearhivate conține direct. */
  itemCount: number;
  createdAt: string;
}

export interface DocumentFileDto {
  id: string;
  clientId: string | null;
  folderId: string | null;
  name: string;
  extension: string;
  sizeBytes: number;
  uploadedBy: UserRefDto | null;
  createdAt: string;
  /** Fișierele nu se șterg: cele de care nu mai este nevoie se arhivează și pot fi restaurate. */
  archivedAt: string | null;
}

/** Conținutul unui dosar (sau al rădăcinii unei secțiuni). */
export interface DocumentListingDto {
  section: DocumentSectionDto;
  /** Drumul de la rădăcina secțiunii până la dosarul curent (gol pentru rădăcină). */
  breadcrumbs: { id: string; name: string }[];
  folders: DocumentFolderDto[];
  files: DocumentFileDto[];
  /** Câte fișiere arhivate are dosarul curent. */
  archivedCount: number;
}

/** Un rezultat al căutării, cu locul în care se află fișierul. */
export interface DocumentSearchResultDto extends DocumentFileDto {
  sectionName: string;
  /** Numele dosarelor, de la rădăcină până la cel care conține fișierul. */
  path: string[];
}

export interface DocumentSettingsDto {
  maxUploadMb: number;
}
