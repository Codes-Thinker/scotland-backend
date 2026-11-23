import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';
import type { AuthUser } from '@/auth/auth.types';
import { Paged } from '@/common/pagination';
import { UserRole } from '@/database/enums';
import {
  ActivityQueryDto,
  PaymentsQueryDto,
  RangeQueryDto,
  ReplacePricingDto,
  SetPaymentStatusDto,
} from './dto/finance.dto';
import { PaymentsService, PaymentView } from './payments.service';
import { PricingRuleView, PricingService } from './pricing.service';
import { ReportsService, SummaryView } from './reports.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.Admin)
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('admin')
export class FinanceController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly pricing: PricingService,
    private readonly reports: ReportsService,
  ) {}

  @Get('payments')
  @ApiOkResponse({ description: 'Paged payments with ride context' })
  listPayments(@Query() query: PaymentsQueryDto): Promise<Paged<PaymentView>> {
    return this.payments.list(query);
  }

  @Patch('payments/:id/status')
  setPaymentStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPaymentStatusDto,
  ): Promise<PaymentView> {
    return this.payments.setStatus(actor, id, dto.status);
  }

  @Get('pricing')
  @ApiOkResponse({ description: 'Rules in force, one per ride type' })
  getPricing(): Promise<PricingRuleView[]> {
    return this.pricing.active();
  }

  @Put('pricing')
  @ApiOkResponse({ description: 'Rules replaced; previous rules kept in history' })
  replacePricing(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ReplacePricingDto,
  ): Promise<PricingRuleView[]> {
    return this.pricing.replace(actor, dto);
  }

  @Get('reports/summary')
  @ApiOkResponse({ description: 'Rides, revenue, payments, drivers and a daily breakdown' })
  async summary(@Query() q: RangeQueryDto): Promise<SummaryView> {
    return this.reports.summary(this.reports.range(q.from, q.to));
  }

  @Get('activity')
  @ApiOkResponse({ description: 'Most recent admin actions' })
  activity(@Query() q: ActivityQueryDto) {
    return this.reports.activity(q.limit ?? 20);
  }
}
