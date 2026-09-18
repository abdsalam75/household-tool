import { afterEach, beforeEach, jest } from "@jest/globals";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Linking, TextInput } from "react-native";

import { ParentAuthApp } from "../App";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function textOf(renderer) {
  return renderer.root
    .findAll((node) => typeof node.props?.children === "string")
    .map((node) => node.props.children)
    .join(" ");
}

function button(renderer, label) {
  return renderer.root
    .findAll((node) => node.props?.accessibilityRole === "button")
    .find(
      (candidate) =>
        candidate.findAll((node) => node.props?.children === label).length,
    );
}

function services(authenticated = false) {
  const account = { id: "recipient-id", email: "recipient@example.test" };
  const auth = {
    restoreSession: jest.fn(async () => ({
      account: authenticated ? account : null,
    })),
    signInWithEmail: jest.fn(async () => ({ account })),
    signInWithProvider: jest.fn(),
    completeOAuthCallback: jest.fn(),
    isAuthCallback: jest.fn(() => false),
    signOut: jest.fn(),
  };
  const household = {
    load: jest.fn(async () => ({
      settings: { householdId: "invited-household", timeZone: "Africa/Lagos" },
    })),
    create: jest.fn(),
    updateTimeZone: jest.fn(),
    loadParentInvitation: jest.fn(async () => ({ invitation: null })),
    createParentInvitation: jest.fn(),
    revokeParentInvitation: jest.fn(),
  };
  const invitation = {
    captureUrl: jest.fn(async () => "pending"),
    loadPending: jest.fn(async () => "none"),
    accept: jest.fn(async () => ({
      status: "accepted",
      settings: { householdId: "invited-household", timeZone: "Africa/Lagos" },
    })),
    cancel: jest.fn(async () => undefined),
  };
  return { auth, household, invitation };
}

describe("parent invitation app flow", () => {
  beforeEach(() => {
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(
        `https://invite.example.test/invitations/parent?token=${"a".repeat(43)}`,
      );
    jest.spyOn(Linking, "addEventListener").mockReturnValue({
      remove: jest.fn(),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("retains a deep link through existing sign-in, then confirms and accepts it", async () => {
    const { auth, household, invitation } = services(false);
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ParentAuthApp
          householdService={household}
          invitationAcceptanceService={invitation}
          service={auth}
        />,
      );
    });

    expect(invitation.captureUrl).toHaveBeenCalled();
    expect(textOf(renderer)).toMatch(/Parent sign-in/);

    const inputs = renderer.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText("recipient@example.test");
      inputs[1].props.onChangeText("password");
    });
    await act(async () => {
      button(renderer, "Sign in with email").props.onPress();
    });

    expect(auth.signInWithEmail).toHaveBeenCalledWith(
      "recipient@example.test",
      "password",
    );
    expect(textOf(renderer)).toMatch(/Join this household.*Accept.*Cancel/);

    await act(async () => button(renderer, "Accept").props.onPress());
    expect(invitation.accept).toHaveBeenCalledTimes(1);
    expect(textOf(renderer)).toMatch(/Invitation accepted.*parent access/);

    await act(async () => button(renderer, "Continue").props.onPress());
    expect(household.load).toHaveBeenCalled();
  });

  it("shows malformed supported links as generic terminal invitations", async () => {
    const { auth, household, invitation } = services(true);
    invitation.captureUrl.mockResolvedValue("invalid");
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ParentAuthApp
          householdService={household}
          invitationAcceptanceService={invitation}
          service={auth}
        />,
      );
    });

    expect(textOf(renderer)).toMatch(/invitation is invalid/i);
    expect(textOf(renderer)).not.toMatch(/token|digest|household-id/i);
  });
});
