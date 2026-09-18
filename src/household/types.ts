export type HouseholdSettings = {
  householdId: string;
  timeZone: string;
};

export type HouseholdOutcome = {
  settings: HouseholdSettings | null;
  message?: string;
};

export type ParentInvitationStatus =
  | "active"
  | "expired"
  | "revoked"
  | "consumed";

export type ParentInvitation = {
  status: ParentInvitationStatus;
  createdAt: string;
  expiresAt: string;
  url?: string;
};

export type ParentInvitationOutcome = {
  invitation: ParentInvitation | null;
  message?: string;
};

export type HouseholdService = {
  load(): Promise<HouseholdOutcome>;
  create(timeZone: string): Promise<HouseholdOutcome>;
  updateTimeZone(timeZone: string): Promise<HouseholdOutcome>;
  loadParentInvitation(): Promise<ParentInvitationOutcome>;
  createParentInvitation(): Promise<ParentInvitationOutcome>;
  revokeParentInvitation(): Promise<ParentInvitationOutcome>;
};
