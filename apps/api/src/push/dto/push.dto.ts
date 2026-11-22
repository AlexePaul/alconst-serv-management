import { Type } from 'class-transformer';
import { IsObject, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { IsOptionalText } from '../../common/dto-decorators.js';

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

export class PushKeysDto {
  @IsString({ message: 'Abonament invalid.' })
  @MaxLength(200, { message: 'Abonament invalid.' })
  @Matches(BASE64URL, { message: 'Abonament invalid.' })
  p256dh: string;

  @IsString({ message: 'Abonament invalid.' })
  @MaxLength(100, { message: 'Abonament invalid.' })
  @Matches(BASE64URL, { message: 'Abonament invalid.' })
  auth: string;
}

/** Abonamentul creat de browser (`PushSubscription.toJSON()`), plus numele dispozitivului. */
export class SubscribePushDto {
  @IsString({ message: 'Abonament invalid.' })
  @MaxLength(2000, { message: 'Abonament invalid.' })
  endpoint: string;

  @IsObject({ message: 'Abonament invalid.' })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @IsOptionalText('Numele dispozitivului', 100)
  deviceLabel?: string | null;
}

export class UnsubscribePushDto {
  @IsString({ message: 'Abonament invalid.' })
  @MaxLength(2000, { message: 'Abonament invalid.' })
  endpoint: string;
}
