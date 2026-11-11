import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { type FileStorage, LocalFileStorage, S3FileStorage } from './file-storage.js';

const KEY = 'general/0191c2a0-7b1e-7c3d-9e4f-5a6b7c8d9e0f';
const CONTENT = Buffer.from('%PDF-1.7 conținut de test cu diacritice: șțăîâ');

async function read(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Comportamentul comun al oricărui spațiu de stocare. */
function behavesLikeStorage(create: () => FileStorage): void {
  it('păstrează conținutul exact așa cum a fost primit', async () => {
    const storage = create();
    await storage.put(KEY, CONTENT, 'application/pdf');
    expect(Buffer.compare(await read(await storage.open(KEY)), CONTENT)).toBe(0);
  });

  it('semnalează un fișier inexistent', async () => {
    await expect(create().open('general/0191c2a0-0000-7000-8000-000000000000')).rejects.toThrow();
  });

  it('refuză orice cheie care nu a fost generată de aplicație', async () => {
    const storage = create();
    for (const key of ['../../etc/passwd', 'general/../x', '/etc/passwd', 'general/nume.pdf', '']) {
      await expect(storage.put(key, CONTENT, 'application/pdf')).rejects.toThrow(/invalidă/);
      await expect(storage.open(key)).rejects.toThrow(/invalidă/);
    }
  });
}

describe('LocalFileStorage', () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'alconst-storage-'));
  });
  afterAll(() => rm(directory, { recursive: true, force: true }));

  behavesLikeStorage(() => new LocalFileStorage(directory));

  it('nu lasă fișiere parțiale în urmă', async () => {
    await new LocalFileStorage(directory).put(KEY, CONTENT, 'application/pdf');
    expect(await readdir(join(directory, 'general'))).toEqual([KEY.split('/')[1]]);
  });
});

/**
 * Driverul S3 este verificat cu clientul AWS real, prin HTTP, împotriva unui server minimal care
 * imită cele două operațiuni folosite (PutObject, GetObject). Nu înlocuiește o verificare pe
 * bucket-ul real, dar confirmă forma cererilor și tratarea răspunsurilor.
 */
describe('S3FileStorage', () => {
  let server: Server;
  let endpoint: string;
  const objects = new Map<string, { body: Buffer; headers: Record<string, string> }>();
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    server = createServer((request, response) => {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
      if (request.method === 'PUT') {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          objects.set(path, {
            body: Buffer.concat(chunks),
            headers: {
              contentType: String(request.headers['content-type']),
              encryption: String(request.headers['x-amz-server-side-encryption']),
              authorization: String(request.headers.authorization),
            },
          });
          response.writeHead(200, { ETag: '"test"' }).end();
        });
        return;
      }
      const object = objects.get(path);
      if (request.method === 'GET' && object) {
        response.writeHead(200, { 'Content-Length': object.body.length }).end(object.body);
        return;
      }
      response
        .writeHead(404, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    process.env = saved;
    await new Promise((resolve) => server.close(resolve));
  });

  const create = () =>
    new S3FileStorage({
      driver: 's3',
      directory: '',
      s3Bucket: 'alconst-documente',
      s3Region: 'eu-central-1',
      s3Endpoint: endpoint,
      s3ForcePathStyle: true,
    });

  behavesLikeStorage(create);

  it('trimite fișierul în bucket-ul configurat, semnat și cu criptare pe server', async () => {
    await create().put(KEY, CONTENT, 'application/pdf');
    const stored = objects.get(`/alconst-documente/${KEY}`);
    expect(stored?.body.equals(CONTENT)).toBe(true);
    expect(stored?.headers).toMatchObject({ contentType: 'application/pdf', encryption: 'AES256' });
    expect(stored?.headers.authorization).toContain('AWS4-HMAC-SHA256');
  });
});
