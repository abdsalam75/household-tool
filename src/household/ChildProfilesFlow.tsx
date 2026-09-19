import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChildProfilesView,
  type ChildProfilesViewState,
} from "./ChildProfilesView";
import type { HouseholdService } from "./types";
import { ChildInvitationFlow } from "./ChildInvitationFlow";

const EMPTY_NAME = "Enter a child name.";

export function ChildProfilesFlow({
  service,
  onBack,
}: {
  service: Pick<
    HouseholdService,
    | "listChildProfiles"
    | "createChildProfile"
    | "deactivateChildProfile"
    | "loadChildInvitation"
    | "createChildInvitation"
    | "revokeChildInvitation"
  >;
  onBack: () => void;
}) {
  const [state, setState] = useState<ChildProfilesViewState>({
    phase: "loading",
    profiles: [],
    name: "",
    pending: "load",
    confirming: null,
  });
  const pendingRef = useRef(false);
  const [selectedInvitationId, setSelectedInvitationId] = useState<
    string | null
  >(null);

  const load = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setState((current) => ({
      ...current,
      pending: "load",
      message: undefined,
    }));
    const outcome = await service.listChildProfiles();
    setState((current) =>
      outcome.profiles
        ? {
            ...current,
            profiles: outcome.profiles,
            phase: "ready",
            pending: null,
          }
        : {
            ...current,
            phase: "error",
            pending: null,
            message: outcome.message,
          },
    );
    pendingRef.current = false;
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    if (pendingRef.current || state.phase !== "ready" || state.confirming)
      return;
    const name = state.name.trim();
    if (!name) {
      setState((current) => ({
        ...current,
        message: EMPTY_NAME,
        success: undefined,
      }));
      return;
    }
    pendingRef.current = true;
    setState((current) => ({
      ...current,
      pending: "create",
      message: undefined,
      success: undefined,
    }));
    const outcome = await service.createChildProfile(name);
    setState((current) =>
      outcome.profile
        ? {
            ...current,
            profiles: [...current.profiles, outcome.profile],
            name: "",
            pending: null,
            success: `${outcome.profile.displayName} added.`,
          }
        : { ...current, pending: null, message: outcome.message },
    );
    pendingRef.current = false;
  }, [service, state.confirming, state.name, state.phase]);

  const deactivate = useCallback(async () => {
    if (pendingRef.current || !state.confirming) return;
    const selected = state.profiles.find(
      (profile) => profile.id === state.confirming && profile.active,
    );
    if (!selected) return;
    pendingRef.current = true;
    setState((current) => ({
      ...current,
      pending: "deactivate",
      message: undefined,
      success: undefined,
    }));
    const outcome = await service.deactivateChildProfile(selected.id);
    setState((current) =>
      outcome.profile
        ? {
            ...current,
            profiles: current.profiles.map((profile) =>
              profile.id === selected.id
                ? { ...profile, active: false }
                : profile,
            ),
            pending: null,
            confirming: null,
            success: `${selected.displayName} deactivated.`,
          }
        : {
            ...current,
            pending: null,
            confirming: null,
            message: outcome.message,
          },
    );
    pendingRef.current = false;
  }, [service, state.confirming, state.profiles]);

  const selectedInvitation = state.profiles.find(
    (profile) => profile.id === selectedInvitationId,
  );
  if (selectedInvitation?.active && !selectedInvitation.activationComplete) {
    return (
      <ChildInvitationFlow
        child={selectedInvitation}
        service={service}
        onBack={() => {
          setSelectedInvitationId(null);
          void load();
        }}
      />
    );
  }

  return (
    <ChildProfilesView
      state={state}
      onBack={onBack}
      onRetry={() => void load()}
      onChangeName={(name) =>
        setState((current) => ({
          ...current,
          name,
          message: undefined,
          success: undefined,
        }))
      }
      onCreate={() => void create()}
      onAskDeactivate={(id) =>
        setState((current) => ({
          ...current,
          confirming: id,
          message: undefined,
          success: undefined,
        }))
      }
      onCancelDeactivate={() =>
        setState((current) => ({ ...current, confirming: null }))
      }
      onConfirmDeactivate={() => void deactivate()}
      onInvite={(id) => setSelectedInvitationId(id)}
    />
  );
}
