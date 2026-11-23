import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';
import type { AuthUser } from '@/auth/auth.types';
import { Paged } from '@/common/pagination';
import { DriverDocumentType, UserRole } from '@/database/enums';
import { AdminService, DriverDetail, UserSummary } from './admin.service';
import {
  AdminDriversQueryDto,
  AdminUsersQueryDto,
  ReviewDocumentDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';
import { DocumentView } from '@/drivers/driver-views';
import { DriverSummary } from '@/drivers/driver-views';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.Admin)
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiOkResponse({ description: 'Paged user list' })
  listUsers(@Query() query: AdminUsersQueryDto): Promise<Paged<UserSummary>> {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id/status')
  setUserStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserSummary> {
    return this.admin.setUserStatus(actor, id, dto.status);
  }

  @Get('drivers')
  @ApiOkResponse({ description: 'Paged driver list with document progress' })
  listDrivers(@Query() query: AdminDriversQueryDto): Promise<Paged<DriverSummary>> {
    return this.admin.listDrivers(query);
  }

  @Get('drivers/:id')
  @ApiOkResponse({ description: 'Driver with all five documents' })
  getDriver(@Param('id', ParseUUIDPipe) id: string): Promise<DriverDetail> {
    return this.admin.getDriver(id);
  }

  @Patch('drivers/:id/documents/:type')
  reviewDocument(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(DriverDocumentType)) type: DriverDocumentType,
    @Body() dto: ReviewDocumentDto,
  ): Promise<DocumentView> {
    return this.admin.reviewDocument(actor, id, type, dto);
  }
}
