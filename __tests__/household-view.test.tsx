import React, { type ReactElement, type ReactNode } from "react";

import {
  HouseholdView,
  type HouseholdViewState,
} from "../src/household/HouseholdView";

const noOp = () => undefined;

function visibleText(node: ReactNode): string[] {
  if (typeof node === "string" || typeof node === "number")
    return [String(node)];
  if (Array.isArray(node)) return node.flatMap(visibleText);
  if (!React.isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === "function" && element.type.name === "Button") {
    return visibleText(
      (element.type as (props: typeof element.props) => ReactNode)(
        element.props,
      ),
    );
  }
  return visibleText(element.props.children);
}

function renderText(state: HouseholdViewState) {
  return visibleText(
    HouseholdView({
      state,
      onChangeTimeZone: noOp,
      onCreate: noOp,
      onReload: noOp,
      onSave: noOp,
      onSignOut: noOp,
      onCreateInvitation: noOp,
      onRevokeInvitation: noOp,
    }),
  ).join(" ");
}

describe("household setup and settings presentation", () => {
  const base: HouseholdViewState = {
    phase: "setup",
    accountLabel: "parent@example.test",
    timeZone: "Africa/Lagos",
    action: null,
  };

  it("shows an editable named-zone proposal before explicit creation", () => {
    const text = renderText(base);
    expect(text).toMatch(/review the named IANA time zone/i);
    expect(text).toMatch(/Named IANA time zone/);
    expect(text).toMatch(/Create household/);
  });

  it("clearly explains an editable fallback", () => {
    const text = renderText({
      ...base,
      timeZone: "Etc/UTC",
      fallbackMessage:
        "We couldn’t detect a named IANA time zone. Review or replace this fallback before continuing.",
    });
    expect(text).toMatch(/fallback/);
    expect(text).toMatch(/Named IANA time zone/);
  });

  it("explains scheduling impact and renders loading, success, and error states", () => {
    const text = renderText({
      ...base,
      phase: "settings",
      persistedTimeZone: "Africa/Lagos",
      action: "save",
      success: "Time zone saved.",
      message: "Please try again.",
    });
    expect(text).toMatch(
      /due-day boundaries, reminders, and overdue calculations/,
    );
    expect(text).toMatch(/Saving…/);
    expect(text).toMatch(/Time zone saved/);
    expect(text).toMatch(/try again/);
  });

  it("shows invitation loading, QR success, failure, and inactive states", () => {
    expect(
      renderText({ ...base, phase: "settings", invitationPhase: "loading" }),
    ).toMatch(/Loading invitation/);
    const url =
      "https://example.test/invitations/parent?token=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    expect(
      renderText({
        ...base,
        phase: "settings",
        invitationPhase: "success",
        invitationUrl: url,
        invitationExpiresAt: "2026-09-19T20:00:00Z",
      }),
    ).toContain(url);
    expect(
      renderText({
        ...base,
        phase: "settings",
        invitationPhase: "error",
        invitationMessage: "Please try again.",
      }),
    ).toMatch(/try again/);
    for (const [phase, label] of [
      ["expired", /expired/],
      ["revoked", /revoked/],
      ["consumed", /already used/],
    ] as const) {
      expect(
        renderText({ ...base, phase: "settings", invitationPhase: phase }),
      ).toMatch(label);
    }
  });
});
