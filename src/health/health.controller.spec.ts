import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const makeRes = () => {
    const res: { status: (code: number) => unknown } = { status: vi.fn() };
    return res;
  };

  it('reports ok when the database answers', async () => {
    const dataSource = { query: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();
    const controller = moduleRef.get(HealthController);

    const result = await controller.check(makeRes() as never);

    expect(result.status).toBe('ok');
    expect(result.database).toBe('up');
  });

  it('reports 503 when the database is down', async () => {
    const dataSource = { query: vi.fn().mockRejectedValue(new Error('down')) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();
    const controller = moduleRef.get(HealthController);
    const res = makeRes();

    const result = await controller.check(res as never);

    expect(result.status).toBe('error');
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
