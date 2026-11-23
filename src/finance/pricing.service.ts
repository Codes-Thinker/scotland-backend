import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditService } from '@/audit/audit.service';
import type { AuthUser } from '@/auth/auth.types';
import { PricingRule } from '@/database/entities/ops.entity';
import type { PricingRuleDto, ReplacePricingDto } from './dto/finance.dto';

export interface PricingRuleView {
  id: string;
  rideType: string;
  baseFarePence: number;
  perMilePence: number;
  minimumFarePence: number;
  laterBookingSurchargeBp: number;
  notes: string | null;
  effectiveFrom: Date;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PricingRule) private readonly rules: Repository<PricingRule>,
    private readonly audit: AuditService,
  ) {}

  /** The rule currently in force for each ride type. */
  async active(): Promise<PricingRuleView[]> {
    const rows = await this.rules.find({ where: { active: true }, order: { rideType: 'ASC' } });
    return rows.map(toView);
  }

  /**
   * Replaces the rule for each listed ride type. Old rules are kept with active = false,
   * so past fares can always be explained.
   */
  async replace(actor: AuthUser, dto: ReplacePricingDto): Promise<PricingRuleView[]> {
    const types = dto.rules.map((r) => r.rideType);
    if (new Set(types).size !== types.length) {
      throw new BadRequestException('Each ride type may appear only once.');
    }

    await this.dataSource.transaction(async (m) => {
      await m.update(PricingRule, { rideType: In(types), active: true }, { active: false });
      await m.save(
        PricingRule,
        dto.rules.map((r: PricingRuleDto) =>
          m.create(PricingRule, {
            rideType: r.rideType,
            baseFarePence: r.baseFarePence,
            perMilePence: r.perMilePence,
            minimumFarePence: r.minimumFarePence,
            laterBookingSurchargeBp: r.laterBookingSurchargeBp,
            notes: r.notes ?? null,
            active: true,
          }),
        ),
      );
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'pricing.replaced',
      entity: 'pricing_rule',
      entityId: types.join(','),
      payload: { rules: dto.rules },
    });
    return this.active();
  }
}

function toView(r: PricingRule): PricingRuleView {
  return {
    id: r.id,
    rideType: r.rideType,
    baseFarePence: r.baseFarePence,
    perMilePence: r.perMilePence,
    minimumFarePence: r.minimumFarePence,
    laterBookingSurchargeBp: r.laterBookingSurchargeBp,
    notes: r.notes,
    effectiveFrom: r.effectiveFrom,
  };
}
