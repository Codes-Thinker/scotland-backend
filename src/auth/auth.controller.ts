import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators/auth.decorators';
import {
  LoginDto,
  RefreshDto,
  RegisterDriverDto,
  RegisterPassengerDto,
  TokensResponse,
  UserResponse,
} from './dto/auth.dto';
import type { AuthUser } from './auth.types';

// Stricter limits on credential endpoints. Default 10 attempts per minute per client IP.
// Read at load time because decorators evaluate once; the test run raises it via env.
const AUTH_THROTTLE = {
  default: { limit: Number(process.env.AUTH_RATE_LIMIT_PER_MIN ?? 10), ttl: 60_000 },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register/passenger')
  @ApiCreatedResponse({ type: TokensResponse })
  @ApiConflictResponse({ description: 'Email already registered' })
  registerPassenger(@Body() dto: RegisterPassengerDto): Promise<TokensResponse> {
    return this.auth.registerPassenger(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register/driver')
  @ApiCreatedResponse({ type: TokensResponse, description: 'Driver account is pending approval' })
  @ApiConflictResponse({ description: 'Email already registered' })
  registerDriver(@Body() dto: RegisterDriverDto): Promise<TokensResponse> {
    return this.auth.registerDriver(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokensResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: LoginDto): Promise<TokensResponse> {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokensResponse })
  @ApiUnauthorizedResponse({ description: 'Refresh token invalid, expired or revoked' })
  refresh(@Body() dto: RefreshDto): Promise<TokensResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: UserResponse })
  me(@CurrentUser() user: AuthUser): Promise<UserResponse> {
    return this.auth.me(user.id);
  }
}
