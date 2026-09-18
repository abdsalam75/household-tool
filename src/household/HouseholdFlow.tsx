import { useCallback, useEffect, useState } from "react";

import type { ParentAccount } from "../auth/types";
import { HouseholdView, type HouseholdViewState } from "./HouseholdView";
import { isRuntimeNamedTimeZone, proposeDeviceTimeZone } from "./timeZone";
import type { HouseholdService } from "./types";

type HouseholdFlowProps = {
  account: ParentAccount;
  service: HouseholdService;
  onSignOut: () => void;
  signingOut: boolean;
};

const INVALID_ZONE =
  "Enter a valid named IANA time zone, such as Africa/Lagos or Etc/UTC.";

export function HouseholdFlow({
  account,
  service,
  onSignOut,
  signingOut,
}: HouseholdFlowProps) {
  const accountLabel = account.email ?? `Parent ${account.id}`;
  const [state, setState] = useState<HouseholdViewState>({
    phase: "loading",
    accountLabel,
    timeZone: "",
    action: null,
  });

  const load = useCallback(
    async (retry = false) => {
      if (retry) setState((current) => ({ ...current, action: "reload" }));
      const outcome = await service.load();
      if (outcome.settings) {
        setState({
          phase: "settings",
          accountLabel,
          timeZone: outcome.settings.timeZone,
          persistedTimeZone: outcome.settings.timeZone,
          invitationPhase: "loading",
          action: null,
        });
        const invitationOutcome = await service.loadParentInvitation();
        setState((current) => {
          if (current.phase !== "settings") return current;
          if (invitationOutcome.message)
            return {
              ...current,
              invitationPhase: "error",
              invitationMessage: invitationOutcome.message,
            };
          const invitation = invitationOutcome.invitation;
          return {
            ...current,
            invitationPhase: invitation
              ? invitation.status === "active"
                ? invitation.url
                  ? "success"
                  : "activeUnavailable"
                : invitation.status
              : "idle",
            invitationUrl: invitation?.url,
            invitationExpiresAt: invitation?.expiresAt,
            invitationMessage: undefined,
          };
        });
      } else if (outcome.message) {
        setState({
          phase: "loadError",
          accountLabel,
          timeZone: "",
          message: outcome.message,
          action: null,
        });
      } else {
        const proposal = proposeDeviceTimeZone();
        setState({
          phase: "setup",
          accountLabel,
          timeZone: proposal.timeZone,
          fallbackMessage: proposal.message,
          action: null,
        });
      }
    },
    [accountLabel, service],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state.invitationPhase !== "success" || !state.invitationExpiresAt)
      return;
    const remaining =
      new Date(state.invitationExpiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setState((current) => ({
        ...current,
        invitationPhase: "expired",
        invitationUrl: undefined,
      }));
      return;
    }
    const timer = setTimeout(() => {
      setState((current) => ({
        ...current,
        invitationPhase: "expired",
        invitationUrl: undefined,
      }));
    }, remaining);
    return () => clearTimeout(timer);
  }, [state.invitationExpiresAt, state.invitationPhase]);

  const changeTimeZone = useCallback((timeZone: string) => {
    setState((current) => ({
      ...current,
      timeZone,
      fallbackMessage: undefined,
      message: undefined,
      success: undefined,
    }));
  }, []);

  const create = useCallback(async () => {
    if (!isRuntimeNamedTimeZone(state.timeZone)) {
      setState((current) => ({ ...current, message: INVALID_ZONE }));
      return;
    }
    setState((current) => ({
      ...current,
      action: "create",
      message: undefined,
    }));
    const outcome = await service.create(state.timeZone);
    if (!outcome.settings) {
      setState((current) => ({
        ...current,
        action: null,
        message: outcome.message,
      }));
      return;
    }
    setState({
      phase: "settings",
      accountLabel,
      timeZone: outcome.settings.timeZone,
      persistedTimeZone: outcome.settings.timeZone,
      success: "Household created.",
      invitationPhase: "idle",
      action: null,
    });
  }, [accountLabel, service, state.timeZone]);

  const save = useCallback(async () => {
    if (!isRuntimeNamedTimeZone(state.timeZone)) {
      setState((current) => ({ ...current, message: INVALID_ZONE }));
      return;
    }
    setState((current) => ({
      ...current,
      action: "save",
      message: undefined,
      success: undefined,
    }));
    const outcome = await service.updateTimeZone(state.timeZone);
    if (!outcome.settings) {
      setState((current) => ({
        ...current,
        action: null,
        message: outcome.message,
      }));
      return;
    }
    setState((current) => ({
      ...current,
      action: null,
      timeZone: outcome.settings!.timeZone,
      persistedTimeZone: outcome.settings!.timeZone,
      success: "Time zone saved.",
    }));
  }, [service, state.timeZone]);

  const createInvitation = useCallback(async () => {
    setState((current) => ({
      ...current,
      action: "createInvite",
      invitationMessage: undefined,
    }));
    const outcome = await service.createParentInvitation();
    if (!outcome.invitation) {
      setState((current) => ({
        ...current,
        action: null,
        invitationPhase: "error",
        invitationMessage: outcome.message,
      }));
      return;
    }
    setState((current) => ({
      ...current,
      action: null,
      invitationPhase: "success",
      invitationUrl: outcome.invitation!.url,
      invitationExpiresAt: outcome.invitation!.expiresAt,
      invitationMessage: undefined,
    }));
  }, [service]);

  const revokeInvitation = useCallback(async () => {
    setState((current) => ({
      ...current,
      action: "revokeInvite",
      invitationMessage: undefined,
    }));
    const outcome = await service.revokeParentInvitation();
    if (!outcome.invitation) {
      setState((current) => ({
        ...current,
        action: null,
        invitationMessage: outcome.message,
      }));
      return;
    }
    setState((current) => ({
      ...current,
      action: null,
      invitationPhase: "revoked",
      invitationUrl: undefined,
      invitationExpiresAt: outcome.invitation!.expiresAt,
    }));
  }, [service]);

  return (
    <HouseholdView
      onChangeTimeZone={changeTimeZone}
      onCreate={() => void create()}
      onReload={() => void load(true)}
      onSave={() => void save()}
      onSignOut={onSignOut}
      onCreateInvitation={() => void createInvitation()}
      onRevokeInvitation={() => void revokeInvitation()}
      state={{ ...state, action: signingOut ? "signout" : state.action }}
    />
  );
}
