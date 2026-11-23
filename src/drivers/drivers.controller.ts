import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Roles } from '@/auth/decorators/auth.decorators';
import { CurrentUser } from '@/auth/decorators/auth.decorators';
import type { AuthUser } from '@/auth/auth.types';
import { DriverDocumentType, UserRole } from '@/database/enums';
import { DriversService } from './drivers.service';
import {
  CreateBlockDto,
  SetOnlineStatusDto,
  UpdateDriverProfileDto,
  UpdateLocationDto,
  UploadDocumentDto,
} from './dto/driver.dto';

// Multer holds the file in memory; DriversService enforces the configured size limit.
// 25 MB is the hard ceiling allowed by configuration.
const HARD_UPLOAD_CAP = 25 * 1024 * 1024;

@ApiTags('drivers')
@ApiBearerAuth()
@Roles(UserRole.Driver)
@ApiForbiddenResponse({ description: 'Only drivers can use these endpoints' })
@Controller('drivers/me')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @ApiOkResponse({ description: 'Driver profile, vehicle and status' })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.drivers.getProfile(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateDriverProfileDto) {
    return this.drivers.updateProfile(user.id, dto);
  }

  @Put('status')
  @ApiOkResponse({ description: 'Driver is now online or offline' })
  setStatus(@CurrentUser() user: AuthUser, @Body() dto: SetOnlineStatusDto) {
    return this.drivers.setOnlineStatus(user.id, dto);
  }

  @Post('location')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Position stored' })
  async updateLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLocationDto,
  ): Promise<void> {
    await this.drivers.updateLocation(user.id, dto);
  }

  @Get('documents')
  listDocuments(@CurrentUser() user: AuthUser) {
    return this.drivers.listDocuments(user.id);
  }

  @Post('documents/:type')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: HARD_UPLOAD_CAP } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF, JPEG or PNG' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Document stored and set to pending review' })
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(DriverDocumentType)) type: DriverDocumentType,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadDocumentDto,
  ) {
    return this.drivers.uploadDocument(user.id, type, file, body.expiresAt);
  }

  @Get('blocks')
  listBlocks(@CurrentUser() user: AuthUser) {
    return this.drivers.listBlocks(user.id);
  }

  @Post('blocks')
  @ApiCreatedResponse({ description: 'Passenger blocked' })
  block(@CurrentUser() user: AuthUser, @Body() dto: CreateBlockDto) {
    return this.drivers.block(user.id, dto);
  }

  @Delete('blocks/:passengerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOkResponse({ description: 'Passenger unblocked (no-op if not blocked)' })
  async unblock(
    @CurrentUser() user: AuthUser,
    @Param('passengerId') passengerId: string,
  ): Promise<void> {
    await this.drivers.unblock(user.id, passengerId);
  }
}
