// Shared career balance. Prices are the cost of the next level, not totals.
export const FUEL_RANGE_LEVELS = Object.freeze([300, 380, 470, 600, 750, 850, 1050, 1600, 2100, 2900, 4700]);

export const STANDARD_VEHICLE_BALANCE = Object.freeze({
  maxSpeed: 100 / 3.6,
  acceleration: 11 / 1.8,
  capacity: 100,
  range: FUEL_RANGE_LEVELS[0],
  handling: .5,
  grip: .5,
});

export const UPGRADE_PRICE_TABLES = Object.freeze({
  speed: Object.freeze([200, 300, 450, 600, 800, 1050, 1400, 1800, 2350, 3050]),
  handling: Object.freeze([150, 200, 300, 400, 550, 700, 950, 1200, 1550, 2000]),
  grip: Object.freeze([150, 250, 350, 500, 650, 900, 1150, 1500, 1950, 2600]),
  fuel: Object.freeze([300, 500, 700, 1000, 1300, 1700, 2200, 2800, 3400, 4100]),
});

export const UPGRADE_GAINS = Object.freeze({speed: .05, handling: .05, grip: .04});

export const TYRE_CONFIG = Object.freeze([
  {tier: 0, id: 'city', name: 'Городские', price: 0},
  {tier: 1, id: 'forest', name: 'Лесные', price: 1000},
  {tier: 2, id: 'desert', name: 'Пустынные', price: 4500},
  {tier: 3, id: 'snow', name: 'Зимние', price: 12000},
  {tier: 4, id: 'volcanic', name: 'Вулканические', price: 21000},
].map(Object.freeze));

export const ADVERTISING_INTERVAL_SECONDS = 120;
