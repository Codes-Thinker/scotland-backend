import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface RideAgg {
  total: number;
  completed: number;
  cancelled: number;
  open: number;
  completed_fare: string;
  avg_wait: string | null;
}

interface DriverAgg {
  approved: number;
  online: number;
  pending_approval: number;
  avg_rating: number | null;
}

const DAY_MS = 86_400_000;
/** Business days are counted in UK time. */
const TZ = 'Europe/London';
const MAX_RANGE_DAYS = 366;

export interface Range {
  from: Date;
  to: Date;
}

export interface SummaryView {
  range: { from: string; to: string };
  rides: {
    total: number;
    completed: number;
    cancelled: number;
    open: number;
    cancellationRate: number;
    averageWaitSeconds: number | null;
  };
  revenue: {
    completedFarePence: number;
    paidPence: number;
    pendingPence: number;
    refundedPence: number;
  };
  payments: Record<'pending' | 'paid' | 'failed' | 'refunded', number>;
  drivers: {
    approved: number;
    online: number;
    pendingApproval: number;
    averageRating: number | null;
  };
  daily: { day: string; rides: number; completed: number; revenuePence: number }[];
}

@Injectable()
export class ReportsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Parses from/to (inclusive days, UTC dates). Defaults to the last 30 days. */
  range(from?: string, to?: string): Range {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 29 * DAY_MS);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('from and to must be valid dates.');
    }
    // "to" is inclusive: run to the end of that day.
    const endExclusive = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) + DAY_MS,
    );
    const startDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    if (startDay >= endExclusive) throw new BadRequestException('from must be before to.');
    if ((endExclusive.getTime() - startDay.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
      throw new BadRequestException(`The range can be at most ${MAX_RANGE_DAYS} days.`);
    }
    return { from: startDay, to: endExclusive };
  }

  async summary(r: Range): Promise<SummaryView> {
    const rideRows = await this.dataSource.query<RideAgg[]>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'completed')::int AS completed,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              count(*) FILTER (WHERE status IN ('requested','assigned','arrived','in_progress'))::int AS open,
              coalesce(sum(fare_final_pence) FILTER (WHERE status = 'completed'), 0)::bigint AS completed_fare,
              avg(EXTRACT(EPOCH FROM (assigned_at - requested_at))) FILTER (WHERE assigned_at IS NOT NULL) AS avg_wait
         FROM rides
        WHERE requested_at >= $1 AND requested_at < $2`,
      [r.from, r.to],
    );
    const rideRow = rideRows[0];
    if (!rideRow) throw new Error('ride aggregate returned no row');

    const paymentRows: { status: string; n: number; amount: string }[] =
      await this.dataSource.query(
        `SELECT p.status, count(*)::int AS n, coalesce(sum(p.amount_pence), 0)::bigint AS amount
         FROM payments p JOIN rides ri ON ri.id = p.ride_id
        WHERE ri.requested_at >= $1 AND ri.requested_at < $2
        GROUP BY p.status`,
        [r.from, r.to],
      );
    const payments = { pending: 0, paid: 0, failed: 0, refunded: 0 };
    const money = { paid: 0, pending: 0, refunded: 0 };
    for (const row of paymentRows) {
      const k = row.status as keyof typeof payments;
      payments[k] = row.n;
      if (k in money) money[k as keyof typeof money] = Number(row.amount);
    }

    const driverRows = await this.dataSource.query<DriverAgg[]>(
      `SELECT count(*) FILTER (WHERE u.status = 'active')::int AS approved,
              count(*) FILTER (WHERE p.online_status IN ('online','on_trip') AND u.status = 'active')::int AS online,
              count(*) FILTER (WHERE u.status = 'pending')::int AS pending_approval,
              avg(p.rating_avg) FILTER (WHERE p.rides_count > 0)::float AS avg_rating
         FROM driver_profiles p JOIN users u ON u.id = p.user_id`,
    );
    const driverRow = driverRows[0];
    if (!driverRow) throw new Error('driver aggregate returned no row');

    const daily: { day: string; rides: number; completed: number; revenue: string }[] =
      await this.dataSource.query(
        `SELECT to_char(requested_at AT TIME ZONE $3, 'YYYY-MM-DD') AS day,
              count(*)::int AS rides,
              count(*) FILTER (WHERE status = 'completed')::int AS completed,
              coalesce(sum(fare_final_pence) FILTER (WHERE status = 'completed'), 0)::bigint AS revenue
         FROM rides
        WHERE requested_at >= $1 AND requested_at < $2
        GROUP BY 1 ORDER BY 1`,
        [r.from, r.to, TZ],
      );

    const total = Number(rideRow.total);
    const cancelled = Number(rideRow.cancelled);
    return {
      range: { from: isoDay(r.from), to: isoDay(new Date(r.to.getTime() - DAY_MS)) },
      rides: {
        total,
        completed: Number(rideRow.completed),
        cancelled,
        open: Number(rideRow.open),
        cancellationRate: total === 0 ? 0 : Math.round((cancelled / total) * 1000) / 1000,
        averageWaitSeconds: rideRow.avg_wait === null ? null : Math.round(Number(rideRow.avg_wait)),
      },
      revenue: {
        completedFarePence: Number(rideRow.completed_fare),
        paidPence: money.paid,
        pendingPence: money.pending,
        refundedPence: money.refunded,
      },
      payments,
      drivers: {
        approved: Number(driverRow.approved),
        online: Number(driverRow.online),
        pendingApproval: Number(driverRow.pending_approval),
        averageRating:
          driverRow.avg_rating === null
            ? null
            : Math.round(Number(driverRow.avg_rating) * 100) / 100,
      },
      daily: daily.map((d) => ({
        day: d.day,
        rides: d.rides,
        completed: d.completed,
        revenuePence: Number(d.revenue),
      })),
    };
  }

  async driverEarnings(driverId: string, r: Range) {
    const rows: { day: string; trips: number; gross: string }[] = await this.dataSource.query(
      `SELECT to_char(completed_at AT TIME ZONE $4, 'YYYY-MM-DD') AS day,
              count(*)::int AS trips,
              coalesce(sum(fare_final_pence), 0)::bigint AS gross
         FROM rides
        WHERE driver_id = $1 AND status = 'completed'
          AND completed_at >= $2 AND completed_at < $3
        GROUP BY 1 ORDER BY 1`,
      [driverId, r.from, r.to, TZ],
    );
    const days = rows.map((x) => ({ day: x.day, trips: x.trips, grossPence: Number(x.gross) }));
    return {
      range: { from: isoDay(r.from), to: isoDay(new Date(r.to.getTime() - DAY_MS)) },
      trips: days.reduce((s, d) => s + d.trips, 0),
      grossPence: days.reduce((s, d) => s + d.grossPence, 0),
      // Commission and payouts are not modelled yet; figures are gross customer fares.
      days,
    };
  }

  async activity(limit: number): Promise<unknown[]> {
    return this.dataSource.query<unknown[]>(
      `SELECT a.id, a.action, a.entity, a.entity_id AS "entityId", a.payload, a.created_at AS "createdAt",
              u.name AS "actorName"
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC
        LIMIT $1`,
      [limit],
    );
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
