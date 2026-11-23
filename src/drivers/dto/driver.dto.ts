import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateDriverProfileDto {
  @ApiPropertyOptional({ example: 'Glenrothes' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 64)
  operatingZone?: string;

  @ApiPropertyOptional({ example: 'AYAZ123456' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 64)
  licenceNumber?: string;

  @ApiPropertyOptional({ example: 'Toyota Prius' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  vehicleMakeModel?: string;

  @ApiPropertyOptional({ example: 'SF26 TAX' })
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9 ]{2,16}$/, { message: 'vehiclePlate must be letters, digits and spaces' })
  vehiclePlate?: string;
}

export class SetOnlineStatusDto {
  @ApiProperty({ enum: ['online', 'offline'] })
  @IsIn(['online', 'offline'])
  status!: 'online' | 'offline';
}

export class UpdateLocationDto {
  @ApiProperty({ example: 56.1955 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: -3.1565 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 359 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(359)
  heading?: number;
}

export class CreateBlockDto {
  @ApiProperty()
  @IsUUID()
  passengerId!: string;
}

export class UploadDocumentDto {
  @ApiPropertyOptional({ description: 'Expiry date of the document, ISO 8601' })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
