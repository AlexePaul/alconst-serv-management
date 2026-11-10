import { createTestApp, ORIGIN, type TestApp } from './test-app.js';

describe('Clienți, puncte de lucru și contracte (e2e)', () => {
  let t: TestApp;
  let admin: { id: string; cookie: string };
  let ana: { id: string; cookie: string };
  let dan: { id: string; cookie: string };

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
  });
  afterAll(() => t.close());

  const post = (url: string, cookie: string, body: object) =>
    t.http().post(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const patch = (url: string, cookie: string, body: object) =>
    t.http().patch(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const put = (url: string, cookie: string, body: object) =>
    t.http().put(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const del = (url: string, cookie: string) =>
    t.http().delete(url).set('Origin', ORIGIN).set('Cookie', cookie);
  const get = (url: string, cookie: string) => t.http().get(url).set('Cookie', cookie);

  const createClient = async (cookie: string, overrides: object = {}) => {
    const response = await post('/api/clients', cookie, {
      name: 'SC Ștefănescu Construcții SRL',
      cui: 'ro 1234 5678',
      contactPerson: 'Ștefan Țăranu',
      ...overrides,
    }).expect(201);
    return response.body as { id: string; cui: string; responsibles: { id: string }[] };
  };

  describe('acces pe responsabili', () => {
    it('angajatul devine responsabilul clientului pe care îl adaugă', async () => {
      const client = await createClient(ana.cookie, { responsibleIds: [dan.id] });
      expect(client.cui).toBe('RO12345678');
      // Lista de responsabili trimisă de un angajat este ignorată.
      expect(client.responsibles.map((user) => user.id)).toEqual([ana.id]);
    });

    it('angajații își văd doar clienții; administratorul îi vede pe toți', async () => {
      const anaClient = await createClient(ana.cookie);
      await createClient(dan.cookie, { name: 'Alt Client SRL', cui: '87654321' });

      const anaList = await get('/api/clients', ana.cookie).expect(200);
      expect(anaList.body.total).toBe(1);
      expect(anaList.body.items[0].id).toBe(anaClient.id);

      const adminList = await get('/api/clients', admin.cookie).expect(200);
      expect(adminList.body.total).toBe(2);
    });

    it('clienții altora răspund cu 404 la orice operațiune', async () => {
      const client = await createClient(ana.cookie);
      const location = (
        await post('/api/locations', ana.cookie, { clientId: client.id, name: 'Sediu' }).expect(201)
      ).body as { id: string };

      await get(`/api/clients/${client.id}`, dan.cookie).expect(404);
      await patch(`/api/clients/${client.id}`, dan.cookie, { name: 'Furat' }).expect(404);
      await put(`/api/clients/${client.id}/services`, dan.cookie, { serviceIds: [] }).expect(404);
      await get(`/api/locations?clientId=${client.id}`, dan.cookie).expect(404);
      await get(`/api/contracts?clientId=${client.id}`, dan.cookie).expect(404);
      await post('/api/locations', dan.cookie, { clientId: client.id, name: 'X' }).expect(404);
      await patch(`/api/locations/${location.id}`, dan.cookie, { name: 'X' }).expect(404);
      await patch(`/api/locations/${location.id}`, dan.cookie, { isActive: false }).expect(404);
      await post('/api/contracts', dan.cookie, {
        clientId: client.id,
        startDate: '2026-01-01',
      }).expect(404);
      // Nici numărul de angajați nu poate fi schimbat de altcineva.
      await patch(`/api/clients/${client.id}`, dan.cookie, { employeeCount: 99 }).expect(404);
    });

    it('doar administratorul stabilește responsabilii, iar accesul se aplică imediat', async () => {
      const client = await createClient(ana.cookie);
      await put(`/api/clients/${client.id}/responsibles`, ana.cookie, { userIds: [dan.id] }).expect(
        403,
      );

      const updated = await put(`/api/clients/${client.id}/responsibles`, admin.cookie, {
        userIds: [dan.id],
      }).expect(200);
      expect(updated.body.responsibles.map((user: { id: string }) => user.id)).toEqual([dan.id]);

      await get(`/api/clients/${client.id}`, dan.cookie).expect(200);
      await get(`/api/clients/${client.id}`, ana.cookie).expect(404);
    });
  });

  describe('clienți', () => {
    it('respinge un CUI existent, indiferent de prefixul RO', async () => {
      await createClient(ana.cookie);
      const response = await post('/api/clients', dan.cookie, {
        name: 'Duplicat SRL',
        cui: '12345678',
      }).expect(409);
      expect(response.body.fieldErrors).toHaveProperty('cui');
    });

    it('validează datele', async () => {
      const response = await post('/api/clients', ana.cookie, {
        name: '  ',
        cui: 'abc',
        email: 'nu-e-email',
      }).expect(400);
      expect(Object.keys(response.body.fieldErrors)).toEqual(
        expect.arrayContaining(['name', 'cui', 'email']),
      );
    });

    it('caută fără diacritice și fără majuscule, filtrează după status și paginează', async () => {
      await createClient(admin.cookie);
      await createClient(admin.cookie, {
        name: 'Brutăria Bună SRL',
        cui: '111',
        contactPerson: 'Maria Pop',
        isActive: false,
      });
      await createClient(admin.cookie, {
        name: 'Atelier Mecanic SRL',
        cui: '222',
        contactPerson: null,
      });

      const byName = await get('/api/clients?search=stefanescu', admin.cookie).expect(200);
      expect(byName.body.items).toHaveLength(1);
      const byContact = await get('/api/clients?search=TARANU', admin.cookie).expect(200);
      expect(byContact.body.items).toHaveLength(1);
      const byCui = await get('/api/clients?search=ro1234', admin.cookie).expect(200);
      expect(byCui.body.items).toHaveLength(1);

      const inactive = await get('/api/clients?status=inactive', admin.cookie).expect(200);
      expect(inactive.body.items.map((c: { name: string }) => c.name)).toEqual([
        'Brutăria Bună SRL',
      ]);

      const page = await get('/api/clients?page=2&pageSize=2', admin.cookie).expect(200);
      expect(page.body.total).toBe(3);
      expect(page.body.items).toHaveLength(1);
    });

    it('actualizarea parțială păstrează câmpurile netrimise și reface indexul de căutare', async () => {
      const client = await createClient(ana.cookie, { phone: '0721 000 000', notes: 'Observație' });
      const updated = await patch(`/api/clients/${client.id}`, ana.cookie, {
        name: 'Nume Nou SRL',
        notes: '',
      }).expect(200);
      expect(updated.body).toMatchObject({
        name: 'Nume Nou SRL',
        notes: null,
        phone: '0721 000 000',
        contactPerson: 'Ștefan Țăranu',
      });

      const found = await get('/api/clients?search=nume nou', ana.cookie).expect(200);
      expect(found.body.total).toBe(1);
      const old = await get('/api/clients?search=stefanescu', ana.cookie).expect(200);
      expect(old.body.total).toBe(0);
    });
  });

  describe('servicii', () => {
    const createService = async (name: string) =>
      (await post('/api/services', admin.cookie, { name }).expect(201)).body as { id: string };

    it('doar administratorii modifică catalogul; toți îl pot consulta', async () => {
      await createService('SSM');
      await post('/api/services', ana.cookie, { name: 'PSI' }).expect(403);
      const list = await get('/api/services', ana.cookie).expect(200);
      expect(list.body.map((service: { name: string }) => service.name)).toEqual(['SSM']);
      await post('/api/services', admin.cookie, { name: 'ssm' }).expect(409);
    });

    it('se asociază clienților și nu pot fi șterse cât timp sunt folosite', async () => {
      const ssm = await createService('SSM');
      const psi = await createService('PSI');
      const client = await createClient(ana.cookie);

      const updated = await put(`/api/clients/${client.id}/services`, ana.cookie, {
        serviceIds: [ssm.id, psi.id],
      }).expect(200);
      expect(updated.body.services.map((service: { name: string }) => service.name)).toEqual([
        'PSI',
        'SSM',
      ]);

      await del(`/api/services/${ssm.id}`, admin.cookie).expect(409);
      await put(`/api/clients/${client.id}/services`, ana.cookie, { serviceIds: [psi.id] }).expect(
        200,
      );
      await del(`/api/services/${ssm.id}`, admin.cookie).expect(204);
    });
  });

  describe('numărul de angajați', () => {
    it('se ține doar ca număr pe client, cu data ultimei confirmări', async () => {
      const client = await createClient(ana.cookie, { employeeCount: 12 });
      const created = await get(`/api/clients/${client.id}`, ana.cookie).expect(200);
      expect(created.body.employeeCount).toBe(12);
      expect(created.body.employeeCountCheckedAt).toEqual(expect.any(String));

      const updated = await patch(`/api/clients/${client.id}`, ana.cookie, {
        employeeCount: 15,
      }).expect(200);
      expect(updated.body.employeeCount).toBe(15);
      const list = await get('/api/clients', ana.cookie).expect(200);
      expect(list.body.items[0].employeeCount).toBe(15);

      // Modificarea apare în jurnal cu valoarea veche și cea nouă.
      const log = await t.prisma.db.activityLog.findFirst({
        where: { action: 'client.employee_count_updated' },
      });
      expect(log?.metadata).toMatchObject({ from: 12, to: 15 });
      expect(log?.userId).toBe(ana.id);

      // O modificare fără legătură nu atinge numărul și nu adaugă intrări în jurnal.
      await patch(`/api/clients/${client.id}`, ana.cookie, {
        name: 'Alt Nume SRL',
        employeeCount: 15,
      }).expect(200);
      expect(
        await t.prisma.db.activityLog.count({ where: { action: 'client.employee_count_updated' } }),
      ).toBe(1);
    });

    it('poate rămâne necunoscut și este validat', async () => {
      const client = await createClient(ana.cookie);
      expect((await get(`/api/clients/${client.id}`, ana.cookie)).body).toMatchObject({
        employeeCount: null,
        employeeCountCheckedAt: null,
      });
      for (const employeeCount of [-1, 2.5, 'mulți', 1_000_000_000]) {
        const response = await patch(`/api/clients/${client.id}`, ana.cookie, {
          employeeCount,
        }).expect(400);
        expect(response.body.fieldErrors).toHaveProperty('employeeCount');
      }
      await patch(`/api/clients/${client.id}`, ana.cookie, { employeeCount: 0 }).expect(200);
      const cleared = await patch(`/api/clients/${client.id}`, ana.cookie, {
        employeeCount: '',
      }).expect(200);
      expect(cleared.body.employeeCount).toBeNull();
    });

    it('aplicația nu mai are evidență nominală a angajaților clienților', async () => {
      const client = await createClient(ana.cookie);
      await get(`/api/employees?clientId=${client.id}`, admin.cookie).expect(404);
      await post('/api/employees', admin.cookie, {
        clientId: client.id,
        firstName: 'Ion',
        lastName: 'Pop',
      }).expect(404);
      const tables = await t.prisma.db.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
      expect(tables.map((row) => row.table_name)).not.toContain('employees');
    });
  });

  describe('arhivare în loc de ștergere', () => {
    const setup = async () => {
      const client = await createClient(ana.cookie, { employeeCount: 7 });
      const location = (
        await post('/api/locations', ana.cookie, { clientId: client.id, name: 'Depozit' }).expect(
          201,
        )
      ).body as { id: string };
      const contract = (
        await post('/api/contracts', ana.cookie, {
          clientId: client.id,
          number: '7',
          startDate: '2026-01-01',
          fees: [{ description: 'Abonament', amount: 500, frequencyUnit: 'MONTH' }],
        }).expect(201)
      ).body as { id: string };
      return { client, location, contract };
    };
    const actions = async () =>
      (await t.prisma.db.activityLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
        (entry) => entry.action,
      );

    it('nu există ștergere definitivă pentru clienți, puncte de lucru și contracte', async () => {
      const { client, location, contract } = await setup();
      for (const url of [
        `/api/clients/${client.id}`,
        `/api/locations/${location.id}`,
        `/api/contracts/${contract.id}`,
      ]) {
        await del(url, admin.cookie).expect(404);
        await del(url, ana.cookie).expect(404);
      }
      expect(await t.prisma.db.client.count()).toBe(1);
      expect(await t.prisma.db.location.count()).toBe(1);
      expect(await t.prisma.db.contract.count()).toBe(1);
    });

    it('nici baza de date nu permite ștergerea unui client care are istoric', async () => {
      const { client } = await setup();
      await expect(t.prisma.db.client.delete({ where: { id: client.id } })).rejects.toThrow();
      expect(await t.prisma.db.location.count()).toBe(1);
    });

    it('un client arhivat rămâne în evidență cu toate datele și poate fi reactivat', async () => {
      const { client } = await setup();
      const archived = await patch(`/api/clients/${client.id}`, ana.cookie, {
        isActive: false,
      }).expect(200);
      expect(archived.body.isActive).toBe(false);

      // Nu mai apare printre clienții activi, dar rămâne accesibil responsabilului său.
      const active = await get('/api/clients?status=active', ana.cookie).expect(200);
      expect(active.body.total).toBe(0);
      const inactive = await get('/api/clients?status=inactive', ana.cookie).expect(200);
      expect(inactive.body.items[0].id).toBe(client.id);
      await get(`/api/clients/${client.id}`, ana.cookie).expect(200);
      await get(`/api/clients/${client.id}`, dan.cookie).expect(404);

      // Datele lui rămân neatinse și pot fi consultate.
      expect((await get(`/api/locations?clientId=${client.id}`, ana.cookie)).body).toHaveLength(1);
      expect((await get(`/api/contracts?clientId=${client.id}`, ana.cookie)).body).toHaveLength(1);
      expect((await get(`/api/clients/${client.id}`, ana.cookie)).body.responsibles).toHaveLength(
        1,
      );

      // Cifrele de pe pagina principală numără doar clienții activi.
      const summary = await get('/api/clients/summary', ana.cookie).expect(200);
      expect(summary.body).toMatchObject({
        activeClients: 0,
        totalEmployees: 0,
        monthlyEstimate: 0,
      });

      await patch(`/api/clients/${client.id}`, ana.cookie, { isActive: true }).expect(200);
      expect((await get('/api/clients/summary', ana.cookie)).body).toMatchObject({
        activeClients: 1,
        totalEmployees: 7,
        monthlyEstimate: 500,
      });
      expect(await actions()).toEqual(
        expect.arrayContaining(['client.deactivated', 'client.activated']),
      );
    });

    it('un punct de lucru arhivat rămâne în evidență și poate fi reactivat', async () => {
      const { client, location } = await setup();

      await patch(`/api/locations/${location.id}`, ana.cookie, { isActive: false }).expect(200);
      const locations = await get(`/api/locations?clientId=${client.id}`, ana.cookie).expect(200);
      expect(locations.body[0]).toMatchObject({ id: location.id, isActive: false });
      expect((await get(`/api/clients/${client.id}`, ana.cookie)).body.locationCount).toBe(0);

      await patch(`/api/locations/${location.id}`, ana.cookie, { isActive: true }).expect(200);
      expect((await get(`/api/clients/${client.id}`, ana.cookie)).body.locationCount).toBe(1);
      expect(await actions()).toEqual(
        expect.arrayContaining(['location.deactivated', 'location.activated']),
      );
    });

    it('un contract încheiat rămâne în evidență, cu tarifele lui, dar iese din estimare', async () => {
      const { client, contract } = await setup();
      expect((await get(`/api/clients/${client.id}`, ana.cookie)).body.monthlyEstimate).toBe(500);

      await patch(`/api/contracts/${contract.id}`, ana.cookie, {
        status: 'ENDED',
        endDate: '2026-06-30',
      }).expect(200);

      const contracts = await get(`/api/contracts?clientId=${client.id}`, ana.cookie).expect(200);
      expect(contracts.body).toHaveLength(1);
      expect(contracts.body[0]).toMatchObject({ status: 'ENDED', endDate: '2026-06-30' });
      expect(contracts.body[0].fees).toHaveLength(1);
      expect((await get(`/api/clients/${client.id}`, ana.cookie)).body.monthlyEstimate).toBe(0);
      expect(await actions()).toContain('contract.ended');
    });

    it('istoricul rămâne și după dezactivarea contului unui coleg', async () => {
      const { client } = await setup();
      await patch(`/api/users/${ana.id}`, admin.cookie, { isActive: false }).expect(200);

      // Clientul, responsabilitatea și jurnalul rămân; contul doar nu se mai poate autentifica.
      const view = await get(`/api/clients/${client.id}`, admin.cookie).expect(200);
      expect(view.body.responsibles.map((user: { id: string }) => user.id)).toEqual([ana.id]);
      const log = await t.prisma.db.activityLog.findFirst({ where: { action: 'client.created' } });
      expect(log?.userId).toBe(ana.id);
      await get(`/api/clients/${client.id}`, ana.cookie).expect(401);
    });
  });

  describe('contracte și tarife', () => {
    it('salvează tarife cu frecvențe diferite și estimează venitul lunar', async () => {
      const service = (await post('/api/services', admin.cookie, { name: 'SSM' }).expect(201))
        .body as {
        id: string;
      };
      const client = await createClient(ana.cookie);

      const created = await post('/api/contracts', ana.cookie, {
        clientId: client.id,
        number: '12/2026',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        fees: [
          { serviceId: service.id, amount: 400, frequencyUnit: 'MONTH' },
          {
            description: 'Verificare trimestrială',
            amount: 300,
            frequencyUnit: 'MONTH',
            frequencyInterval: 3,
          },
          {
            description: 'Deplasare suplimentară',
            amount: 150.5,
            frequencyUnit: 'VISIT',
            frequencyInterval: 9,
          },
        ],
      }).expect(201);

      expect(created.body).toMatchObject({
        number: '12/2026',
        status: 'ACTIVE',
        monthlyEstimate: 500,
      });
      expect(created.body.fees).toHaveLength(3);
      expect(created.body.fees[0]).toMatchObject({
        serviceName: 'SSM',
        amount: 400,
        frequencyInterval: 1,
      });
      // Intervalul nu are sens pentru tarifele „la deplasare”.
      expect(created.body.fees[2]).toMatchObject({ amount: 150.5, frequencyInterval: 1 });

      const detail = await get(`/api/clients/${client.id}`, ana.cookie).expect(200);
      expect(detail.body.monthlyEstimate).toBe(500);

      // La actualizare, lista de tarife o înlocuiește pe cea veche.
      const updated = await patch(`/api/contracts/${created.body.id}`, ana.cookie, {
        fees: [{ description: 'Abonament săptămânal', amount: 120, frequencyUnit: 'WEEK' }],
      }).expect(200);
      expect(updated.body.fees).toHaveLength(1);
      expect(updated.body.monthlyEstimate).toBe(520);
      expect(updated.body.number).toBe('12/2026');

      // Contractele încheiate nu mai intră în estimare.
      await patch(`/api/contracts/${created.body.id}`, ana.cookie, { status: 'ENDED' }).expect(200);
      const ended = await get(`/api/clients/${client.id}`, ana.cookie).expect(200);
      expect(ended.body.monthlyEstimate).toBe(0);
    });

    it('validează perioada și tarifele', async () => {
      const client = await createClient(ana.cookie);
      const period = await post('/api/contracts', ana.cookie, {
        clientId: client.id,
        startDate: '2026-06-01',
        endDate: '2026-05-01',
      }).expect(400);
      expect(period.body.fieldErrors).toHaveProperty('endDate');

      await post('/api/contracts', ana.cookie, {
        clientId: client.id,
        startDate: '2026-02-30',
      }).expect(400);

      const fee = await post('/api/contracts', ana.cookie, {
        clientId: client.id,
        startDate: '2026-01-01',
        fees: [{ amount: 100, frequencyUnit: 'MONTH' }],
      }).expect(400);
      expect(fee.body.fieldErrors).toHaveProperty('fees.0.description');

      const amount = await post('/api/contracts', ana.cookie, {
        clientId: client.id,
        startDate: '2026-01-01',
        fees: [{ description: 'x', amount: -5, frequencyUnit: 'DAILY' }],
      }).expect(400);
      expect(Object.keys(amount.body.fieldErrors)).toEqual(
        expect.arrayContaining(['fees.0.amount', 'fees.0.frequencyUnit']),
      );
    });

    it('sumarul include doar clienții vizibili și semnalează contractele care expiră', async () => {
      const anaClient = await createClient(ana.cookie);
      const danClient = await createClient(dan.cookie, { name: 'Alt Client SRL', cui: '87654321' });
      const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      await post('/api/contracts', ana.cookie, {
        clientId: anaClient.id,
        number: 'A1',
        startDate: '2025-01-01',
        endDate: soon,
        fees: [{ description: 'Abonament', amount: 700, frequencyUnit: 'MONTH' }],
      }).expect(201);
      await post('/api/contracts', dan.cookie, {
        clientId: danClient.id,
        startDate: '2025-01-01',
        fees: [{ description: 'Abonament', amount: 300, frequencyUnit: 'MONTH' }],
      }).expect(201);
      await patch(`/api/clients/${anaClient.id}`, ana.cookie, { employeeCount: 4 }).expect(200);
      await patch(`/api/clients/${danClient.id}`, dan.cookie, { employeeCount: 9 }).expect(200);

      const anaSummary = await get('/api/clients/summary', ana.cookie).expect(200);
      expect(anaSummary.body).toMatchObject({
        activeClients: 1,
        totalEmployees: 4,
        monthlyEstimate: 700,
      });
      expect(anaSummary.body.expiringContracts).toEqual([
        expect.objectContaining({
          number: 'A1',
          clientName: 'SC Ștefănescu Construcții SRL',
          endDate: soon,
        }),
      ]);

      const adminSummary = await get('/api/clients/summary', admin.cookie).expect(200);
      expect(adminSummary.body).toMatchObject({
        activeClients: 2,
        totalEmployees: 13,
        monthlyEstimate: 1000,
      });
    });
  });
});
