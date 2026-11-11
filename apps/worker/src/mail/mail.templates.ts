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

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * Rezumatul zilnic. Conține doar numere: titlurile task-urilor și numele clienților
 * rămân în aplicație și nu sunt trimise prin furnizorul de email.
 */
function taskDigest(data: Extract<MailJobData, { kind: 'task-digest' }>): RenderedMail {
  const lines = [
    data.overdueCount > 0
      ? plural(data.overdueCount, 'activitate restantă', 'activități restante')
      : null,
    data.dueTodayCount > 0
      ? `${plural(data.dueTodayCount, 'activitate', 'activități')} cu termen astăzi`
      : null,
    data.dueSoonCount > 0
      ? `${plural(data.dueSoonCount, 'activitate', 'activități')} cu termen în zilele următoare`
      : null,
  ].filter((line): line is string => line !== null);
  const url = `${data.appUrl}/task-uri`;

  const subject =
    data.overdueCount > 0
      ? `Ai ${plural(data.overdueCount, 'activitate restantă', 'activități restante')} – Alconst Serv`
      : 'Termene de urmărit – Alconst Serv';
  const text = [
    `Bună, ${data.firstName},`,
    '',
    'Ai notificări noi în aplicația Alconst Serv:',
    ...lines.map((line) => `  • ${line}`),
    '',
    `Deschide aplicația pentru detalii: ${url}`,
    '',
    'Poți opri aceste emailuri din Contul meu → Notificări.',
  ].join('\n');
  const html = layout(
    'Termene de urmărit',
    `<p style="margin:0 0 12px;line-height:1.5;">Bună, ${escapeHtml(data.firstName)},</p>
      <p style="margin:0 0 8px;line-height:1.5;">Ai notificări noi în aplicația Alconst Serv:</p>
      <ul style="margin:0 0 20px;padding-left:20px;line-height:1.7;">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      <p style="margin:0 0 20px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#344881;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Vezi ce ai de făcut</a></p>
      <p style="margin:0;line-height:1.5;font-size:14px;color:#4b5563;">Poți opri aceste emailuri din Contul meu → Notificări.</p>`,
  );
  return { subject, text, html };
}

/**
 * Notificare trimisă imediat. Textul vine gata pregătit de API și este deliberat general
 * (fără titluri de task-uri sau nume de clienți); detaliile se văd în aplicație.
 */
function notification(data: Extract<MailJobData, { kind: 'notification' }>): RenderedMail {
  const subject = `${data.headline} – Alconst Serv`;
  const text = [
    `Bună, ${data.firstName},`,
    '',
    data.message,
    '',
    `Deschide aplicația pentru detalii: ${data.actionUrl}`,
    '',
    'Poți opri aceste emailuri din Contul meu → Notificări.',
  ].join('\n');
  const html = layout(
    data.headline,
    `<p style="margin:0 0 12px;line-height:1.5;">Bună, ${escapeHtml(data.firstName)},</p>
      <p style="margin:0 0 20px;line-height:1.5;">${escapeHtml(data.message)}</p>
      <p style="margin:0 0 20px;"><a href="${escapeHtml(data.actionUrl)}" style="display:inline-block;background:#344881;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Deschide aplicația</a></p>
      <p style="margin:0;line-height:1.5;font-size:14px;color:#4b5563;">Poți opri aceste emailuri din Contul meu → Notificări.</p>`,
  );
  return { subject, text, html };
}

/** Construiește conținutul emailului pentru un job din coada `mail`. */
export function renderMail(data: MailJobData): RenderedMail {
  switch (data.kind) {
    case 'password-reset':
      return passwordReset(data);
    case 'task-digest':
      return taskDigest(data);
    case 'notification':
      return notification(data);
  }
}
