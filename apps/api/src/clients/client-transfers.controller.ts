import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { ClientTransferRequestDto, TransferResultDto } from '@alconst/shared';
import { Client, CurrentAuth } from '../common/decorators.js';
import type { AuthContext, ClientInfo } from '../common/request-context.js';
import { ClientTransfersService } from './client-transfers.service.js';
import { TransferClientDto } from './dto/clients.dto.js';

@Controller()
export class ClientTransfersController {
  constructor(private readonly transfers: ClientTransfersService) {}

  /**
   * Predarea definitivă a unui client. Un administrator o efectuează pe loc; între colegi se
   * creează o cerere care așteaptă acordul celuilalt.
   */
  @HttpCode(HttpStatus.OK)
  @Post('clients/:id/transfer')
  request(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferClientDto,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<TransferResultDto> {
    return this.transfers.request(id, dto.fromUserId, dto.toUserId, auth, client);
  }

  @Get('client-transfers')
  listPending(@CurrentAuth() auth: AuthContext): Promise<ClientTransferRequestDto[]> {
    return this.transfers.listPending(auth);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('client-transfers/:id/accept')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.transfers.accept(id, auth, client);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('client-transfers/:id/decline')
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.transfers.decline(id, auth, client);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('client-transfers/:id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ): Promise<void> {
    return this.transfers.cancel(id, auth, client);
  }
}
