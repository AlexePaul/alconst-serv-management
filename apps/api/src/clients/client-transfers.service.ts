import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@alconst/database';
import type { ClientTransferRequestDto, TransferResultDto } from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const userRef = { select: { id: true, firstName: true, lastName: true } } as const;
const include = {
  client: { select: { id: true, name: true } },
  from: userRef,
  to: userRef,
  initiatedBy: userRef,
} satisfies Prisma.ClientTransferRequestInclude;
type Row = Prisma.ClientTransferRequestGetPayload<{ include: typeof include }>;

const fullName = (user: { firstName: string; lastName: string }) =>
  `${user.firstName} ${user.lastName}`;

/** Unde ajunge cel care deschide o notificare despre o cerere: lista cererilor de pe pagina principală. */
const REQUESTS_LINK = '/';

/**
 * Predarea definitivă a unui client de la un responsabil la altul.
 *
 *  - Un administrator transferă direct, între oricare doi utilizatori.
 *  - Între colegi este nevoie de acordul amândurora: oricare dintre cei doi poate iniția o
 *    cerere, iar transferul are loc doar după ce celălalt o acceptă.
 *
 * La transfer, noul responsabil preia clientul, obligațiile lui și task-urile deschise ale celui
 * care predă. (Pentru o singură deplasare este suficientă schimbarea responsabilului pe task.)
 */
@Injectable()
export class ClientTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async request(
    clientId: string,
    fromUserId: string,
    toUserId: string,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<TransferResultDto> {
    const me = auth.user;
    const isAdmin = me.role === 'ADMIN';
    const target = await this.prisma.db.client.findUnique({
      where: { id: clientId },
      include: { assignments: { select: { userId: true } } },
    });
    const responsibleIds = target?.assignments.map((assignment) => assignment.userId) ?? [];

    if (!isAdmin) {
      // Cel care predă trebuie să fie chiar responsabilul clientului. Cel care preia trebuie să
      // cunoască deja clientul printr-un task care i-a fost atribuit – altfel nu are de unde ști
      // că acest client există, iar răspunsul este „nu există”.
      const isResponsible = responsibleIds.includes(me.id);
      const isGiver = isResponsible && fromUserId === me.id;
      const isTaker =
        toUserId === me.id &&
        (await this.prisma.db.task.count({ where: { clientId, assigneeId: me.id } })) > 0;
      if (!isGiver && !isTaker) {
        if (isResponsible) {
          throw AppException.forbidden('Poți preda doar clienții la care ești tu responsabil.');
        }
        throw AppException.notFound('Clientul nu există.');
      }
    }
    if (!target) throw AppException.notFound('Clientul nu există.');

    if (fromUserId === toUserId) {
      throw AppException.validation('Alege un alt utilizator decât responsabilul actual.', {
        toUserId: ['Alege un alt utilizator decât responsabilul actual.'],
      });
    }
    if (!responsibleIds.includes(fromUserId)) {
      throw AppException.validation('Utilizatorul ales nu este responsabil pentru acest client.', {
        fromUserId: ['Utilizatorul ales nu este responsabil pentru acest client.'],
      });
    }
    const [from, to] = await Promise.all([this.findUser(fromUserId), this.findUser(toUserId)]);
    if (!to?.isActive || !from) {
      throw AppException.validation('Noul responsabil nu există sau este dezactivat.', {
        toUserId: ['Noul responsabil nu există sau este dezactivat.'],
      });
    }

    if (isAdmin) {
      const counts = await this.execute(clientId, fromUserId, toUserId);
      await this.notifyTransferred(target, from, to, counts.tasks, me.id);
      await this.activity.log({
        action: 'client.transferred',
        userId: me.id,
        entityType: 'client',
        entityId: clientId,
        entityLabel: target.name,
        metadata: { fromUserId, toUserId, ...counts },
        ip: client.ip,
      });
      return { status: 'COMPLETED' };
    }

    const pending = await this.prisma.db.clientTransferRequest.findFirst({
      where: { clientId, fromUserId, toUserId, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) {
      throw AppException.conflict('Există deja o cerere în așteptare pentru acest client.');
    }

    const created = await this.prisma.db.clientTransferRequest.create({
      data: { clientId, fromUserId, toUserId, initiatedById: me.id },
      select: { id: true },
    });
    const offering = me.id === fromUserId;
    await this.notifications.notify({
      userId: offering ? toUserId : fromUserId,
      type: 'TRANSFER_REQUESTED',
      subjectId: created.id,
      title: offering ? 'Cerere de predare a unui client' : 'Cerere de preluare a unui client',
      body: offering
        ? `${fullName(me)} vrea să îți predea clientul ${target.name}`
        : `${fullName(me)} vrea să preia clientul ${target.name}`,
      link: REQUESTS_LINK,
      emailMessage: offering
        ? 'Un coleg vrea să îți predea definitiv un client. Deschide aplicația pentru a accepta sau refuza cererea.'
        : 'Un coleg vrea să preia definitiv unul dintre clienții tăi. Deschide aplicația pentru a accepta sau refuza cererea.',
    });
    await this.activity.log({
      action: 'client.transfer_requested',
      userId: me.id,
      entityType: 'client',
      entityId: clientId,
      entityLabel: target.name,
      metadata: { fromUserId, toUserId, requestId: created.id },
      ip: client.ip,
    });
    return { status: 'PENDING' };
  }

  /** Cererile în așteptare în care este implicat utilizatorul (toate, pentru administratori). */
  async listPending(auth: AuthContext): Promise<ClientTransferRequestDto[]> {
    const rows = await this.prisma.db.clientTransferRequest.findMany({
      where: { status: 'PENDING', ...this.visibleTo(auth.user) },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      client: row.client,
      from: row.from,
      to: row.to,
      initiatedBy: row.initiatedBy,
      createdAt: row.createdAt.toISOString(),
      canRespond: auth.user.role === 'ADMIN' || this.counterpartId(row) === auth.user.id,
      canCancel: row.initiatedById === auth.user.id,
    }));
  }

  async accept(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const request = await this.findPending(id, auth.user);
    this.assertCanRespond(request, auth.user);

    // Între timp situația s-a putut schimba (clientul a fost predat altcuiva, contul dezactivat).
    const [stillResponsible, to] = await Promise.all([
      this.prisma.db.clientAssignment.findUnique({
        where: { clientId_userId: { clientId: request.clientId, userId: request.fromUserId } },
      }),
      this.findUser(request.toUserId),
    ]);
    if (!stillResponsible || !to?.isActive) {
      await this.resolve(id, 'CANCELLED', auth.user.id);
      throw AppException.conflict('Cererea nu mai este valabilă și a fost anulată.');
    }

    const counts = await this.execute(request.clientId, request.fromUserId, request.toUserId);
    await this.resolve(id, 'ACCEPTED', auth.user.id);
    // Alte cereri în așteptare pentru același client și același responsabil nu mai au obiect.
    await this.prisma.db.clientTransferRequest.updateMany({
      where: { clientId: request.clientId, fromUserId: request.fromUserId, status: 'PENDING' },
      data: { status: 'CANCELLED', resolvedAt: new Date(), resolvedById: auth.user.id },
    });

    if (request.initiatedById !== auth.user.id) {
      await this.notifications.notify({
        userId: request.initiatedById,
        type: 'TRANSFER_ACCEPTED',
        subjectId: id,
        title: 'Cererea de predare a fost acceptată',
        body:
          request.initiatedById === request.toUserId
            ? `Ai preluat clientul ${request.client.name}`
            : `${fullName(request.to)} a preluat clientul ${request.client.name}`,
        link:
          request.initiatedById === request.toUserId ? `/clienti/${request.clientId}` : '/clienti',
        emailMessage: 'Cererea ta de predare a unui client a fost acceptată.',
      });
    }
    await this.activity.log({
      action: 'client.transferred',
      userId: auth.user.id,
      entityType: 'client',
      entityId: request.clientId,
      entityLabel: request.client.name,
      metadata: {
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        requestId: id,
        ...counts,
      },
      ip: client.ip,
    });
  }

  async decline(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const request = await this.findPending(id, auth.user);
    this.assertCanRespond(request, auth.user);
    await this.resolve(id, 'DECLINED', auth.user.id);

    if (request.initiatedById !== auth.user.id) {
      await this.notifications.notify({
        userId: request.initiatedById,
        type: 'TRANSFER_DECLINED',
        subjectId: id,
        title: 'Cererea de predare a fost refuzată',
        body: `${fullName(auth.user)} a refuzat predarea clientului ${request.client.name}`,
        link: REQUESTS_LINK,
        emailMessage: 'Cererea ta de predare a unui client a fost refuzată.',
      });
    }
    await this.log('client.transfer_declined', request, auth, client);
  }

  /** Cel care a inițiat cererea (sau un administrator) o poate retrage cât timp este în așteptare. */
  async cancel(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const request = await this.findPending(id, auth.user);
    if (auth.user.role !== 'ADMIN' && request.initiatedById !== auth.user.id) {
      throw AppException.forbidden('Doar cel care a trimis cererea o poate retrage.');
    }
    await this.resolve(id, 'CANCELLED', auth.user.id);
    await this.log('client.transfer_cancelled', request, auth, client);
  }

  /** Mută responsabilitatea, obligațiile și task-urile deschise. */
  private async execute(
    clientId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<{ obligations: number; tasks: number }> {
    const [, , obligations, tasks] = await this.prisma.db.$transaction([
      this.prisma.db.clientAssignment.deleteMany({ where: { clientId, userId: fromUserId } }),
      this.prisma.db.clientAssignment.createMany({
        data: [{ clientId, userId: toUserId }],
        skipDuplicates: true,
      }),
      this.prisma.db.obligation.updateMany({
        where: { clientId, assigneeId: fromUserId },
        data: { assigneeId: toUserId },
      }),
      // Doar task-urile deschise își schimbă responsabilul; istoricul celor încheiate rămâne.
      this.prisma.db.task.updateMany({
        where: { clientId, assigneeId: fromUserId, status: { in: ['TODO', 'IN_PROGRESS'] } },
        data: { assigneeId: toUserId },
      }),
    ]);
    return { obligations: obligations.count, tasks: tasks.count };
  }

  /** La un transfer făcut de administrator sunt anunțați ambii colegi. */
  private async notifyTransferred(
    client: { id: string; name: string },
    from: Pick<User, 'id' | 'firstName' | 'lastName'>,
    to: Pick<User, 'id' | 'firstName' | 'lastName'>,
    taskCount: number,
    actorId: string,
  ): Promise<void> {
    if (to.id !== actorId) {
      await this.notifications.notify({
        userId: to.id,
        type: 'CLIENT_TRANSFERRED',
        subjectId: client.id,
        title: 'Ai preluat un client',
        body:
          taskCount > 0
            ? `${client.name} · ${taskCount === 1 ? '1 task deschis' : `${taskCount} task-uri deschise`}`
            : client.name,
        link: `/clienti/${client.id}`,
        emailMessage: 'Un administrator ți-a atribuit definitiv un client.',
      });
    }
    if (from.id !== actorId) {
      await this.notifications.notify({
        userId: from.id,
        type: 'CLIENT_TRANSFERRED',
        subjectId: client.id,
        title: 'Un client al tău a fost predat altui coleg',
        body: `${client.name} → ${fullName(to)}`,
        link: '/clienti',
        emailMessage: 'Un administrator a predat unul dintre clienții tăi altui coleg.',
      });
    }
  }

  /** Persoana al cărei acord se așteaptă: cea care nu a inițiat cererea. */
  private counterpartId(request: {
    initiatedById: string;
    fromUserId: string;
    toUserId: string;
  }): string {
    return request.initiatedById === request.fromUserId ? request.toUserId : request.fromUserId;
  }

  private assertCanRespond(request: Row, user: User): void {
    if (user.role !== 'ADMIN' && this.counterpartId(request) !== user.id) {
      throw AppException.forbidden('Doar colegul căruia îi este adresată cererea poate răspunde.');
    }
  }

  private visibleTo(user: User): Prisma.ClientTransferRequestWhereInput {
    return user.role === 'ADMIN' ? {} : { OR: [{ fromUserId: user.id }, { toUserId: user.id }] };
  }

  private async findPending(id: string, user: User): Promise<Row> {
    const row = await this.prisma.db.clientTransferRequest.findFirst({
      where: { id, status: 'PENDING', ...this.visibleTo(user) },
      include,
    });
    if (!row) throw AppException.notFound('Cererea nu există sau a fost deja rezolvată.');
    return row;
  }

  private findUser(id: string) {
    return this.prisma.db.user.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, isActive: true },
    });
  }

  private async resolve(
    id: string,
    status: 'ACCEPTED' | 'DECLINED' | 'CANCELLED',
    userId: string,
  ): Promise<void> {
    await this.prisma.db.clientTransferRequest.update({
      where: { id },
      data: { status, resolvedAt: new Date(), resolvedById: userId },
    });
  }

  private log(
    action: 'client.transfer_declined' | 'client.transfer_cancelled',
    request: Row,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    return this.activity.log({
      action,
      userId: auth.user.id,
      entityType: 'client',
      entityId: request.clientId,
      entityLabel: request.client.name,
      metadata: {
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        requestId: request.id,
      },
      ip: client.ip,
    });
  }
}
