import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PageQueryDto } from '@/common/pagination';
import { AccountStatus, DriverOnlineStatus, UserRole } from '@/database/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AdminUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Matches name, email or phone' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminDriversQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: DriverOnlineStatus })
  @IsOptional()
  @IsEnum(DriverOnlineStatus)
  onlineStatus?: DriverOnlineStatus;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ example: 'Glenrothes' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  zone?: string;

  @ApiPropertyOptional({ description: 'Matches name, email, phone or plate' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: AccountStatus })
  @IsEnum(AccountStatus)
  status!: AccountStatus;
}

export class ReviewDocumentDto {
  @ApiProperty({
    enum: ['verified', 'expired', 'missing'],
    description: 'verified = approve; expired = lapsed; missing = rejected, driver must re-upload',
  })
  @IsIn(['verified', 'expired', 'missing'])
  status!: 'verified' | 'expired' | 'missing';

  @ApiPropertyOptional({ description: 'Reason, recorded in the audit log' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(0, 500)
  note?: string;
}
