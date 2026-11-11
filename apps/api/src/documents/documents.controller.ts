import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  DocumentFileDto,
  DocumentFolderDto,
  DocumentListingDto,
  DocumentSearchResultDto,
  DocumentSectionDto,
  DocumentSettingsDto,
} from '@alconst/shared';
import { AppException } from '../common/app.exception.js';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { AppConfig } from '../config/app-config.js';
import { DocumentsService } from './documents.service.js';
import {
  CreateFolderDto,
  ListDocumentsQuery,
  SearchDocumentsQuery,
  SectionQuery,
  UpdateFileDto,
  UpdateFolderDto,
  UploadFileQuery,
} from './dto/documents.dto.js';

/** Numele fișierului pentru antetul `Content-Disposition`, cu variantă ASCII și variantă UTF-8. */
function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  list(
    @Query() query: ListDocumentsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<DocumentListingDto> {
    return this.documents.list(query, auth);
  }

  @Get('sections')
  sections(@CurrentAuth() auth: AuthContext): Promise<DocumentSectionDto[]> {
    return this.documents.sections(auth);
  }

  @Get('settings')
  settings(): DocumentSettingsDto {
    return { maxUploadMb: this.config.maxUploadMb };
  }

  @Get('search')
  search(
    @Query() query: SearchDocumentsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<DocumentSearchResultDto[]> {
    return this.documents.search(query.q, query.clientId, auth);
  }

  @Get('folders')
  folders(
    @Query() query: SectionQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<DocumentFolderDto[]> {
    return this.documents.folders(query.clientId ?? null, auth);
  }

  @Post('folders')
  createFolder(
    @Body() dto: CreateFolderDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<DocumentFolderDto> {
    return this.documents.createFolder(dto, auth, client);
  }

  @Patch('folders/:id')
  updateFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFolderDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<DocumentFolderDto> {
    return this.documents.updateFolder(id, dto, auth, client);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('folders/:id')
  removeFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.documents.removeFolder(id, auth, client);
  }

  /**
   * Încărcarea unui fișier. Conținutul este corpul cererii, trimis ca `application/octet-stream`;
   * numele și destinația vin în parametrii URL-ului. Formularele HTML clasice (multipart) nu sunt
   * acceptate nici aici, deci protecția CSRF a restului API-ului rămâne neschimbată.
   */
  @Post('files')
  async upload(
    @Query() query: UploadFileQuery,
    @Req() request: Request,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<DocumentFileDto> {
    if (!request.is('application/octet-stream')) {
      throw AppException.validation('Fișierul trebuie trimis ca „application/octet-stream”.');
    }
    return this.documents.upload(query, await this.readBody(request), auth, client);
  }

  /** Descărcarea trece mereu prin API: fișierele nu au URL-uri publice. */
  @Get('files/:id/download')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<StreamableFile> {
    const file = await this.documents.download(id, auth);
    // Întotdeauna ca atașament: conținutul încărcat nu este niciodată afișat în originea aplicației.
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: attachment(file.name),
      length: file.sizeBytes,
    });
  }

  @Patch('files/:id')
  updateFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFileDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<DocumentFileDto> {
    return this.documents.updateFile(id, dto, auth, client);
  }

  /** Citește corpul cererii în memorie, oprindu-se imediat ce depășește limita. */
  private async readBody(request: Request): Promise<Buffer> {
    const limit = this.documents.maxUploadBytes;
    if (Number(request.headers['content-length'] ?? 0) > limit) throw this.documents.tooLarge();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > limit) throw this.documents.tooLarge();
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
