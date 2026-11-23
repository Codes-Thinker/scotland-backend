import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Block,
  DriverDocument,
  DriverLocation,
  DriverProfile,
  User,
  Vehicle,
} from '@/database/entities/account.entity';
import { Ride } from '@/database/entities/ride.entity';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      DriverProfile,
      Vehicle,
      DriverDocument,
      DriverLocation,
      Block,
      Ride,
    ]),
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
