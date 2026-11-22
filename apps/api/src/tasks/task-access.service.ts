import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@alconst/database';
import { AppException } from '../common/app.exception.js';
import { ClientAccessService } from '../clients/client-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Regulile de acces la task-uri și obligații:
 *  - administratorii văd tot;
 *  - un angajat vede tot ce ține de clienții lui, ce îi este atribuit lui și activitățile fără
 *    client create de el.
 *
 * Accesul la ce ține de un client urmează întotdeauna responsabilitatea pentru client: cine a
 * creat o activitate recurentă pentru un client predat apoi unui coleg nu mai are acces la ea.
 */
@Injectable()
export class TaskAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientAccessService,
  ) {}

  taskScope(user: User): Prisma.TaskWhereInput {
    if (user.role === 'ADMIN') return {};
    return {
      OR: [
        { assigneeId: user.id },
        { clientId: null, createdById: user.id },
        { client: this.clients.scope(user) },
      ],
    };
  }

  /** Ce activități recurente vede un angajat. */
  obligationScope(user: User): Prisma.ObligationWhereInput {
    if (user.role === 'ADMIN') return {};
    return {
      OR: [
        { assigneeId: user.id },
        { clientId: null, createdById: user.id },
        { client: this.clients.scope(user) },
      ],
    };
  }

  /**
   * Ce activități recurente poate modifica sau șterge un angajat: cele ale clienților lui și cele
   * fără client create de el sau atribuite lui. Un coleg care doar face deplasările unui client
   * al altcuiva le vede, dar nu poate schimba programul clientului.
   */
  obligationManageScope(user: User): Prisma.ObligationWhereInput {
    if (user.role === 'ADMIN') return {};
    return {
      OR: [
        { clientId: null, OR: [{ createdById: user.id }, { assigneeId: user.id }] },
        { client: this.clients.scope(user) },
      ],
    };
  }

  /** Clientul este al utilizatorului (sau utilizatorul este administrator). */
  async ownsClient(clientId: string | null, user: User): Promise<boolean> {
    if (user.role === 'ADMIN') return true;
    if (!clientId) return false;
    const count = await this.prisma.db.client.count({
      where: { id: clientId, ...this.clients.scope(user) },
    });
    return count > 0;
  }

  /**
   * Validează legăturile unui task sau ale unei obligații noi: clientul trebuie să fie accesibil,
   * punctul de lucru să aparțină clientului, iar responsabilul să fie un utilizator activ.
   */
  async assertLinks(
    links: { clientId?: string | null; locationId?: string | null; assigneeId?: string | null },
    user: User,
  ): Promise<void> {
    if (links.clientId) await this.clients.assertAccess(links.clientId, user);
    await this.assertLocation(links.locationId, links.clientId);
    await this.assertAssignee(links.assigneeId);
  }

  /** La modificare se validează doar legăturile care se schimbă. */
  async assertChangedLinks(
    before: { clientId: string | null; locationId: string | null; assigneeId: string | null },
    after: { clientId: string | null; locationId: string | null; assigneeId: string | null },
    user: User,
  ): Promise<void> {
    const clientChanged = after.clientId !== before.clientId;
    if (clientChanged && after.clientId) await this.clients.assertAccess(after.clientId, user);
    if (clientChanged || after.locationId !== before.locationId) {
      await this.assertLocation(after.locationId, after.clientId);
    }
    if (after.assigneeId !== before.assigneeId) await this.assertAssignee(after.assigneeId);
  }

  private async assertLocation(
    locationId: string | null | undefined,
    clientId: string | null | undefined,
  ): Promise<void> {
    if (!locationId) return;
    const location = clientId
      ? await this.prisma.db.location.findFirst({
          where: { id: locationId, clientId },
          select: { id: true, isActive: true },
        })
      : null;
    if (!location) {
      throw AppException.validation('Punctul de lucru nu aparține clientului ales.', {
        locationId: ['Punctul de lucru nu aparține clientului ales.'],
      });
    }
    // Validat doar când punctul de lucru este ales acum: ce era deja ales rămâne neschimbat.
    if (!location.isActive) {
      throw AppException.validation('Punctul de lucru este arhivat. Alege altul.', {
        locationId: ['Punctul de lucru este arhivat. Alege altul.'],
      });
    }
  }

  private async assertAssignee(assigneeId: string | null | undefined): Promise<void> {
    if (!assigneeId) return;
    const assignee = await this.prisma.db.user.findFirst({
      where: { id: assigneeId, isActive: true },
      select: { id: true },
    });
    if (!assignee) {
      throw AppException.validation('Responsabilul ales nu există sau este dezactivat.', {
        assigneeId: ['Responsabilul ales nu există sau este dezactivat.'],
      });
    }
  }
}
