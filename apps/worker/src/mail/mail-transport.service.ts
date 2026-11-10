import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { WorkerConfig } from '../config/worker-config.js';
import type { RenderedMail } from './mail.templates.js';

/** Trimite emailuri prin SMTP. Fără SMTP configurat (doar în dezvoltare), le scrie în log. */
@Injectable()
export class MailTransportService {
  private readonly logger = new Logger(MailTransportService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly config: WorkerConfig) {
    const { smtp } = config;
    this.transporter = smtp
      ? createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password ?? '' } } : {}),
        })
      : null;
    if (!this.transporter) {
      this.logger.warn('SMTP nu este configurat – emailurile vor fi doar afișate în log.');
    }
  }

  async send(to: string, mail: RenderedMail): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[email simulat] către ${to} – ${mail.subject}\n${mail.text}`);
      return;
    }
    await this.transporter.sendMail({
      from: this.config.mailFrom,
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }
}
