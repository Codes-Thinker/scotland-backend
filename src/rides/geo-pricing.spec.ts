import { haversineMeters, priceFare, estimateRoadMeters, ROAD_FACTOR } from './geo-pricing';

describe('geo and pricing', () => {
  const glenrothes = { lat: 56.1955, lng: -3.1565 };
  const kirkcaldy = { lat: 56.1165, lng: -3.159 };

  it('measures straight-line distance within a small tolerance', () => {
    const m = haversineMeters(glenrothes, kirkcaldy);
    expect(m).toBeGreaterThan(8_500);
    expect(m).toBeLessThan(9_500);
    expect(haversineMeters(glenrothes, glenrothes)).toBe(0);
  });

  it('estimates road distance as straight line times the road factor', () => {
    expect(estimateRoadMeters(glenrothes, kirkcaldy)).toBe(
      Math.round(haversineMeters(glenrothes, kirkcaldy) * ROAD_FACTOR),
    );
  });

  it('prices base plus per-mile', () => {
    const rule = {
      baseFarePence: 378,
      perMilePence: 246,
      minimumFarePence: 0,
      laterBookingSurchargeBp: 500,
    };
    expect(priceFare(rule, 0, false)).toBe(378);
    expect(priceFare(rule, 1609.344, false)).toBe(624);
  });

  it('applies the minimum fare floor', () => {
    const rule = {
      baseFarePence: 100,
      perMilePence: 0,
      minimumFarePence: 500,
      laterBookingSurchargeBp: 0,
    };
    expect(priceFare(rule, 0, false)).toBe(500);
  });

  it('adds the later-booking surcharge in basis points', () => {
    const rule = {
      baseFarePence: 1000,
      perMilePence: 0,
      minimumFarePence: 0,
      laterBookingSurchargeBp: 500,
    };
    expect(priceFare(rule, 0, true)).toBe(1050);
  });
});
