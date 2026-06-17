export const calculateTax = (taxExcludedYen: number): number => Math.round(taxExcludedYen * 0.1);

export const calculateTaxIncluded = (taxExcludedYen: number): number =>
  taxExcludedYen + calculateTax(taxExcludedYen);

export const calculateTimedReward = (minutes: number, hourlyRateYen: number): number => {
  return Math.round((hourlyRateYen * minutes) / 60);
};
