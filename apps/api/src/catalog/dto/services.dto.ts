import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean } from 'class-validator';
import {
  IsOptionalText,
  IsTrimmedText,
  NULL_IS_A_VALUE,
  IsOptionalNotNull,
} from '../../common/dto-decorators.js';

export class CreateServiceDto {
  @IsTrimmedText('Denumirea', 150)
  name: string;

  @IsOptionalText('Descrierea', 1000)
  description?: string | null;

  @IsOptionalNotNull()
  @IsBoolean({ message: 'Statusul nu este valid.' })
  isActive?: boolean;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto, NULL_IS_A_VALUE) {}
