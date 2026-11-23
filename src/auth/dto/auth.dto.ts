import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@/database/enums';

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class RegisterPassengerDto {
  @ApiProperty({ example: 'Ayaz Aslam' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: 'rider@example.com' })
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: '+44 7700 900123' })
  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9 ]{8,20}$/, { message: 'phone must be digits, optionally starting with +' })
  phone!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: 'Must be true' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the Terms & Privacy Policy' })
  acceptedTerms!: boolean;
}

export class RegisterDriverDto extends RegisterPassengerDto {
  @ApiProperty({ example: 'Toyota Prius' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  vehicleMakeModel!: string;

  @ApiProperty({ example: 'SF26 TAX' })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z0-9 ]{2,16}$/, { message: 'vehiclePlate must be letters, digits and spaces' })
  vehiclePlate!: string;

  @ApiProperty({ example: 'Glenrothes' })
  @Transform(trim)
  @IsString()
  @Length(2, 64)
  operatingZone!: string;

  @ApiPropertyOptional({ example: 'AYAZ123456' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 64)
  licenceNumber?: string;
}

export class LoginDto {
  @ApiProperty()
  @Transform(trimLower)
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}

export class DriverInfo {
  @ApiPropertyOptional()
  operatingZone!: string | null;

  @ApiProperty()
  onlineStatus!: string;

  @ApiProperty()
  ratingAvg!: number;

  @ApiProperty()
  ridesCount!: number;

  @ApiPropertyOptional({ type: Object, nullable: true })
  vehicle!: { makeModel: string; plate: string; category: string } | null;
}

export class UserResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  roles!: UserRole[];

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ type: DriverInfo })
  driver?: DriverInfo;
}

export class TokensResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'Access token lifetime in seconds' })
  expiresIn!: number;

  @ApiProperty({ type: () => UserResponse })
  user!: UserResponse;
}
