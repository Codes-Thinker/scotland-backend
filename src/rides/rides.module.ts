import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Block,
  DriverDocument,
  DriverLocation,
  DriverProfile,
} from '@/database/entities/account.entity';
import { PricingRule } from '@/database/entities/ops.entity';
import { Payment } from '@/database/entities/payment.entity';
import { Ride, RideOffer, RideRating } from '@/database/entities/ride.entity';
import { AlertsModule } from '@/alerts/alerts.module';
import { DispatchService } from './dispatch.service';
import { DriverOffersController, RidesController } from './rides.controller';
import { RidesService } from './rides.service';

@Module({
  imports: [
    AlertsModule,
    TypeOrmModule.forFeature([
      Ride,
      RideOffer,
      RideRating,
      Payment,
      PricingRule,
      DriverProfile,
      DriverLocation,
      DriverDocument,
      Block,
    ]),
  ],
  controllers: [RidesController, DriverOffersController],
  providers: [RidesService, DispatchService],
  exports: [RidesService, DispatchService],
})
export class RidesModule {}
