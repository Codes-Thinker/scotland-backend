import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  body!: string;
}

export class ListMessagesQueryDto {
  @ApiPropertyOptional({ description: 'Return messages sent before this ISO timestamp' })
  @IsOptional()
  @IsDateString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
