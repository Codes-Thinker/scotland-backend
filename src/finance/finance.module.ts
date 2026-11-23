import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingRule } from '@/database/entities/ops.entity';
import { Payment } from '@/database/entities/payment.entity';
import { DriverEarningsController } from './driver-earnings.controller';
import { FinanceController } from './finance.controller';
import { PaymentsService } from './payments.service';
import { PricingService } from './pricing.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PricingRule])],
  controllers: [FinanceController, DriverEarningsController],
  providers: [PaymentsService, PricingService, ReportsService],
  exports: [PricingService],
})
export class FinanceModule {}
