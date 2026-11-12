import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ClientContactDto } from '@alconst/shared';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { ContactsService } from './contacts.service.js';
import { CreateContactDto, ListContactsQuery, UpdateContactDto } from './dto/contacts.dto.js';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @Query() query: ListContactsQuery,
    @CurrentAuth() auth: AuthContext,
  ): Promise<ClientContactDto[]> {
    return this.contacts.list(query.clientId, auth);
  }

  @Post()
  create(
    @Body() dto: CreateContactDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientContactDto> {
    return this.contacts.create(dto, auth, client);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<ClientContactDto> {
    return this.contacts.update(id, dto, auth, client);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.contacts.remove(id, auth, client);
  }
}
