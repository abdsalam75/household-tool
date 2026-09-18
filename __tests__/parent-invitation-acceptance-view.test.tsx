import React, { type ReactElement, type ReactNode } from "react";

import {
  ParentInvitationAcceptanceView,
  type InvitationAcceptancePhase,
} from "../src/household/ParentInvitationAcceptanceView";

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

function renderText(phase: InvitationAcceptancePhase) {
  return visibleText(
    ParentInvitationAcceptanceView({
      phase,
      onAccept: noOp,
      onCancel: noOp,
      onContinue: noOp,
    }),
  ).join(" ");
}

describe("parent invitation acceptance presentation", () => {
  it("shows confirmation, accepting, success, cancellation, and retry states", () => {
    expect(renderText("confirmation")).toMatch(/Accept.*Cancel/);
    expect(renderText("accepting")).toMatch(/Accepting invitation/);
    expect(renderText("success")).toMatch(/Invitation accepted.*parent access/);
    expect(renderText("cancelled")).toMatch(/cancelled/);
    expect(renderText("retry")).toMatch(/try again.*Accept.*Cancel/);
  });

  it.each([
    ["invalid", /invalid/],
    ["expired", /expired/],
    ["revoked", /revoked/],
    ["consumed", /already used/],
    ["wrong_role", /cannot be used for parent/],
    ["unauthorized", /not eligible/],
    ["already_member", /already belongs/],
    ["parent_limit", /two active parents/],
  ] as const)("shows a safe %s rejection", (phase, message) => {
    const text = renderText(phase);
    expect(text).toMatch(message);
    expect(text).toMatch(/Continue/);
    expect(text).not.toMatch(/household-id|token|digest|backend/i);
  });
});
