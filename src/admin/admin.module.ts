import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversModule } from '@/drivers/drivers.module';
import { DriverDocument, DriverProfile, User } from '@/database/entities/account.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DriversModule, TypeOrmModule.forFeature([User, DriverProfile, DriverDocument])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
