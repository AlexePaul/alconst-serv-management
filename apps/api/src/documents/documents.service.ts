import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Prisma, User } from '@alconst/database';
import {
  API_ERROR_CODES,
  DOCUMENT_TYPES,
  type DocumentFileDto,
  type DocumentFolderDto,
  type DocumentListingDto,
  documentNameError,
  type DocumentSearchResultDto,
  type DocumentSectionDto,
  fileExtension,
  normalizeSearch,
} from '@alconst/shared';
import { ActivityService } from '../activity/activity.service.js';
import { ClientAccessService } from '../clients/client-access.service.js';
import { AppException } from '../common/app.exception.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateFolderDto,
  ListDocumentsQuery,
  UpdateFileDto,
  UpdateFolderDto,
  UploadFileQuery,
} from './dto/documents.dto.js';
import { contentMatchesExtension } from './file-content.js';
import { FILE_STORAGE, type FileStorage } from './file-storage.js';

export const GENERAL_SECTION_NAME = 'Documente generale';
const MAX_FOLDER_DEPTH = 20;
const SEARCH_LIMIT = 50;

const fileInclude = {
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DocumentFileInclude;
type FileRow = Prisma.DocumentFileGetPayload<{ include: typeof fileInclude }>;

const folderInclude = {
  _count: { select: { children: true, files: { where: { archivedAt: null } } } },
} satisfies Prisma.DocumentFolderInclude;
type FolderRow = Prisma.DocumentFolderGetPayload<{ include: typeof folderInclude }>;

function toFileDto(row: FileRow): DocumentFileDto {
  return {
    id: row.id,
    clientId: row.clientId,
    folderId: row.folderId,
    name: row.name,
    extension: row.extension,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function toFolderDto(row: FolderRow): DocumentFolderDto {
  return {
    id: row.id,
    clientId: row.clientId,
    parentId: row.parentId,
    name: row.name,
    itemCount: row._count.children + row._count.files,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Secțiunea de documente: fișiere încărcate, organizate pe dosare.
 *
 * Fiecare client are propria secțiune, cu aceleași reguli de acces ca restul datelor lui
 * (administratorii văd tot, un angajat doar clienții la care este responsabil). Secțiunea
 * generală a firmei este vizibilă tuturor utilizatorilor. Dosarele și fișierele nu pot fi mutate
 * dintr-o secțiune în alta. Fișierele nu se șterg: se arhivează și pot fi restaurate.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly clients: ClientAccessService,
    private readonly activity: ActivityService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Secțiunile vizibile utilizatorului: cea generală și câte una pentru fiecare client al lui. */
  async sections(auth: AuthContext): Promise<DocumentSectionDto[]> {
    const [clients, counts] = await Promise.all([
      this.prisma.db.client.findMany({
        where: this.clients.scope(auth.user),
        select: { id: true, name: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.db.documentFile.groupBy({
        by: ['clientId'],
        where: { archivedAt: null, ...this.visible(auth.user) },
        _count: { _all: true },
      }),
    ]);
    const countOf = (clientId: string | null) =>
      counts.find((entry) => entry.clientId === clientId)?._count._all ?? 0;
    return [
      { clientId: null, name: GENERAL_SECTION_NAME, isActive: true, fileCount: countOf(null) },
      ...clients.map((client) => ({
        clientId: client.id,
        name: client.name,
        isActive: client.isActive,
        fileCount: countOf(client.id),
      })),
    ];
  }

  /** Conținutul unui dosar sau al rădăcinii unei secțiuni. */
  async list(query: ListDocumentsQuery, auth: AuthContext): Promise<DocumentListingDto> {
    const folder = query.folderId ? await this.findFolder(query.folderId, auth.user) : null;
    const clientId = folder ? folder.clientId : (query.clientId ?? null);
    const section = await this.section(clientId, auth.user);
    const here = { clientId, folderId: folder?.id ?? null };

    const [folders, files, archivedCount, fileCount] = await Promise.all([
      this.prisma.db.documentFolder.findMany({
        where: { clientId, parentId: folder?.id ?? null },
        include: folderInclude,
        orderBy: { name: 'asc' },
      }),
      this.prisma.db.documentFile.findMany({
        where: { ...here, archivedAt: query.archived ? { not: null } : null },
        include: fileInclude,
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.db.documentFile.count({ where: { ...here, archivedAt: { not: null } } }),
      this.prisma.db.documentFile.count({ where: { clientId, archivedAt: null } }),
    ]);

    return {
      section: { ...section, fileCount },
      breadcrumbs: folder ? await this.pathTo(folder.id) : [],
      folders: folders.map(toFolderDto),
      files: files.map(toFileDto),
      archivedCount,
    };
  }

  /** Toate dosarele unei secțiuni, pentru alegerea destinației la mutare. */
  async folders(clientId: string | null, auth: AuthContext): Promise<DocumentFolderDto[]> {
    await this.section(clientId, auth.user);
    const rows = await this.prisma.db.documentFolder.findMany({
      where: { clientId },
      include: folderInclude,
      orderBy: { name: 'asc' },
    });
    return rows.map(toFolderDto);
  }

  /** Caută fișiere după nume, în secțiunile vizibile utilizatorului (sau într-una anume). */
  async search(
    q: string,
    clientId: string | null | undefined,
    auth: AuthContext,
  ): Promise<DocumentSearchResultDto[]> {
    if (clientId) await this.clients.assertAccess(clientId, auth.user);
    const rows = await this.prisma.db.documentFile.findMany({
      where: {
        archivedAt: null,
        searchText: { contains: normalizeSearch(q) },
        ...(clientId ? { clientId } : this.visible(auth.user)),
      },
      include: { ...fileInclude, client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_LIMIT,
    });
    const clientIds = [...new Set(rows.flatMap((row) => (row.clientId ? [row.clientId] : [])))];
    const folders = await this.prisma.db.documentFolder.findMany({
      where: { OR: [{ clientId: { in: clientIds } }, { clientId: null }] },
      select: { id: true, parentId: true, name: true },
    });
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const pathOf = (folderId: string | null): string[] => {
      const names: string[] = [];
      for (let id = folderId, depth = 0; id && depth <= MAX_FOLDER_DEPTH; depth++) {
        const folder = byId.get(id);
        if (!folder) break;
        names.unshift(folder.name);
        id = folder.parentId;
      }
      return names;
    };
    return rows.map((row) => ({
      ...toFileDto(row),
      sectionName: row.client?.name ?? GENERAL_SECTION_NAME,
      path: pathOf(row.folderId),
    }));
  }

  // --- Dosare ----------------------------------------------------------------------------------

  async createFolder(
    dto: CreateFolderDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<DocumentFolderDto> {
    const parent = dto.parentId ? await this.findFolder(dto.parentId, auth.user) : null;
    const clientId = parent ? parent.clientId : (dto.clientId ?? null);
    await this.section(clientId, auth.user);
    this.assertName(dto.name);
    if (parent && (await this.pathTo(parent.id)).length >= MAX_FOLDER_DEPTH) {
      throw AppException.validation('Dosarele sunt imbricate pe prea multe niveluri.');
    }
    await this.assertFolderNameFree(clientId, parent?.id ?? null, dto.name);

    const row = await this.prisma.db.documentFolder.create({
      data: { clientId, parentId: parent?.id ?? null, name: dto.name, createdById: auth.user.id },
      include: folderInclude,
    });
    await this.log('document.folder_created', 'document_folder', row, auth, client);
    return toFolderDto(row);
  }

  async updateFolder(
    id: string,
    dto: UpdateFolderDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<DocumentFolderDto> {
    const folder = await this.findFolder(id, auth.user);
    const name = dto.name ?? folder.name;
    const parentId = dto.parentId !== undefined ? dto.parentId : folder.parentId;
    if (dto.name !== undefined) this.assertName(dto.name);

    if (parentId !== folder.parentId && parentId) {
      const parent = await this.findFolder(parentId, auth.user);
      if (parent.clientId !== folder.clientId) {
        throw AppException.validation('Un dosar nu poate fi mutat în secțiunea altui client.');
      }
      // Un dosar nu poate ajunge în el însuși sau într-unul dintre dosarele din interiorul lui.
      const path = await this.pathTo(parent.id);
      if (path.some((entry) => entry.id === folder.id)) {
        throw AppException.validation('Un dosar nu poate fi mutat în interiorul lui însuși.');
      }
      if (path.length >= MAX_FOLDER_DEPTH) {
        throw AppException.validation('Dosarele sunt imbricate pe prea multe niveluri.');
      }
    }
    if (name !== folder.name || parentId !== folder.parentId) {
      await this.assertFolderNameFree(folder.clientId, parentId, name, folder.id);
    } else {
      return toFolderDto(folder);
    }

    const row = await this.prisma.db.documentFolder.update({
      where: { id },
      data: { name, parentId },
      include: folderInclude,
    });
    await this.log('document.folder_updated', 'document_folder', row, auth, client);
    return toFolderDto(row);
  }

  /** Doar un dosar complet gol poate fi șters: nu conține nimic de păstrat. */
  async removeFolder(id: string, auth: AuthContext, client: ClientInfo): Promise<void> {
    const folder = await this.findFolder(id, auth.user);
    const [children, files] = await Promise.all([
      this.prisma.db.documentFolder.count({ where: { parentId: id } }),
      this.prisma.db.documentFile.count({ where: { folderId: id } }),
    ]);
    if (children > 0 || files > 0) {
      throw AppException.conflict(
        'Dosarul nu este gol. Mută mai întâi dosarele și fișierele din el (inclusiv cele arhivate).',
      );
    }
    await this.prisma.db.documentFolder.delete({ where: { id } });
    await this.log('document.folder_deleted', 'document_folder', folder, auth, client);
  }

  // --- Fișiere ---------------------------------------------------------------------------------

  /**
   * Salvează un fișier încărcat. Înainte de a fi păstrat se verifică: accesul la secțiune, numele,
   * tipul acceptat, dimensiunea și faptul că primii octeți corespund tipului anunțat de extensie.
   */
  async upload(
    query: UploadFileQuery,
    content: Buffer,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<DocumentFileDto> {
    const folder = query.folderId ? await this.findFolder(query.folderId, auth.user) : null;
    const clientId = folder ? folder.clientId : (query.clientId ?? null);
    await this.section(clientId, auth.user);

    this.assertName(query.name);
    const extension = fileExtension(query.name);
    const contentType = DOCUMENT_TYPES[extension];
    if (!contentType) {
      throw AppException.validation(
        `Tipul fișierului nu este acceptat. Se pot încărca: ${Object.keys(DOCUMENT_TYPES).join(', ')}.`,
      );
    }
    if (content.length === 0) throw AppException.validation('Fișierul este gol.');
    if (content.length > this.maxUploadBytes) throw this.tooLarge();
    if (!contentMatchesExtension(extension, content)) {
      throw AppException.validation(
        `Conținutul fișierului nu corespunde extensiei „.${extension}”. Verifică fișierul și încearcă din nou.`,
      );
    }

    // Cheia de stocare nu conține nimic din numele fișierului.
    const storageKey = `${clientId ?? 'general'}/${randomUUID()}`;
    await this.storage.put(storageKey, content, contentType);
    const row = await this.prisma.db.documentFile.create({
      data: {
        clientId,
        folderId: folder?.id ?? null,
        name: query.name,
        extension,
        sizeBytes: content.length,
        checksum: createHash('sha256').update(content).digest('hex'),
        storageKey,
        searchText: normalizeSearch(query.name),
        uploadedById: auth.user.id,
      },
      include: fileInclude,
    });
    await this.log('document.uploaded', 'document', row, auth, client);
    return toFileDto(row);
  }

  /** Deschide un fișier pentru descărcare, după verificarea accesului. */
  async download(
    id: string,
    auth: AuthContext,
  ): Promise<{ name: string; contentType: string; sizeBytes: number; stream: Readable }> {
    const file = await this.findFile(id, auth.user);
    let stream: Readable;
    try {
      stream = await this.storage.open(file.storageKey);
    } catch {
      throw AppException.notFound('Conținutul fișierului nu a fost găsit în spațiul de stocare.');
    }
    return {
      name: file.name,
      contentType: DOCUMENT_TYPES[file.extension] ?? 'application/octet-stream',
      sizeBytes: file.sizeBytes,
      stream,
    };
  }

  async updateFile(
    id: string,
    dto: UpdateFileDto,
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<DocumentFileDto> {
    const file = await this.findFile(id, auth.user);
    const data: Prisma.DocumentFileUncheckedUpdateInput = {};

    if (dto.name !== undefined && dto.name !== file.name) {
      this.assertName(dto.name);
      if (fileExtension(dto.name) !== file.extension) {
        throw AppException.validation(
          `Extensia „.${file.extension}” nu poate fi schimbată la redenumire.`,
        );
      }
      data.name = dto.name;
      data.searchText = normalizeSearch(dto.name);
    }
    if (dto.folderId !== undefined && dto.folderId !== file.folderId) {
      if (dto.folderId) {
        const folder = await this.findFolder(dto.folderId, auth.user);
        if (folder.clientId !== file.clientId) {
          throw AppException.validation('Un fișier nu poate fi mutat în secțiunea altui client.');
        }
      }
      data.folderId = dto.folderId;
    }
    const moved = Object.keys(data).length > 0;
    const archiving = dto.archived !== undefined && dto.archived !== (file.archivedAt !== null);
    if (archiving) {
      data.archivedAt = dto.archived ? new Date() : null;
      data.archivedById = dto.archived ? auth.user.id : null;
    }
    if (!moved && !archiving) return toFileDto(file);

    const row = await this.prisma.db.documentFile.update({
      where: { id },
      data,
      include: fileInclude,
    });
    if (moved) await this.log('document.updated', 'document', row, auth, client);
    if (archiving) {
      const action = dto.archived ? 'document.archived' : 'document.restored';
      await this.log(action, 'document', row, auth, client);
    }
    return toFileDto(row);
  }

  get maxUploadBytes(): number {
    return this.config.maxUploadMb * 1024 * 1024;
  }

  tooLarge(): AppException {
    return new AppException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      API_ERROR_CODES.VALIDATION_FAILED,
      `Fișierul este prea mare. Dimensiunea maximă este ${this.config.maxUploadMb} MB.`,
    );
  }

  // --- Acces și utilitare ----------------------------------------------------------------------

  /** Verifică accesul la o secțiune și întoarce descrierea ei. */
  private async section(clientId: string | null, user: User): Promise<DocumentSectionDto> {
    if (clientId === null) {
      return { clientId: null, name: GENERAL_SECTION_NAME, isActive: true, fileCount: 0 };
    }
    const client = await this.prisma.db.client.findFirst({
      where: { id: clientId, ...this.clients.scope(user) },
      select: { id: true, name: true, isActive: true },
    });
    if (!client) throw AppException.notFound('Clientul nu există.');
    return { clientId: client.id, name: client.name, isActive: client.isActive, fileCount: 0 };
  }

  /**
   * Restrânge o interogare la secțiunile vizibile utilizatorului: administratorii văd tot, un
   * angajat vede secțiunea generală și secțiunile clienților lui. Dosarele și fișierele celorlalți
   * clienți „nu există” pentru el, la fel ca restul datelor lor.
   */
  private visible(user: User): { OR?: [{ clientId: null }, { client: Prisma.ClientWhereInput }] } {
    if (user.role === 'ADMIN') return {};
    return { OR: [{ clientId: null }, { client: this.clients.scope(user) }] };
  }

  private async findFolder(id: string, user: User): Promise<FolderRow> {
    const row = await this.prisma.db.documentFolder.findFirst({
      where: { id, ...this.visible(user) },
      include: folderInclude,
    });
    if (!row) throw AppException.notFound('Dosarul nu există.');
    return row;
  }

  private async findFile(id: string, user: User): Promise<FileRow & { storageKey: string }> {
    const row = await this.prisma.db.documentFile.findFirst({
      where: { id, ...this.visible(user) },
      include: fileInclude,
    });
    if (!row) throw AppException.notFound('Fișierul nu există.');
    return row;
  }

  /** Drumul de la rădăcina secțiunii până la dosar (inclusiv). */
  private async pathTo(folderId: string): Promise<{ id: string; name: string }[]> {
    const path: { id: string; name: string }[] = [];
    for (let id: string | null = folderId, depth = 0; id && depth <= MAX_FOLDER_DEPTH; depth++) {
      const folder: { id: string; name: string; parentId: string | null } | null =
        await this.prisma.db.documentFolder.findUnique({
          where: { id },
          select: { id: true, name: true, parentId: true },
        });
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name });
      id = folder.parentId;
    }
    return path;
  }

  private assertName(name: string): void {
    const error = documentNameError(name);
    if (error) throw AppException.validation(error, { name: [error] });
  }

  /** Două dosare din același loc nu pot avea același nume (fără a ține cont de majuscule sau diacritice). */
  private async assertFolderNameFree(
    clientId: string | null,
    parentId: string | null,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const siblings = await this.prisma.db.documentFolder.findMany({
      where: { clientId, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { name: true },
    });
    const wanted = normalizeSearch(name);
    if (siblings.some((sibling) => normalizeSearch(sibling.name) === wanted)) {
      const message = 'Există deja un dosar cu acest nume aici.';
      throw AppException.conflict(message, { name: [message] });
    }
  }

  private log(
    action:
      | 'document.uploaded'
      | 'document.updated'
      | 'document.archived'
      | 'document.restored'
      | 'document.folder_created'
      | 'document.folder_updated'
      | 'document.folder_deleted',
    entityType: 'document' | 'document_folder',
    row: { id: string; name: string; clientId: string | null },
    auth: AuthContext,
    client: ClientInfo,
  ): Promise<void> {
    return this.activity.log({
      action,
      userId: auth.user.id,
      entityType,
      entityId: row.id,
      entityLabel: row.name,
      metadata: { clientId: row.clientId },
      ip: client.ip,
    });
  }
}
