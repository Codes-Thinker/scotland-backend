import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
import { RidesService, RideView } from '@/rides/rides.service';
import { AdminRidesQueryDto, AssignRideDto } from '@/rides/dto/ride.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.Admin)
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly rides: RidesService,
  ) {}

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

  @Get('drivers/:id/documents/:type/file')
  @ApiOkResponse({ description: 'The uploaded file, inline; never cached' })
  async documentFile(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(DriverDocumentType)) type: DriverDocumentType,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.admin.documentFile(actor, id, type);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.body);
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

  @Get('rides')
  @ApiOkResponse({ description: 'Paged ride list' })
  listRides(@Query() query: AdminRidesQueryDto): Promise<Paged<RideView>> {
    return this.rides.listAll(query);
  }

  @Get('dispatch/queue')
  @ApiOkResponse({ description: 'Requested rides waiting for a driver, most urgent first' })
  dispatchQueue() {
    return this.rides.dispatchQueue();
  }

  @Post('rides/:id/assign')
  @ApiOkResponse({ description: 'Driver assigned by operations' })
  assignRide(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRideDto,
  ): Promise<RideView> {
    return this.rides.assign(actor, id, dto.driverId);
  }
}
