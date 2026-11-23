import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@/auth/decorators/auth.decorators';
import type { AuthUser } from '@/auth/auth.types';
import { Paged } from '@/common/pagination';
import { UserRole } from '@/database/enums';
import { RidesService, EstimateView, OfferView, RideView } from './rides.service';
import {
  CancelRideDto,
  CompleteRideDto,
  CreateRideDto,
  EstimateRideDto,
  ListRidesQueryDto,
  RateRideDto,
} from './dto/ride.dto';

@ApiTags('rides')
@ApiBearerAuth()
@ApiNotFoundResponse({ description: 'Ride not found, or not yours' })
@Controller('rides')
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  // ---- passenger ----

  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.Passenger)
  @ApiOkResponse({ description: 'Fare estimate for a route' })
  estimate(@Body() dto: EstimateRideDto): Promise<EstimateView> {
    return this.rides.estimate(dto);
  }

  @Post()
  @Roles(UserRole.Passenger)
  @ApiCreatedResponse({ description: 'Ride requested; offers sent to nearby drivers' })
  @ApiConflictResponse({ description: 'Already has an active ride, or no pricing for this type' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRideDto): Promise<RideView> {
    return this.rides.create(user, dto);
  }

  @Get()
  @ApiOkResponse({ description: 'Your rides, as passenger (default) or driver' })
  @ApiForbiddenResponse({ description: 'role=driver needs a driver account' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListRidesQueryDto): Promise<Paged<RideView>> {
    return this.rides.listForUser(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RideView> {
    return this.rides.getForUser(user, id);
  }

  @Post(':id/cancel')
  @ApiOkResponse({ description: 'Ride cancelled' })
  @ApiConflictResponse({ description: 'Ride can no longer be cancelled' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRideDto,
  ): Promise<RideView> {
    return this.rides.cancel(user, id, dto);
  }

  @Post(':id/rating')
  @Roles(UserRole.Passenger)
  @ApiOkResponse({ description: 'Driver rated; average updated' })
  rate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateRideDto,
  ): Promise<RideView> {
    return this.rides.rate(user, id, dto);
  }

  // ---- driver ----

  @Post(':id/accept')
  @Roles(UserRole.Driver)
  @ApiOkResponse({ description: 'Offer accepted; you are assigned' })
  @ApiConflictResponse({ description: 'Ride taken, offer expired, or you are not online' })
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RideView> {
    return this.rides.accept(user, id);
  }

  @Post(':id/reject')
  @Roles(UserRole.Driver)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.rides.reject(user, id);
  }

  @Post(':id/arrive')
  @Roles(UserRole.Driver)
  arrive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RideView> {
    return this.rides.arrive(user, id);
  }

  @Post(':id/start')
  @Roles(UserRole.Driver)
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RideView> {
    return this.rides.start(user, id);
  }

  @Post(':id/complete')
  @Roles(UserRole.Driver)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteRideDto,
  ): Promise<RideView> {
    return this.rides.complete(user, id, dto);
  }
}

@ApiTags('drivers')
@ApiBearerAuth()
@Roles(UserRole.Driver)
@Controller('drivers/me')
export class DriverOffersController {
  constructor(private readonly rides: RidesService) {}

  @Get('offers')
  @ApiOkResponse({ description: 'Open ride offers, newest last' })
  offers(@CurrentUser() user: AuthUser): Promise<OfferView[]> {
    return this.rides.offersFor(user);
  }
}
