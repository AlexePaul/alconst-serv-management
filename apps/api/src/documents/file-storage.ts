import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { FilesConfig } from '../config/app-config.js';

export const FILE_STORAGE = Symbol('FILE_STORAGE');

/**
 * Spațiul în care stă conținutul fișierelor încărcate. Aplicația îl accesează doar prin această
 * interfață, iar utilizatorii doar prin API (autentificați și autorizați): nu există URL-uri
 * publice către fișiere. Nu există operațiune de ștergere – fișierele se arhivează, nu se șterg.
 */
export interface FileStorage {
  put(key: string, content: Buffer, contentType: string): Promise<void>;
  /** Deschide fișierul pentru citire; aruncă o eroare dacă nu există. */
  open(key: string): Promise<Readable>;
}

/** Cheile sunt generate de aplicație: `<secțiune>/<uuid>`. Orice altceva este respins. */
const KEY_PATTERN = /^[0-9a-z-]{1,40}\/[0-9a-f-]{36}$/;

function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new Error('Cheie de stocare invalidă.');
}

/** Stocare pe disc: pentru dezvoltare, teste sau un server cu volum persistent. */
export class LocalFileStorage implements FileStorage {
  constructor(private readonly directory: string) {}

  // Tipul de conținut nu se păstrează pe disc: la descărcare este stabilit din extensia fișierului.
  async put(key: string, content: Buffer, _contentType?: string): Promise<void> {
    assertKey(key);
    const path = join(this.directory, key);
    await mkdir(dirname(path), { recursive: true });
    // Scriere atomică: un fișier incomplet nu devine niciodată vizibil sub cheia finală.
    const temporary = `${path}.part`;
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, path);
  }

  async open(key: string): Promise<Readable> {
    assertKey(key);
    const path = join(this.directory, key);
    await stat(path);
    return createReadStream(path);
  }
}

/** Stocare S3 sau compatibilă S3. În producție, accesul se face prin rolul IAM al instanței. */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;

  constructor(private readonly config: FilesConfig) {
    this.client = new S3Client({
      region: config.s3Region,
      ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
      forcePathStyle: config.s3ForcePathStyle,
    });
  }

  async put(key: string, content: Buffer, contentType: string): Promise<void> {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async open(key: string): Promise<Readable> {
    assertKey(key);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.s3Bucket, Key: key }),
    );
    if (!response.Body) throw new Error('Fișierul nu există în spațiul de stocare.');
    return response.Body as Readable;
  }
}

export function createFileStorage(config: FilesConfig): FileStorage {
  return config.driver === 's3'
    ? new S3FileStorage(config)
    : new LocalFileStorage(config.directory);
}
