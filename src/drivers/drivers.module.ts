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
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, DriverProfile, Vehicle, DriverDocument, DriverLocation, Block]),
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
