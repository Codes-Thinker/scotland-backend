import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '@/common/pagination';
import { BookingMode, RideStatus, RideType, VehicleCategory } from '@/database/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PlaceDto {
  @ApiProperty({ example: 'Riverside Park, Glenrothes' })
  @Transform(trim)
  @IsString()
  @Length(3, 255)
  address!: string;

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
}

export class EstimateRideDto {
  @ApiProperty({ type: PlaceDto })
  @ValidateNested()
  @Type(() => PlaceDto)
  pickup!: PlaceDto;

  @ApiProperty({ type: PlaceDto })
  @ValidateNested()
  @Type(() => PlaceDto)
  drop!: PlaceDto;

  @ApiProperty({ enum: RideType })
  @IsEnum(RideType)
  rideType!: RideType;

  @ApiPropertyOptional({ enum: BookingMode, default: BookingMode.Now })
  @IsOptional()
  @IsEnum(BookingMode)
  bookingMode?: BookingMode;

  @ApiPropertyOptional({ enum: VehicleCategory, default: VehicleCategory.FourSeater })
  @IsOptional()
  @IsEnum(VehicleCategory)
  vehicleCategory?: VehicleCategory;

  @ApiPropertyOptional({ description: 'Required when bookingMode is later' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class CreateRideDto extends EstimateRideDto {}

export class CancelRideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class CompleteRideDto {
  @ApiPropertyOptional({ description: 'Actual distance driven, metres. Used for the final fare.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500_000)
  distanceM?: number;
}

export class RateRideDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class AssignRideDto {
  @ApiProperty()
  @IsUUID()
  driverId!: string;
}

export class ListRidesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['passenger', 'driver'], default: 'passenger' })
  @IsOptional()
  @IsIn(['passenger', 'driver'])
  role?: 'passenger' | 'driver';

  @ApiPropertyOptional({ enum: RideStatus })
  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;
}

export class AdminRidesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: RideStatus })
  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;

  @ApiPropertyOptional({ description: 'Matches passenger name or pickup/drop address' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}
