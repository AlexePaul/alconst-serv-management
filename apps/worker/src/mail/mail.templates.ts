import type { MailJobData } from '@alconst/shared';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ro">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2933;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:32px 0 0;font-size:12px;color:#6b7280;">Alconst Serv · Aplicația internă de management SSM/PSI</p>
    </div>
  </body>
</html>`;
}

function passwordReset(data: Extract<MailJobData, { kind: 'password-reset' }>): RenderedMail {
  const subject = 'Resetarea parolei – Alconst Serv';
  const text = [
    `Bună, ${data.firstName},`,
    '',
    'Am primit o cerere de resetare a parolei pentru contul tău din aplicația Alconst Serv.',
    'Deschide linkul de mai jos pentru a alege o parolă nouă:',
    '',
    data.resetUrl,
    '',
    `Linkul este valabil ${data.expiresInMinutes} de minute și poate fi folosit o singură dată.`,
    'Dacă nu ai solicitat tu resetarea, poți ignora acest mesaj – parola ta rămâne neschimbată.',
  ].join('\n');

  const url = escapeHtml(data.resetUrl);
  const html = layout(
    'Resetarea parolei',
    `<p style="margin:0 0 12px;line-height:1.5;">Bună, ${escapeHtml(data.firstName)},</p>
      <p style="margin:0 0 20px;line-height:1.5;">Am primit o cerere de resetare a parolei pentru contul tău din aplicația Alconst Serv.</p>
      <p style="margin:0 0 20px;"><a href="${url}" style="display:inline-block;background:#344881;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Alege o parolă nouă</a></p>
      <p style="margin:0 0 12px;line-height:1.5;font-size:14px;color:#4b5563;">Linkul este valabil ${data.expiresInMinutes} de minute și poate fi folosit o singură dată.</p>
      <p style="margin:0;line-height:1.5;font-size:14px;color:#4b5563;">Dacă nu ai solicitat tu resetarea, poți ignora acest mesaj – parola ta rămâne neschimbată.</p>`,
  );
  return { subject, text, html };
}

/** Construiește conținutul emailului pentru un job din coada `mail`. */
export function renderMail(data: MailJobData): RenderedMail {
  switch (data.kind) {
    case 'password-reset':
      return passwordReset(data);
  }
}
