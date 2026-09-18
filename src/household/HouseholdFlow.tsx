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
          action: null,
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

  return (
    <HouseholdView
      onChangeTimeZone={changeTimeZone}
      onCreate={() => void create()}
      onReload={() => void load(true)}
      onSave={() => void save()}
      onSignOut={onSignOut}
      state={{ ...state, action: signingOut ? "signout" : state.action }}
    />
  );
}
