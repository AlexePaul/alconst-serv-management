import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { MAX_DOCUMENT_NAME_LENGTH } from '@alconst/shared';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;
const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Secțiunea vizată: `clientId` lipsă = secțiunea generală a firmei. */
export class SectionQuery {
  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Client invalid.' })
  clientId?: string | null;
}

export class ListDocumentsQuery extends SectionQuery {
  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Dosar invalid.' })
  folderId?: string | null;

  /** `true` = fișierele arhivate ale dosarului, în locul celor curente. */
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class SearchDocumentsQuery extends SectionQuery {
  @Transform(trimmed)
  @IsString()
  @MinLength(2, { message: 'Scrie cel puțin două caractere.' })
  @MaxLength(100)
  q: string;
}

export class CreateFolderDto extends SectionQuery {
  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Dosar invalid.' })
  parentId?: string | null;

  @Transform(trimmed)
  @IsString({ message: 'Numele este obligatoriu.' })
  @MaxLength(MAX_DOCUMENT_NAME_LENGTH)
  name: string;
}

export class UpdateFolderDto {
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DOCUMENT_NAME_LENGTH)
  name?: string;

  /** Noul dosar părinte; `null` = rădăcina secțiunii. */
  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Dosar invalid.' })
  parentId?: string | null;
}

/** Parametrii unei încărcări. Conținutul fișierului este corpul cererii. */
export class UploadFileQuery extends SectionQuery {
  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Dosar invalid.' })
  folderId?: string | null;

  @Transform(trimmed)
  @IsString({ message: 'Numele fișierului este obligatoriu.' })
  @MaxLength(MAX_DOCUMENT_NAME_LENGTH)
  name: string;
}

export class UpdateFileDto {
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DOCUMENT_NAME_LENGTH)
  name?: string;

  /** Noul dosar; `null` = rădăcina secțiunii. */
  @Transform(emptyToNull)
  @IsOptional()
  @IsUUID('all', { message: 'Dosar invalid.' })
  folderId?: string | null;

  @IsOptional()
  @IsBoolean({ message: 'Valoare invalidă.' })
  archived?: boolean;
}
