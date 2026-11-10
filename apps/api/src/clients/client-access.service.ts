import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@alconst/database';
import { AppException } from '../common/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Regula de acces la clienți, într-un singur loc:
 *  - administratorii văd și modifică toți clienții;
 *  - angajații văd și modifică doar clienții la care sunt responsabili.
 *
 * Toate datele legate de un client (puncte de lucru, angajați, contracte) moștenesc aceeași regulă.
 */
@Injectable()
export class ClientAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Condiția Prisma care restrânge o interogare la clienții vizibili utilizatorului. */
  scope(user: User): Prisma.ClientWhereInput {
    if (user.role === 'ADMIN') return {};
    return { assignments: { some: { userId: user.id } } };
  }

  /**
   * Verifică accesul la un client. Pentru clienții inaccesibili răspunsul este „nu există”,
   * astfel încât un angajat să nu poată afla ce alți clienți are firma.
   */
  async assertAccess(clientId: string, user: User): Promise<void> {
    const found = await this.prisma.db.client.findFirst({
      where: { id: clientId, ...this.scope(user) },
      select: { id: true },
    });
    if (!found) throw AppException.notFound('Clientul nu există.');
  }
}
