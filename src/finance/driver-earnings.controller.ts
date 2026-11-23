import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';
import type { AuthUser } from '@/auth/auth.types';
import { UserRole } from '@/database/enums';
import { RangeQueryDto } from './dto/finance.dto';
import { ReportsService } from './reports.service';

@ApiTags('drivers')
@ApiBearerAuth()
@Roles(UserRole.Driver)
@Controller('drivers/me')
export class DriverEarningsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('earnings')
  @ApiOkResponse({ description: 'Completed-trip gross fares by day' })
  earnings(@CurrentUser() user: AuthUser, @Query() q: RangeQueryDto) {
    return this.reports.driverEarnings(user.id, this.reports.range(q.from, q.to));
  }
}
