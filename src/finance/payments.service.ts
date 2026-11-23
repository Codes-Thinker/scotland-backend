import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '@/audit/audit.service';
import type { AuthUser } from '@/auth/auth.types';
import { paginate, Paged } from '@/common/pagination';
import { Payment } from '@/database/entities/payment.entity';
import { PaymentStatus } from '@/database/enums';
import { PaymentsQueryDto } from './dto/finance.dto';

/** Allowed manual transitions. Anything else is refused. */
const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.Pending]: [PaymentStatus.Paid, PaymentStatus.Failed],
  [PaymentStatus.Failed]: [PaymentStatus.Paid],
  [PaymentStatus.Paid]: [PaymentStatus.Refunded],
  [PaymentStatus.Refunded]: [],
};

export interface PaymentView {
  id: string;
  reference: string;
  amountPence: number;
  status: PaymentStatus;
  method: string | null;
  createdAt: Date;
  updatedAt: Date;
  ride: {
    id: string;
    rideType: string;
    status: string;
    pickup: string;
    drop: string;
    passengerName: string;
    driverName: string | null;
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaymentsQueryDto): Promise<Paged<PaymentView>> {
    const qb = this.payments
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.ride', 'r')
      .innerJoinAndSelect('r.passenger', 'pax')
      .leftJoinAndSelect('r.driver', 'drv')
      .orderBy('p.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);

    if (q.status) qb.andWhere('p.status = :status', { status: q.status });
    if (q.q) {
      qb.andWhere('(p.reference ILIKE :term OR pax.name ILIKE :term)', { term: `%${q.q}%` });
    }
    const [rows, total] = await qb.getManyAndCount();
    return paginate(rows.map(toView), total, q);
  }

  async setStatus(actor: AuthUser, id: string, next: PaymentStatus): Promise<PaymentView> {
    const payment = await this.payments.findOne({
      where: { id },
      relations: { ride: { passenger: true, driver: true } },
    });
    if (!payment) throw new NotFoundException('Payment not found.');

    const from = payment.status;
    if (from === next) return toView(payment);
    if (!TRANSITIONS[from].includes(next)) {
      throw new ConflictException(`A ${from} payment cannot be marked ${next}.`);
    }

    payment.status = next;
    await this.payments.save(payment);
    await this.audit.record({
      actorId: actor.id,
      action: 'payment.status_changed',
      entity: 'payment',
      entityId: payment.id,
      payload: { reference: payment.reference, from, to: next },
    });
    return toView(payment);
  }
}

type PaymentWithRide = Payment & {
  ride: {
    id: string;
    rideType: string;
    status: string;
    pickupAddress: string;
    dropAddress: string;
    passenger: { name: string };
    driver?: { name: string } | null;
  };
};

export function toView(p: Payment | PaymentWithRide): PaymentView {
  const withRide = p as PaymentWithRide;
  return {
    id: p.id,
    reference: p.reference,
    amountPence: p.amountPence,
    status: p.status,
    method: p.method,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    ride: {
      id: withRide.ride.id,
      rideType: withRide.ride.rideType,
      status: withRide.ride.status,
      pickup: withRide.ride.pickupAddress,
      drop: withRide.ride.dropAddress,
      passengerName: withRide.ride.passenger.name,
      driverName: withRide.ride.driver?.name ?? null,
    },
  };
}
