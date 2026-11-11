import { renderMail } from './mail.templates.js';

describe('renderMail', () => {
  const data = {
    kind: 'password-reset' as const,
    to: 'ana@test.ro',
    firstName: 'Ana <script>',
    resetUrl: 'https://app.alconst-serv.ro/resetare-parola?token=abc&x=1',
    expiresInMinutes: 60,
  };

  it('include linkul de resetare și durata de valabilitate', () => {
    const mail = renderMail(data);
    expect(mail.subject).toContain('Resetarea parolei');
    expect(mail.text).toContain(data.resetUrl);
    expect(mail.text).toContain('60 de minute');
    expect(mail.html).toContain(
      'href="https://app.alconst-serv.ro/resetare-parola?token=abc&amp;x=1"',
    );
  });

  it('escapează datele utilizatorului în HTML', () => {
    const mail = renderMail(data);
    expect(mail.html).toContain('Ana &lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
  });

  it('rezumatul zilnic conține doar numere și linkul către aplicație', () => {
    const mail = renderMail({
      kind: 'task-digest',
      to: 'ana@test.ro',
      firstName: 'Ana',
      overdueCount: 2,
      dueTodayCount: 1,
      dueSoonCount: 0,
      appUrl: 'https://app.alconst-serv.ro',
    });
    expect(mail.subject).toBe('Ai 2 activități restante – Alconst Serv');
    expect(mail.text).toContain('2 activități restante');
    expect(mail.text).toContain('1 activitate cu termen astăzi');
    expect(mail.text).not.toContain('zilele următoare');
    expect(mail.text).toContain('https://app.alconst-serv.ro/task-uri');
    expect(mail.html).toContain('href="https://app.alconst-serv.ro/task-uri"');
  });

  it('notificarea imediată folosește textul general primit și escapează conținutul', () => {
    const mail = renderMail({
      kind: 'notification',
      to: 'dan@test.ro',
      firstName: 'Dan',
      headline: 'Cerere de predare a unui client',
      message: 'Un coleg vrea să îți predea <definitiv> un client.',
      actionUrl: 'https://app.alconst-serv.ro/',
    });
    expect(mail.subject).toBe('Cerere de predare a unui client – Alconst Serv');
    expect(mail.text).toContain('Un coleg vrea să îți predea <definitiv> un client.');
    expect(mail.html).toContain('&lt;definitiv&gt;');
    expect(mail.html).toContain('href="https://app.alconst-serv.ro/"');
  });
});
