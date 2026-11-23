import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOkResponse({ description: 'API and database are reachable' })
  @ApiServiceUnavailableResponse({ description: 'Database is unreachable' })
  async check(@Res({ passthrough: true }) res: Response) {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        database: 'up',
        latencyMs: Date.now() - startedAt,
        uptimeSec: Math.round(process.uptime()),
      };
    } catch {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', database: 'down', uptimeSec: Math.round(process.uptime()) };
    }
  }
}
