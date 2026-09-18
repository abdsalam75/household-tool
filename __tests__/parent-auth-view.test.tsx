import React, { type ReactElement, type ReactNode } from "react";

import {
  initialAuthState,
  parentAuthReducer,
  ParentAuthView,
  type AuthViewState,
} from "../src/auth/ParentAuthView";

const noOp = () => undefined;

function visibleText(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) return node.flatMap(visibleText);
  if (!React.isValidElement(node)) return [];

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (
    typeof element.type === "function" &&
    element.type.name === "ActionButton"
  ) {
    const component = element.type as (
      props: typeof element.props,
    ) => ReactNode;
    return visibleText(component(element.props));
  }
  return visibleText(element.props.children);
}

function renderText(state: AuthViewState, password = "") {
  return visibleText(
    ParentAuthView({
      state,
      email: "parent@example.test",
      password,
      onChangeEmail: noOp,
      onChangePassword: noOp,
      onEmailSignIn: noOp,
      onProviderSignIn: noOp,
      onSignOut: noOp,
    }),
  ).join(" ");
}

describe("parent Auth presentation", () => {
  it("shows only deterministic restoration while cold-start lookup is pending", () => {
    const text = renderText(initialAuthState);

    expect(text).toMatch(/Restoring your secure session/);
    expect(text).not.toMatch(/Parent sign-in|Welcome home/);
  });

  it("shows every parent sign-in action and no protected placeholder", () => {
    const state = parentAuthReducer(initialAuthState, { type: "SIGNED_OUT" });
    const text = renderText(state);

    expect(text).toMatch(/Parent sign-in/);
    expect(text).toMatch(/Email/);
    expect(text).toMatch(/Password/);
    expect(text).toMatch(/Sign in with email/);
    expect(text).toMatch(/Continue with Google/);
    expect(text).toMatch(/Continue with Apple/);
    expect(text).not.toMatch(/Welcome home|Household setup/);
  });

  it("shows loading then a safe retryable error without visibly exposing secrets", () => {
    let state = parentAuthReducer(initialAuthState, { type: "SIGNED_OUT" });
    state = parentAuthReducer(state, { type: "BEGIN", action: "email" });
    expect(renderText(state, "raw-password")).toMatch(/Signing in…/);

    state = parentAuthReducer(state, {
      type: "SIGNED_OUT",
      message: "We couldn’t sign you in. Please try again.",
    });
    const text = renderText(state, "");
    expect(text).toMatch(/try again/);
    expect(text).not.toMatch(
      /raw-password|raw-access-token|raw-refresh-token|backend detail/,
    );
  });

  it("shows an account-identifying placeholder and sign-out without tokens", () => {
    const state = parentAuthReducer(initialAuthState, {
      type: "AUTHENTICATED",
      account: { id: "parent-id", email: "parent@example.test" },
    });
    const text = renderText(state);

    expect(text).toMatch(/Welcome home/);
    expect(text).toMatch(/parent@example.test/);
    expect(text).toMatch(/Household setup is coming next/);
    expect(text).toMatch(/Sign out/);
    expect(text).not.toMatch(/access.token|refresh.token/i);
  });

  it("returns from provider cancellation to usable sign-in without an error", () => {
    let state = parentAuthReducer(initialAuthState, { type: "SIGNED_OUT" });
    state = parentAuthReducer(state, { type: "BEGIN", action: "google" });
    expect(renderText(state)).toMatch(/Opening Google…/);

    state = parentAuthReducer(state, { type: "SIGNED_OUT" });
    const text = renderText(state);
    expect(text).toMatch(/Parent sign-in/);
    expect(text).not.toMatch(/couldn’t|rejected|failed/i);
  });

  it("shows progress while an external callback is exchanged", () => {
    let state = parentAuthReducer(initialAuthState, { type: "SIGNED_OUT" });
    state = parentAuthReducer(state, { type: "BEGIN", action: "callback" });

    expect(renderText(state)).toMatch(/Completing sign-in…/);
  });
});
