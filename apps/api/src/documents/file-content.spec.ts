import { DOCUMENT_EXTENSIONS } from '@alconst/shared';
import { contentMatchesExtension } from './file-content.js';

const bytes = (...values: number[]) => Buffer.from(values);

describe('contentMatchesExtension', () => {
  it('recunoaște formatele uzuale după primii octeți', () => {
    expect(contentMatchesExtension('pdf', Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(contentMatchesExtension('docx', bytes(0x50, 0x4b, 0x03, 0x04, 0x14))).toBe(true);
    expect(
      contentMatchesExtension('xls', bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
    ).toBe(true);
    expect(contentMatchesExtension('jpg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(
      contentMatchesExtension('png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe(true);
    expect(
      contentMatchesExtension('webp', Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')),
    ).toBe(true);
    expect(contentMatchesExtension('txt', Buffer.from('Notă cu diacritice: șțăîâ'))).toBe(true);
    expect(contentMatchesExtension('csv', Buffer.from('nume;cui\nSC Exemplu;123'))).toBe(true);
  });

  it('respinge un conținut care nu corespunde extensiei', () => {
    const executable = Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000', 'latin1');
    expect(contentMatchesExtension('pdf', executable)).toBe(false);
    expect(contentMatchesExtension('docx', Buffer.from('%PDF-1.7'))).toBe(false);
    expect(contentMatchesExtension('jpg', Buffer.from('<html><script>'))).toBe(false);
    expect(contentMatchesExtension('txt', executable)).toBe(false);
    expect(contentMatchesExtension('png', Buffer.alloc(0))).toBe(false);
  });

  it('are o verificare pentru fiecare tip acceptat și respinge extensiile necunoscute', () => {
    for (const extension of DOCUMENT_EXTENSIONS) {
      // Un bloc de octeți nuli nu este un fișier valid de niciun tip acceptat.
      expect(contentMatchesExtension(extension, Buffer.alloc(64))).toBe(false);
    }
    expect(contentMatchesExtension('exe', Buffer.from('MZ'))).toBe(false);
    expect(contentMatchesExtension('', Buffer.from('text'))).toBe(false);
  });
});
