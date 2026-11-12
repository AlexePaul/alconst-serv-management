import { Injectable } from '@nestjs/common';
import type { Prisma } from '@alconst/database';
import { CONTACT_METHOD_REQUIRED, type ClientContactDto } from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AppException } from '../common/app.exception.js';
import { definedChanges } from '../common/changes.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientAccessService } from './client-access.service.js';
import type { CreateContactDto, UpdateContactDto } from './dto/contacts.dto.js';

type Row = Prisma.ClientContactGetPayload<object>;

function toDto(row: Row): ClientContactDto {
  return {
    id: row.id,
    clientId: row.clientId,
    label: row.label,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
  };
}

function assertReachable(contact: { phone?: string | null; email?: string | null }): void {
  if (!contact.phone && !contact.email)
    throw AppException.validation(CONTACT_METHOD_REQUIRED, { phone: [CONTACT_METHOD_REQUIRED] });
}

/** Persoanele de contact ale clienților, pe lângă contactul principal din fișa clientului. */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly activity: ActivityService,
  ) {}

  async list(clientId: string, auth: AuthContext): Promise<ClientContactDto[]> {
    await this.access.assertAccess(clientId, auth.user);
    const rows = await this.prisma.db.clientContact.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(
    dto: CreateContactDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ClientContactDto> {
    await this.access.assertAccess(dto.clientId, auth.user);
    assertReachable(dto);
    const row = await this.prisma.db.clientContact.create({ data: dto });
    await this.log('contact.created', row, auth, client);
    return toDto(row);
  }

  async update(
    id: string,
    dto: UpdateContactDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<ClientContactDto> {
    const existing = await this.find(id, auth);
    const changes = definedChanges(dto, existing);
    if (Object.keys(changes).length === 0) return toDto(existing);
    assertReachable({ ...existing, ...changes });
    const row = await this.prisma.db.clientContact.update({ where: { id }, data: changes });
    await this.log('contact.updated', row, auth, client);
    return toDto(row);
  }

  /** Contactele se pot șterge: nu poartă istoric, spre deosebire de clienți sau contracte. */
  async remove(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const existing = await this.find(id, auth);
    await this.prisma.db.clientContact.delete({ where: { id } });
    await this.log('contact.deleted', existing, auth, client);
  }

  private async find(id: string, auth: AuthContext): Promise<Row> {
    const row = await this.prisma.db.clientContact.findFirst({
      where: { id, client: this.access.scope(auth.user) },
    });
    if (!row) throw AppException.notFound('Persoana de contact nu există.');
    return row;
  }

  /** În jurnal rămâne doar rolul, nu și numele sau datele persoanei. */
  private log(
    action: 'contact.created' | 'contact.updated' | 'contact.deleted',
    row: Row,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    return this.activity.log({
      action,
      userId: auth.user.id,
      entityType: 'contact',
      entityId: row.id,
      entityLabel: row.label,
      metadata: { clientId: row.clientId },
      ip: client.ip,
    });
  }
}
