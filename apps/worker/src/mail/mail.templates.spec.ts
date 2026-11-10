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
});
