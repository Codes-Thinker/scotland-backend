import { RideType } from '@/database/enums';

const EARTH_RADIUS_M = 6_371_000;

/** Road distance is longer than the straight line. Used until real routing (D6) is wired in. */
export const ROAD_FACTOR = 1.3;

export interface Point {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres between two points. */
export function haversineMeters(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated road distance in metres. */
export function estimateRoadMeters(a: Point, b: Point): number {
  return Math.round(haversineMeters(a, b) * ROAD_FACTOR);
}

export interface PriceRule {
  baseFarePence: number;
  perMilePence: number;
  minimumFarePence: number;
  laterBookingSurchargeBp: number;
}

/**
 * Fare in pence: base + per-mile, floored at the minimum, then the later-booking
 * surcharge (basis points). Rounded to the nearest penny.
 */
export function priceFare(rule: PriceRule, distanceM: number, bookingLater: boolean): number {
  const miles = distanceM / 1609.344;
  let fare = rule.baseFarePence + rule.perMilePence * miles;
  fare = Math.max(fare, rule.minimumFarePence);
  if (bookingLater) fare = fare * (1 + rule.laterBookingSurchargeBp / 10_000);
  return Math.round(fare);
}

export function isRideTypePriced(t: RideType): boolean {
  return Object.values(RideType).includes(t);
}
