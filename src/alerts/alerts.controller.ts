import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID, ArrayMaxSize } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/auth.decorators';
import type { AuthUser } from '@/auth/auth.types';
import { PageQueryDto, Paged } from '@/common/pagination';
import { AlertsService, AlertView } from './alerts.service';

class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: 'Omit to mark all unread alerts read' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];
}

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('me/alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @ApiOkResponse({ description: 'Your alerts, newest first' })
  list(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto): Promise<Paged<AlertView>> {
    return this.alerts.list(user.id, query);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser() user: AuthUser,
    @Body() dto: MarkReadDto,
  ): Promise<{ updated: number }> {
    return { updated: await this.alerts.markRead(user.id, dto.ids) };
  }
}
