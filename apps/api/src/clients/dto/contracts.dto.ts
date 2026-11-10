import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CONTRACT_STATUSES,
  type ContractStatus,
  FEE_FREQUENCY_UNITS,
  type FeeFrequencyUnit,
} from '@alconst/shared';
import { IsDateOnly, IsOptionalDateOnly, IsOptionalText } from '../../common/dto-decorators.js';

export class ContractFeeInput {
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID('all', { message: 'Serviciu invalid.' })
  serviceId?: string | null;

  @IsOptionalText('Descrierea', 300)
  description?: string | null;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Suma trebuie să fie un număr cu cel mult două zecimale.' },
  )
  @Min(0, { message: 'Suma nu poate fi negativă.' })
  @Max(9_999_999_999, { message: 'Suma este prea mare.' })
  amount: number;

  @IsIn(FEE_FREQUENCY_UNITS, { message: 'Frecvența nu este validă.' })
  frequencyUnit: FeeFrequencyUnit;

  @IsOptional()
  @IsInt({ message: 'Intervalul trebuie să fie un număr întreg.' })
  @Min(1, { message: 'Intervalul trebuie să fie cel puțin 1.' })
  @Max(120, { message: 'Intervalul este prea mare.' })
  frequencyInterval?: number;
}

export class CreateContractDto {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;

  @IsOptionalText('Numărul contractului', 100)
  number?: string | null;

  @IsDateOnly('Data începerii')
  startDate: string;

  @IsOptionalDateOnly('Data expirării')
  endDate?: string | null;

  @IsOptional()
  @IsIn(CONTRACT_STATUSES, { message: 'Statusul nu este valid.' })
  status?: ContractStatus;

  @IsOptionalText('Observațiile', 5000)
  notes?: string | null;

  /** Tarifele contractului. La actualizare, lista trimisă o înlocuiește integral pe cea existentă. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30, { message: 'Un contract poate avea cel mult 30 de tarife.' })
  @ValidateNested({ each: true })
  @Type(() => ContractFeeInput)
  fees?: ContractFeeInput[];
}

/** Contractul nu poate fi mutat la alt client. */
export class UpdateContractDto extends PartialType(OmitType(CreateContractDto, ['clientId'])) {}

export class ListContractsQuery {
  @IsUUID('all', { message: 'Client invalid.' })
  clientId: string;
}
