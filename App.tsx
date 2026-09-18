import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";

import {
  initialAuthState,
  parentAuthReducer,
  ParentAuthView,
} from "./src/auth/ParentAuthView";
import { createParentAuthService } from "./src/auth/createParentAuthService";
import type { AuthAction, ParentAuthService, Provider } from "./src/auth/types";
import { createHouseholdService } from "./src/household/createHouseholdService";
import { createParentInvitationAcceptanceService } from "./src/household/createParentInvitationAcceptanceService";
import { HouseholdFlow } from "./src/household/HouseholdFlow";
import type { ParentInvitationAcceptanceServiceContract } from "./src/household/ParentInvitationAcceptanceService";
import {
  ParentInvitationAcceptanceView,
  type InvitationAcceptancePhase,
} from "./src/household/ParentInvitationAcceptanceView";
import type { HouseholdService } from "./src/household/types";

type AppProps = {
  service?: ParentAuthService;
  householdService?: HouseholdService;
  invitationAcceptanceService?: ParentInvitationAcceptanceServiceContract;
};

export function ParentAuthApp({
  service: injectedService,
  householdService: injectedHouseholdService,
  invitationAcceptanceService: injectedInvitationAcceptanceService,
}: AppProps) {
  const [service] = useState<ParentAuthService | null>(() => {
    if (injectedService) return injectedService;
    try {
      return createParentAuthService();
    } catch {
      return null;
    }
  });
  const [householdService] = useState<HouseholdService | null>(() => {
    if (injectedHouseholdService) return injectedHouseholdService;
    try {
      return createHouseholdService();
    } catch {
      return null;
    }
  });
  const [invitationAcceptanceService] =
    useState<ParentInvitationAcceptanceServiceContract | null>(() => {
      if (injectedInvitationAcceptanceService)
        return injectedInvitationAcceptanceService;
      try {
        return createParentInvitationAcceptanceService();
      } catch {
        return null;
      }
    });
  const [state, setState] = useState(initialAuthState);
  const [invitationPhase, setInvitationPhase] =
    useState<InvitationAcceptancePhase | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const actionRef = useRef<AuthAction | null>(null);
  const authenticatedRef = useRef(false);

  const updateState = useCallback(
    (event: Parameters<typeof parentAuthReducer>[1]) => {
      setState((current) => parentAuthReducer(current, event));
    },
    [],
  );

  const finishAuthentication = useCallback(
    async (work: () => ReturnType<ParentAuthService["signInWithEmail"]>) => {
      try {
        const result = await work();
        if (result.account) {
          authenticatedRef.current = true;
          updateState({ type: "AUTHENTICATED", account: result.account });
        } else {
          authenticatedRef.current = false;
          updateState({ type: "SIGNED_OUT", message: result.message });
        }
      } finally {
        actionRef.current = null;
      }
    },
    [updateState],
  );

  const captureInvitationUrl = useCallback(
    async (url: string) => {
      if (!invitationAcceptanceService) return "unrelated" as const;
      const outcome = await invitationAcceptanceService.captureUrl(url);
      if (outcome === "pending") setInvitationPhase("confirmation");
      if (outcome === "invalid") setInvitationPhase("invalid");
      return outcome;
    },
    [invitationAcceptanceService],
  );

  useEffect(() => {
    if (!service) {
      updateState({
        type: "SIGNED_OUT",
        message: "Sign-in is temporarily unavailable. Please try again later.",
      });
      return;
    }

    let active = true;

    const start = async () => {
      const initialUrl = await Linking.getInitialURL();
      const linkOutcome = initialUrl
        ? await captureInvitationUrl(initialUrl)
        : "unrelated";
      if (linkOutcome === "unrelated" && invitationAcceptanceService) {
        const pending = await invitationAcceptanceService.loadPending();
        if (pending === "pending") setInvitationPhase("confirmation");
        if (pending === "invalid") setInvitationPhase("invalid");
      }
      const result =
        initialUrl && service.isAuthCallback(initialUrl)
          ? await service.completeOAuthCallback(initialUrl)
          : await service.restoreSession();

      if (!active) return;

      if (result.account) {
        authenticatedRef.current = true;
        updateState({ type: "AUTHENTICATED", account: result.account });
      } else {
        authenticatedRef.current = false;
        updateState({ type: "SIGNED_OUT", message: result.message });
      }
    };

    void start().catch(() => {
      if (active) {
        updateState({
          type: "SIGNED_OUT",
          message: "Sign-in is temporarily unavailable. Please try again.",
        });
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (service.isAuthCallback(url)) {
        if (actionRef.current || authenticatedRef.current) return;
        actionRef.current = "callback";
        updateState({ type: "BEGIN", action: "callback" });
        void finishAuthentication(() => service.completeOAuthCallback(url));
        return;
      }
      void captureInvitationUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [
    captureInvitationUrl,
    finishAuthentication,
    invitationAcceptanceService,
    service,
    updateState,
  ]);

  const begin = useCallback(
    (action: AuthAction) => {
      if (actionRef.current) return false;
      actionRef.current = action;
      updateState({ type: "BEGIN", action });
      return true;
    },
    [updateState],
  );

  const signInWithEmail = useCallback(() => {
    if (!service || !begin("email")) return;

    const submittedPassword = password;
    setPassword("");
    void finishAuthentication(() =>
      service.signInWithEmail(email.trim(), submittedPassword),
    );
  }, [begin, email, finishAuthentication, password, service]);

  const signInWithProvider = useCallback(
    (provider: Provider) => {
      if (!service || !begin(provider)) return;
      void finishAuthentication(() => service.signInWithProvider(provider));
    },
    [begin, finishAuthentication, service],
  );

  const signOut = useCallback(() => {
    if (!service || !begin("signout")) return;
    void service.signOut().then((result) => {
      actionRef.current = null;
      authenticatedRef.current = false;
      updateState({ type: "SIGNED_OUT", message: result.message });
    });
  }, [begin, service, updateState]);

  const acceptInvitation = useCallback(() => {
    if (!invitationAcceptanceService || invitationPhase === "accepting") return;
    setInvitationPhase("accepting");
    void invitationAcceptanceService.accept().then((outcome) => {
      setInvitationPhase(
        outcome.status === "accepted" ? "success" : outcome.status,
      );
    });
  }, [invitationAcceptanceService, invitationPhase]);

  const cancelInvitation = useCallback(() => {
    if (!invitationAcceptanceService) return;
    void invitationAcceptanceService.cancel().then(() => {
      setInvitationPhase("cancelled");
    });
  }, [invitationAcceptanceService]);

  if (
    invitationPhase &&
    (invitationPhase !== "confirmation" || state.phase === "signedIn")
  ) {
    return (
      <ParentInvitationAcceptanceView
        onAccept={acceptInvitation}
        onCancel={cancelInvitation}
        onContinue={() => setInvitationPhase(null)}
        phase={invitationPhase}
      />
    );
  }

  if (state.phase === "signedIn" && state.account && householdService) {
    return (
      <HouseholdFlow
        account={state.account}
        onSignOut={signOut}
        service={householdService}
        signingOut={state.action === "signout"}
      />
    );
  }

  return (
    <ParentAuthView
      email={email}
      onChangeEmail={setEmail}
      onChangePassword={setPassword}
      onEmailSignIn={signInWithEmail}
      onProviderSignIn={signInWithProvider}
      onSignOut={signOut}
      password={password}
      state={state}
    />
  );
}

export default function App() {
  return <ParentAuthApp />;
}
