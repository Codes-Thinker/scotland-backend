import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '@/common/pagination';
import { PaymentStatus, RideType } from '@/database/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PaymentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Matches reference or passenger name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class SetPaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  status!: PaymentStatus;
}

export class PricingRuleDto {
  @ApiProperty({ enum: RideType })
  @IsEnum(RideType)
  rideType!: RideType;

  @ApiProperty({ description: 'Base fare in pence' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  baseFarePence!: number;

  @ApiProperty({ description: 'Per mile in pence' })
  @IsInt()
  @Min(0)
  @Max(100_000)
  perMilePence!: number;

  @ApiProperty({ description: 'Minimum fare in pence' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minimumFarePence!: number;

  @ApiProperty({ description: 'Later-booking surcharge in basis points (500 = 5%)' })
  @IsInt()
  @Min(0)
  @Max(5000)
  laterBookingSurchargeBp!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class ReplacePricingDto {
  @ApiProperty({
    type: [PricingRuleDto],
    description: 'Rule per ride type; types not listed are unchanged',
  })
  @ValidateNested({ each: true })
  @Type(() => PricingRuleDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  rules!: PricingRuleDto[];
}

export class RangeQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ActivityQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
