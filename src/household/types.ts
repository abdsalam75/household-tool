export type HouseholdSettings = {
  householdId: string;
  timeZone: string;
};

export type HouseholdOutcome = {
  settings: HouseholdSettings | null;
  message?: string;
};

export type HouseholdService = {
  load(): Promise<HouseholdOutcome>;
  create(timeZone: string): Promise<HouseholdOutcome>;
  updateTimeZone(timeZone: string): Promise<HouseholdOutcome>;
};
