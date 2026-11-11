/**
 * Verifică dacă primii octeți ai unui fișier corespund tipului anunțat de extensia lui.
 * Un executabil redenumit „contract.pdf” este respins la încărcare.
 */

const startsWith = (content: Buffer, signature: number[] | string, offset = 0): boolean => {
  const bytes = typeof signature === 'string' ? [...Buffer.from(signature, 'latin1')] : signature;
  return (
    content.length >= offset + bytes.length &&
    bytes.every((byte, index) => content[offset + index] === byte)
  );
};

const isZip = (content: Buffer) =>
  startsWith(content, [0x50, 0x4b, 0x03, 0x04]) || startsWith(content, [0x50, 0x4b, 0x05, 0x06]);
/** Formatul vechi Microsoft Office (doc, xls, ppt). */
const isOle = (content: Buffer) =>
  startsWith(content, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** Text: fără octeți nuli în primii 8 KB. */
const isText = (content: Buffer) => !content.subarray(0, 8192).includes(0);
const isHeif = (content: Buffer) => startsWith(content, 'ftyp', 4);

const CHECKS: Record<string, (content: Buffer) => boolean> = {
  pdf: (content) => startsWith(content, '%PDF-'),
  doc: isOle,
  xls: isOle,
  ppt: isOle,
  docx: isZip,
  xlsx: isZip,
  pptx: isZip,
  odt: isZip,
  ods: isZip,
  odp: isZip,
  zip: isZip,
  rtf: (content) => startsWith(content, '{\\rtf'),
  txt: isText,
  csv: isText,
  jpg: (content) => startsWith(content, [0xff, 0xd8, 0xff]),
  jpeg: (content) => startsWith(content, [0xff, 0xd8, 0xff]),
  png: (content) => startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: (content) => startsWith(content, 'GIF87a') || startsWith(content, 'GIF89a'),
  webp: (content) => startsWith(content, 'RIFF') && startsWith(content, 'WEBP', 8),
  heic: isHeif,
  heif: isHeif,
  tif: (content) => startsWith(content, 'II*\u0000') || startsWith(content, 'MM\u0000*'),
  tiff: (content) => startsWith(content, 'II*\u0000') || startsWith(content, 'MM\u0000*'),
  bmp: (content) => startsWith(content, 'BM'),
};

export function contentMatchesExtension(extension: string, content: Buffer): boolean {
  return CHECKS[extension]?.(content) ?? false;
}
