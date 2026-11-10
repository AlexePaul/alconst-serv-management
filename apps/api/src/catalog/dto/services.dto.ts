import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { IsOptionalText, IsTrimmedText } from '../../common/dto-decorators.js';

export class CreateServiceDto {
  @IsTrimmedText('Denumirea', 150)
  name: string;

  @IsOptionalText('Descrierea', 1000)
  description?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'Statusul nu este valid.' })
  isActive?: boolean;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}
