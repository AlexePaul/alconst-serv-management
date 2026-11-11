import { describe, expect, it } from 'vitest';
import {
  documentNameError,
  documentUploadError,
  fileExtension,
  formatFileSize,
} from './documents.js';

describe('documente', () => {
  it('extrage extensia cu litere mici', () => {
    expect(fileExtension('Contract 12.PDF')).toBe('pdf');
    expect(fileExtension('arhiva.tar.zip')).toBe('zip');
    expect(fileExtension('fara-extensie')).toBe('');
    expect(fileExtension('.ascuns')).toBe('');
    expect(fileExtension('punct.')).toBe('');
  });

  it('acceptă nume obișnuite, cu diacritice și spații', () => {
    for (const name of ['Contract nr. 12 – semnat.pdf', 'Fișă instruire (2026).docx', 'Țărănuș']) {
      expect(documentNameError(name)).toBeNull();
    }
  });

  it('respinge numele goale, prea lungi sau cu caractere care pot ieși din dosar', () => {
    expect(documentNameError('   ')).toContain('obligatoriu');
    expect(documentNameError('a'.repeat(201))).toContain('cel mult 200');
    for (const name of ['../../etc/passwd', 'a/b.pdf', 'a\\b.pdf', 'con:trol.pdf', 'x\u0000.pdf']) {
      expect(documentNameError(name)).toContain('caracterele');
    }
    for (const name of ['..', '.env', 'fisier.'])
      expect(documentNameError(name)).toContain('punct');
  });

  it('verifică tipul și dimensiunea înainte de încărcare', () => {
    expect(documentUploadError({ name: 'contract.pdf', size: 1000 })).toBeNull();
    expect(documentUploadError({ name: 'poza.JPG', size: 1000 })).toBeNull();
    expect(documentUploadError({ name: 'program.exe', size: 1000 })).toContain('nu este acceptat');
    expect(documentUploadError({ name: 'pagina.html', size: 1000 })).toContain('nu este acceptat');
    expect(documentUploadError({ name: 'fara-extensie', size: 1000 })).toContain(
      'nu este acceptat',
    );
    expect(documentUploadError({ name: 'gol.pdf', size: 0 })).toContain('gol');
    expect(documentUploadError({ name: 'mare.pdf', size: 26 * 1024 * 1024 })).toContain('25 MB');
    expect(documentUploadError({ name: 'mare.pdf', size: 26 * 1024 * 1024 }, 50)).toBeNull();
  });

  it('afișează dimensiunea în unități potrivite', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(12_700)).toBe('12,4 KB');
    expect(formatFileSize(3_250_000)).toBe('3,1 MB');
    expect(formatFileSize(250 * 1024 * 1024)).toBe('250 MB');
  });
});
