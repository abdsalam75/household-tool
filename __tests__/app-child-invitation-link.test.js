import { afterEach, jest } from "@jest/globals";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Linking, Text } from "react-native";

import { ParentAuthApp } from "../App";
import { classifyChildInvitationUrl } from "../src/household/invitationLinkConfig";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const base = "https://household-tool-invitations.pages.dev/invitations/child";
const token = "a".repeat(43);

function visibleText(renderer) {
  return renderer.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .flat(Infinity)
    .filter((value) => typeof value === "string")
    .join(" ");
}

function services() {
  const auth = {
    restoreSession: jest.fn(async () => ({ account: null })),
    signInWithEmail: jest.fn(),
    signInWithProvider: jest.fn(),
    completeOAuthCallback: jest.fn(),
    isAuthCallback: jest.fn(() => false),
    signOut: jest.fn(),
  };
  const invitation = {
    captureUrl: jest.fn(async () => "unrelated"),
    loadPending: jest.fn(async () => "none"),
    accept: jest.fn(),
    cancel: jest.fn(),
  };
  return { auth, invitation };
}

describe("child invitation app entry", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["valid", `${base}?token=${token}`],
    ["invalid", base],
    ["invalid", `${base}?token=short`],
    ["invalid", `${base}?token=${token}&member=private`],
    ["invalid", `${base}?token=${token}&token=${token}`],
    ["invalid", `${base}?token=${token}#variation`],
    ["invalid", `${base}?token=${"%61".repeat(43)}`],
    [
      "unrelated",
      `https://household-tool-invitations.pages.dev/other?token=${token}`,
    ],
  ])(
    "classifies %s child links without accepting noncanonical forms",
    (expected, url) => {
      expect(classifyChildInvitationUrl(url, base)).toBe(expected);
    },
  );

  it("opens valid-shaped child links at a generic entry without parent acceptance or disclosure", async () => {
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`${base}?token=${token}`);
    jest
      .spyOn(Linking, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
    const { auth, invitation } = services();
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ParentAuthApp
          childInvitationUrlBase={base}
          invitationAcceptanceService={invitation}
          service={auth}
        />,
      );
    });
    const shown = visibleText(renderer);
    expect(shown).toMatch(/Child invitation.*Open Household Tool to continue/);
    expect(shown).not.toContain(token);
    expect(shown).not.toMatch(/household id|member|pin|accept/i);
    expect(invitation.captureUrl).not.toHaveBeenCalled();
    expect(invitation.loadPending).not.toHaveBeenCalled();
    expect(auth.restoreSession).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it("shows malformed child links as a generic invalid invitation", async () => {
    jest
      .spyOn(Linking, "getInitialURL")
      .mockResolvedValue(`${base}?token=${token}#variation`);
    jest
      .spyOn(Linking, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
    const { auth, invitation } = services();
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ParentAuthApp
          childInvitationUrlBase={base}
          invitationAcceptanceService={invitation}
          service={auth}
        />,
      );
    });
    expect(visibleText(renderer)).toMatch(/invitation link is invalid/i);
    expect(visibleText(renderer)).not.toContain(token);
    expect(invitation.captureUrl).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
