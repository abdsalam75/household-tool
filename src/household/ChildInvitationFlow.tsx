import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Share } from "react-native";

import { ChildInvitationView } from "./ChildInvitationView";
import type { ChildProfile, HouseholdService, ParentInvitation } from "./types";

export type ChildInvitationPhase =
  | "loading"
  | "idle"
  | "success"
  | "activeUnavailable"
  | "expired"
  | "revoked"
  | "consumed"
  | "error";

type State = {
  phase: ChildInvitationPhase;
  invitation: ParentInvitation | null;
  pending: "load" | "create" | "revoke" | null;
  message?: string;
  copied?: boolean;
};

function phaseOf(invitation: ParentInvitation | null): ChildInvitationPhase {
  if (!invitation) return "idle";
  if (invitation.status !== "active") return invitation.status;
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return "expired";
  return invitation.url ? "success" : "activeUnavailable";
}

export function ChildInvitationFlow({
  child,
  service,
  onBack,
}: {
  child: ChildProfile;
  service: Pick<
    HouseholdService,
    "loadChildInvitation" | "createChildInvitation" | "revokeChildInvitation"
  >;
  onBack: () => void;
}) {
  const [state, setState] = useState<State>({
    phase: "loading",
    invitation: null,
    pending: "load",
  });
  const pendingRef = useRef(false);

  const load = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setState((current) => ({
      ...current,
      pending: "load",
      message: undefined,
    }));
    const outcome = await service.loadChildInvitation(child.id);
    setState({
      phase: outcome.message ? "error" : phaseOf(outcome.invitation),
      invitation: outcome.invitation,
      pending: null,
      message: outcome.message,
    });
    pendingRef.current = false;
  }, [child.id, service]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state.phase !== "success" || !state.invitation) return;
    const remaining =
      new Date(state.invitation.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      setState((current) => ({
        ...current,
        phase: "expired",
        invitation: null,
      }));
      return;
    }
    const timer = setTimeout(() => {
      setState((current) => ({
        ...current,
        phase: "expired",
        invitation: null,
      }));
    }, remaining);
    return () => clearTimeout(timer);
  }, [state.invitation, state.phase]);

  const create = useCallback(async () => {
    if (pendingRef.current || !child.active || child.activationComplete) return;
    pendingRef.current = true;
    setState((current) => ({
      ...current,
      pending: "create",
      message: undefined,
    }));
    const outcome = await service.createChildInvitation(child.id);
    setState({
      phase: outcome.message ? "error" : phaseOf(outcome.invitation),
      invitation: outcome.invitation,
      pending: null,
      message: outcome.message,
    });
    pendingRef.current = false;
  }, [child, service]);

  const revoke = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setState((current) => ({
      ...current,
      pending: "revoke",
      message: undefined,
    }));
    const outcome = await service.revokeChildInvitation(child.id);
    setState((current) =>
      outcome.invitation
        ? {
            phase: phaseOf(outcome.invitation),
            invitation: null,
            pending: null,
          }
        : { ...current, pending: null, message: outcome.message },
    );
    pendingRef.current = false;
  }, [child.id, service]);

  const shareableUrl =
    state.phase === "success" &&
    state.pending === null &&
    state.invitation?.url &&
    new Date(state.invitation.expiresAt).getTime() > Date.now()
      ? state.invitation.url
      : null;

  const copy = useCallback(async () => {
    if (!shareableUrl) return;
    try {
      await Clipboard.setStringAsync(shareableUrl);
      setState((current) => ({ ...current, copied: true, message: undefined }));
    } catch {
      setState((current) => ({
        ...current,
        message: "Could not copy the invitation link. Please try again.",
      }));
    }
  }, [shareableUrl]);

  const share = useCallback(async () => {
    if (!shareableUrl) return;
    try {
      await Share.share({ message: shareableUrl });
    } catch {
      setState((current) => ({
        ...current,
        message: "Could not share the invitation link. Please try again.",
      }));
    }
  }, [shareableUrl]);

  return (
    <ChildInvitationView
      childName={child.displayName}
      phase={state.phase}
      pending={state.pending}
      url={shareableUrl}
      expiresAt={state.invitation?.expiresAt}
      message={state.message}
      copied={state.copied === true}
      onBack={onBack}
      onRetry={() => void load()}
      onCreate={() => void create()}
      onRevoke={() => void revoke()}
      onCopy={() => void copy()}
      onShare={() => void share()}
    />
  );
}
