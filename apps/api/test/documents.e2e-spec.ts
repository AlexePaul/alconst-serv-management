import { createTestApp, ORIGIN, type TestApp } from './test-app.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('imagine de test'),
]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('conținut docx')]);
const EXECUTABLE = Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004', 'latin1');

describe('Documente (e2e)', () => {
  let t: TestApp;
  let admin: { id: string; cookie: string };
  let ana: { id: string; cookie: string };
  let dan: { id: string; cookie: string };
  let clientId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    const adminUser = await t.createUser({ email: 'admin@test.ro' });
    const anaUser = await t.createUser({
      email: 'ana@test.ro',
      role: 'EMPLOYEE',
      firstName: 'Ana',
    });
    const danUser = await t.createUser({
      email: 'dan@test.ro',
      role: 'EMPLOYEE',
      firstName: 'Dan',
    });
    admin = { id: adminUser.id, cookie: await t.login('admin@test.ro') };
    ana = { id: anaUser.id, cookie: await t.login('ana@test.ro') };
    dan = { id: danUser.id, cookie: await t.login('dan@test.ro') };
    clientId = (
      await post('/api/clients', ana.cookie, { name: 'SC Ștefănescu SRL', cui: '12345678' }).expect(
        201,
      )
    ).body.id;
  });
  afterAll(() => t.close());

  const post = (url: string, cookie: string, body: object = {}) =>
    t.http().post(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const patch = (url: string, cookie: string, body: object) =>
    t.http().patch(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const del = (url: string, cookie: string) =>
    t.http().delete(url).set('Origin', ORIGIN).set('Cookie', cookie);
  const get = (url: string, cookie: string) => t.http().get(url).set('Cookie', cookie);

  type Target = { clientId?: string; folderId?: string };
  const upload = (cookie: string, name: string, content: Buffer, target: Target = { clientId }) => {
    const query = new URLSearchParams({ name, ...target });
    return t
      .http()
      .post(`/api/documents/files?${query.toString()}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/octet-stream')
      .send(content);
  };
  const download = (cookie: string, id: string) =>
    get(`/api/documents/files/${id}/download`, cookie).responseType('blob');
  const folder = async (cookie: string, name: string, extra: object = { clientId }) =>
    (await post('/api/documents/folders', cookie, { name, ...extra }).expect(201)).body as {
      id: string;
      name: string;
      parentId: string | null;
    };
  const listing = async (cookie: string, query: string) =>
    (await get(`/api/documents?${query}`, cookie).expect(200)).body as {
      section: { name: string; fileCount: number };
      breadcrumbs: { id: string; name: string }[];
      folders: { id: string; name: string; itemCount: number }[];
      files: { id: string; name: string; archivedAt: string | null }[];
      archivedCount: number;
    };

  describe('încărcare și descărcare', () => {
    it('un fișier încărcat se descarcă identic, ca atașament', async () => {
      const uploaded = await upload(ana.cookie, 'Contract nr. 12 – semnat.pdf', PDF).expect(201);
      expect(uploaded.body).toMatchObject({
        name: 'Contract nr. 12 – semnat.pdf',
        extension: 'pdf',
        sizeBytes: PDF.length,
        clientId,
        folderId: null,
        archivedAt: null,
        uploadedBy: { id: ana.id },
      });

      const response = await download(ana.cookie, uploaded.body.id).expect(200);
      expect(Buffer.compare(response.body as Buffer, PDF)).toBe(0);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment;');
      expect(response.headers['content-disposition']).toContain(
        `filename*=UTF-8''${encodeURIComponent('Contract nr. 12 – semnat.pdf')}`,
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('conținutul stă sub o cheie generată de aplicație, nu sub numele fișierului', async () => {
      const uploaded = await upload(ana.cookie, 'Fișă.docx', DOCX).expect(201);
      const row = await t.prisma.db.documentFile.findUniqueOrThrow({
        where: { id: uploaded.body.id },
      });
      expect(row.storageKey).toMatch(new RegExp(`^${clientId}/[0-9a-f-]{36}$`));
      expect(row.storageKey).not.toContain('Fi');
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it('respinge tipurile neacceptate, conținutul care nu corespunde extensiei și fișierele goale', async () => {
      const cases: [string, Buffer, string][] = [
        ['program.exe', EXECUTABLE, 'nu este acceptat'],
        ['pagina.html', Buffer.from('<script>alert(1)</script>'), 'nu este acceptat'],
        ['fara-extensie', PDF, 'nu este acceptat'],
        ['contract.pdf', EXECUTABLE, 'nu corespunde extensiei'],
        ['poza.png', PDF, 'nu corespunde extensiei'],
        ['gol.pdf', Buffer.alloc(0), 'gol'],
      ];
      for (const [name, content, message] of cases) {
        const response = await upload(ana.cookie, name, content).expect(400);
        expect(response.body.message).toContain(message);
      }
      expect(await t.prisma.db.documentFile.count()).toBe(0);
    });

    it('respinge numele care ar putea ieși din dosar', async () => {
      for (const name of ['../../etc/passwd.pdf', 'a/b.pdf', '..\\x.pdf', '.ascuns.pdf', '   ']) {
        await upload(ana.cookie, name, PDF).expect(400);
      }
    });

    it('respinge fișierele peste limita de dimensiune', async () => {
      const settings = await get('/api/documents/settings', ana.cookie).expect(200);
      expect(settings.body.maxUploadMb).toBe(25);
      const tooBig = Buffer.concat([PDF, Buffer.alloc(25 * 1024 * 1024)]);
      const response = await upload(ana.cookie, 'mare.pdf', tooBig).expect(413);
      expect(response.body.message).toContain('25 MB');
    });

    it('acceptă doar conținut brut: formularele HTML și cererile din alte origini sunt respinse', async () => {
      const url = `/api/documents/files?name=contract.pdf&clientId=${clientId}`;
      await t
        .http()
        .post(url)
        .set('Origin', ORIGIN)
        .set('Cookie', ana.cookie)
        .attach('file', PDF, 'contract.pdf')
        .expect(400);
      await t
        .http()
        .post(url)
        .set('Origin', 'https://alt-site.example')
        .set('Cookie', ana.cookie)
        .set('Content-Type', 'application/octet-stream')
        .send(PDF)
        .expect(403);
      await t
        .http()
        .post(url)
        .set('Origin', ORIGIN)
        .set('Content-Type', 'application/octet-stream')
        .send(PDF)
        .expect(401);
    });
  });

  describe('acces', () => {
    it('documentele unui client sunt vizibile doar responsabililor lui și administratorilor', async () => {
      const dosar = await folder(ana.cookie, 'Contracte');
      const file = (await upload(ana.cookie, 'contract.pdf', PDF, { folderId: dosar.id })).body;

      // Dan nu este responsabil: pentru el nimic din toate acestea nu există.
      await get(`/api/documents?clientId=${clientId}`, dan.cookie).expect(404);
      await get(`/api/documents?folderId=${dosar.id}`, dan.cookie).expect(404);
      await get(`/api/documents/folders?clientId=${clientId}`, dan.cookie).expect(404);
      await download(dan.cookie, file.id).expect(404);
      await patch(`/api/documents/files/${file.id}`, dan.cookie, { archived: true }).expect(404);
      await patch(`/api/documents/folders/${dosar.id}`, dan.cookie, { name: 'X' }).expect(404);
      await del(`/api/documents/folders/${dosar.id}`, dan.cookie).expect(404);
      await upload(dan.cookie, 'intrus.pdf', PDF, { clientId }).expect(404);
      await upload(dan.cookie, 'intrus.pdf', PDF, { folderId: dosar.id }).expect(404);
      await post('/api/documents/folders', dan.cookie, { name: 'X', clientId }).expect(404);
      const found = await get('/api/documents/search?q=contract', dan.cookie).expect(200);
      expect(found.body).toEqual([]);
      await get(`/api/documents/search?q=contract&clientId=${clientId}`, dan.cookie).expect(404);

      // Administratorul vede tot; fără autentificare nu se descarcă nimic.
      await download(admin.cookie, file.id).expect(200);
      await t.http().get(`/api/documents/files/${file.id}/download`).expect(401);

      // Odată ce devine responsabil, Dan are acces.
      await t
        .http()
        .put(`/api/clients/${clientId}/responsibles`)
        .set('Origin', ORIGIN)
        .set('Cookie', admin.cookie)
        .send({ userIds: [ana.id, dan.id] })
        .expect(200);
      await download(dan.cookie, file.id).expect(200);
    });

    it('fiecare vede secțiunea generală și doar secțiunile clienților lui', async () => {
      await upload(ana.cookie, 'contract.pdf', PDF).expect(201);
      await upload(dan.cookie, 'procedura.pdf', PDF, {}).expect(201);

      const anas = (await get('/api/documents/sections', ana.cookie).expect(200)).body;
      expect(anas).toEqual([
        { clientId: null, name: 'Documente generale', isActive: true, fileCount: 1 },
        { clientId, name: 'SC Ștefănescu SRL', isActive: true, fileCount: 1 },
      ]);
      const dans = (await get('/api/documents/sections', dan.cookie).expect(200)).body;
      expect(dans).toEqual([
        { clientId: null, name: 'Documente generale', isActive: true, fileCount: 1 },
      ]);
      // Secțiunea generală este comună.
      expect((await listing(ana.cookie, '')).files.map((file) => file.name)).toEqual([
        'procedura.pdf',
      ]);
    });

    it('documentele unui client arhivat rămân accesibile', async () => {
      const file = (await upload(ana.cookie, 'contract.pdf', PDF)).body;
      await patch(`/api/clients/${clientId}`, ana.cookie, { isActive: false }).expect(200);
      await download(ana.cookie, file.id).expect(200);
      const sections = (await get('/api/documents/sections', ana.cookie).expect(200)).body;
      expect(sections[1]).toMatchObject({ clientId, isActive: false, fileCount: 1 });
    });
  });

  describe('dosare', () => {
    it('se pot crea pe mai multe niveluri, cu drumul până la rădăcină', async () => {
      const contracte = await folder(ana.cookie, 'Contracte');
      const anul = await folder(ana.cookie, '2026', { parentId: contracte.id });
      await upload(ana.cookie, 'contract.pdf', PDF, { folderId: anul.id }).expect(201);

      const root = await listing(ana.cookie, `clientId=${clientId}`);
      expect(root.section).toMatchObject({ name: 'SC Ștefănescu SRL', fileCount: 1 });
      expect(root.folders).toEqual([expect.objectContaining({ name: 'Contracte', itemCount: 1 })]);
      expect(root.files).toEqual([]);

      const inner = await listing(ana.cookie, `folderId=${anul.id}`);
      expect(inner.breadcrumbs.map((entry) => entry.name)).toEqual(['Contracte', '2026']);
      expect(inner.files.map((file) => file.name)).toEqual(['contract.pdf']);
    });

    it('nu pot exista două dosare cu același nume în același loc', async () => {
      await folder(ana.cookie, 'Fișe');
      await post('/api/documents/folders', ana.cookie, { name: 'fise', clientId }).expect(409);
      // În alt dosar sau în altă secțiune, același nume este în regulă.
      const altul = await folder(ana.cookie, 'Altele');
      await folder(ana.cookie, 'Fișe', { parentId: altul.id });
      await folder(ana.cookie, 'Fișe', {});
      await post('/api/documents/folders', ana.cookie, { name: 'a/b', clientId }).expect(400);
    });

    it('pot fi redenumite și mutate, dar nu în ele însele și nu în altă secțiune', async () => {
      const a = await folder(ana.cookie, 'A');
      const b = await folder(ana.cookie, 'B', { parentId: a.id });
      const general = await folder(ana.cookie, 'General', {});

      await patch(`/api/documents/folders/${a.id}`, ana.cookie, { parentId: b.id }).expect(400);
      await patch(`/api/documents/folders/${a.id}`, ana.cookie, { parentId: a.id }).expect(400);
      await patch(`/api/documents/folders/${a.id}`, ana.cookie, { parentId: general.id }).expect(
        400,
      );

      const moved = await patch(`/api/documents/folders/${b.id}`, ana.cookie, {
        parentId: null,
        name: 'B redenumit',
      }).expect(200);
      expect(moved.body).toMatchObject({ parentId: null, name: 'B redenumit' });
      const root = await listing(ana.cookie, `clientId=${clientId}`);
      expect(root.folders.map((entry) => entry.name)).toEqual(['A', 'B redenumit']);
    });

    it('doar un dosar complet gol poate fi șters', async () => {
      const dosar = await folder(ana.cookie, 'Temporar');
      const file = (
        await upload(ana.cookie, 'nota.txt', Buffer.from('text'), { folderId: dosar.id })
      ).body;
      await del(`/api/documents/folders/${dosar.id}`, ana.cookie).expect(409);
      // Nici după arhivarea fișierului: dosarul încă păstrează ceva.
      await patch(`/api/documents/files/${file.id}`, ana.cookie, { archived: true }).expect(200);
      await del(`/api/documents/folders/${dosar.id}`, ana.cookie).expect(409);

      await patch(`/api/documents/files/${file.id}`, ana.cookie, { folderId: null }).expect(200);
      await del(`/api/documents/folders/${dosar.id}`, ana.cookie).expect(204);
      expect(await t.prisma.db.documentFile.count()).toBe(1);
    });
  });

  describe('fișiere', () => {
    it('se redenumesc fără schimbarea extensiei și se mută doar în aceeași secțiune', async () => {
      const dosar = await folder(ana.cookie, 'Contracte');
      const general = await folder(ana.cookie, 'General', {});
      const file = (await upload(ana.cookie, 'contract.pdf', PDF)).body;

      const renamed = await patch(`/api/documents/files/${file.id}`, ana.cookie, {
        name: 'Contract 2026.pdf',
        folderId: dosar.id,
      }).expect(200);
      expect(renamed.body).toMatchObject({ name: 'Contract 2026.pdf', folderId: dosar.id });

      await patch(`/api/documents/files/${file.id}`, ana.cookie, { name: 'contract.exe' }).expect(
        400,
      );
      await patch(`/api/documents/files/${file.id}`, ana.cookie, { name: 'a/b.pdf' }).expect(400);
      await patch(`/api/documents/files/${file.id}`, ana.cookie, {
        folderId: general.id,
      }).expect(400);
      // Conținutul rămâne același după redenumire și mutare.
      const response = await download(ana.cookie, file.id).expect(200);
      expect(Buffer.compare(response.body as Buffer, PDF)).toBe(0);
    });

    it('nu se șterg: se arhivează și pot fi restaurate', async () => {
      const file = (await upload(ana.cookie, 'vechi.pdf', PDF)).body;
      await del(`/api/documents/files/${file.id}`, admin.cookie).expect(404);

      const archived = await patch(`/api/documents/files/${file.id}`, ana.cookie, {
        archived: true,
      }).expect(200);
      expect(archived.body.archivedAt).toEqual(expect.any(String));

      const current = await listing(ana.cookie, `clientId=${clientId}`);
      expect(current.files).toEqual([]);
      expect(current.archivedCount).toBe(1);
      expect(current.section.fileCount).toBe(0);
      const old = await listing(ana.cookie, `clientId=${clientId}&archived=true`);
      expect(old.files.map((entry) => entry.name)).toEqual(['vechi.pdf']);
      // Un fișier arhivat se poate descărca în continuare.
      await download(ana.cookie, file.id).expect(200);

      await patch(`/api/documents/files/${file.id}`, ana.cookie, { archived: false }).expect(200);
      expect((await listing(ana.cookie, `clientId=${clientId}`)).files).toHaveLength(1);

      const actions = (
        await t.prisma.db.activityLog.findMany({ where: { entityType: 'document' } })
      ).map((entry) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining(['document.uploaded', 'document.archived', 'document.restored']),
      );
    });

    it('se caută după nume, fără diacritice, cu locul în care se află', async () => {
      const dosar = await folder(ana.cookie, 'Fișe');
      const anul = await folder(ana.cookie, '2026', { parentId: dosar.id });
      await upload(ana.cookie, 'Fișă instruire Ștefan.docx', DOCX, { folderId: anul.id });
      await upload(ana.cookie, 'schema.png', PNG);
      const arhivat = (await upload(ana.cookie, 'fisa veche.pdf', PDF)).body;
      await patch(`/api/documents/files/${arhivat.id}`, ana.cookie, { archived: true }).expect(200);

      const found = (await get('/api/documents/search?q=fisa', ana.cookie).expect(200)).body;
      expect(found).toEqual([
        expect.objectContaining({
          name: 'Fișă instruire Ștefan.docx',
          sectionName: 'SC Ștefănescu SRL',
          path: ['Fișe', '2026'],
        }),
      ]);
      await get('/api/documents/search?q=a', ana.cookie).expect(400);
    });
  });
});
