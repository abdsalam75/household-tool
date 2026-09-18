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
import { HouseholdFlow } from "./src/household/HouseholdFlow";
import type { HouseholdService } from "./src/household/types";

type AppProps = {
  service?: ParentAuthService;
  householdService?: HouseholdService;
};

export function ParentAuthApp({
  service: injectedService,
  householdService: injectedHouseholdService,
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
  const [state, setState] = useState(initialAuthState);
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
      if (
        actionRef.current ||
        authenticatedRef.current ||
        !service.isAuthCallback(url)
      )
        return;
      actionRef.current = "callback";
      updateState({ type: "BEGIN", action: "callback" });
      void finishAuthentication(() => service.completeOAuthCallback(url));
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [finishAuthentication, service, updateState]);

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
