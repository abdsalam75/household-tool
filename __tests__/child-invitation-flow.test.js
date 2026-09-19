import { jest, afterEach } from "@jest/globals";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Share, Text } from "react-native";
import * as Clipboard from "expo-clipboard";

import { ChildInvitationFlow } from "../src/household/ChildInvitationFlow";
import { InvitationQr } from "../src/household/HouseholdView";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const child = {
  id: "secret-child-id",
  displayName: "Ada",
  active: true,
  activationComplete: false,
};
const token = "z".repeat(43);
const url = `https://invite.example.test/invitations/child?token=${token}`;
const createdAt = new Date(Date.now() - 1000).toISOString();
const expiresAt = new Date(Date.now() + 3600000).toISOString();
const active = { status: "active", createdAt, expiresAt, url };

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function service() {
  return {
    loadChildInvitation: jest.fn(async () => ({ invitation: null })),
    createChildInvitation: jest.fn(async () => ({ invitation: active })),
    revokeChildInvitation: jest.fn(async () => ({
      invitation: { ...active, status: "revoked", url: undefined },
    })),
  };
}

function textOf(renderer) {
  const strings = (value) =>
    Array.isArray(value)
      ? value.flatMap(strings)
      : typeof value === "string"
        ? [value]
        : [];
  return renderer.root
    .findAllByType(Text)
    .map((node) => strings(node.props.children).join(""))
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

async function mount(mock) {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ChildInvitationFlow child={child} service={mock} onBack={jest.fn()} />,
    );
  });
  return renderer;
}

describe("child invitation screen", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows loading and prevents duplicate revoke submission", async () => {
    const mock = service();
    const initial = deferred();
    mock.loadChildInvitation.mockReturnValueOnce(initial.promise);
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <ChildInvitationFlow child={child} service={mock} onBack={jest.fn()} />,
      );
    });
    expect(textOf(renderer)).toMatch(/Loading invitation/);
    expect(button(renderer, "Back to child profiles").props.disabled).toBe(
      true,
    );
    await act(async () => initial.resolve({ invitation: active }));
    const pending = deferred();
    mock.revokeChildInvitation.mockReturnValueOnce(pending.promise);
    act(() => button(renderer, "Revoke invitation").props.onPress());
    expect(button(renderer, "Revoking…").props.disabled).toBe(true);
    expect(button(renderer, "Copy link")).toBeUndefined();
    await act(async () => button(renderer, "Revoking…").props.onPress());
    expect(mock.revokeChildInvitation).toHaveBeenCalledTimes(1);
    await act(async () =>
      pending.resolve({
        invitation: { ...active, status: "revoked", url: undefined },
      }),
    );
    expect(button(renderer, "Share link")).toBeUndefined();
    await act(async () => renderer.unmount());
  });

  it("loads, creates once, and passes the exact displayed QR URL to copy and native share", async () => {
    const mock = service();
    const renderer = await mount(mock);
    expect(textOf(renderer)).toMatch(/Invite Ada/);
    expect(textOf(renderer)).not.toMatch(/secret-child-id/);
    const pending = deferred();
    mock.createChildInvitation.mockReturnValueOnce(pending.promise);
    act(() => button(renderer, "Create invitation").props.onPress());
    expect(button(renderer, "Creating invitation…").props.disabled).toBe(true);
    await act(async () =>
      button(renderer, "Creating invitation…").props.onPress(),
    );
    expect(mock.createChildInvitation).toHaveBeenCalledTimes(1);
    expect(mock.createChildInvitation).toHaveBeenCalledWith(child.id);
    await act(async () => pending.resolve({ invitation: active }));
    expect(textOf(renderer)).toContain(url);
    expect(renderer.root.findByType(InvitationQr).props.url).toBe(url);
    const share = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction });
    await act(async () => button(renderer, "Copy link").props.onPress());
    await act(async () => button(renderer, "Share link").props.onPress());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(url);
    expect(share).toHaveBeenCalledWith({ message: url });
    expect(textOf(renderer)).toMatch(/Link copied/);
    expect(url).not.toMatch(
      /secret-child-id|household|pin|credential|session|id=/i,
    );
    await act(async () => renderer.unmount());
  });

  it("shows active-unavailable, replacement, revoke retry, and terminal states without a shareable token", async () => {
    const mock = service();
    mock.loadChildInvitation.mockResolvedValueOnce({
      invitation: { ...active, url: undefined },
    });
    const renderer = await mount(mock);
    expect(textOf(renderer)).toMatch(/active invitation exists/);
    expect(button(renderer, "Copy link")).toBeUndefined();
    expect(button(renderer, "Replace invitation")).toBeDefined();
    mock.revokeChildInvitation.mockResolvedValueOnce({
      invitation: null,
      message: "Please try again.",
    });
    await act(async () =>
      button(renderer, "Revoke invitation").props.onPress(),
    );
    expect(textOf(renderer)).toMatch(/Please try again/);
    await act(async () =>
      button(renderer, "Revoke invitation").props.onPress(),
    );
    expect(textOf(renderer)).toMatch(/revoked and is no longer shareable/);
    expect(button(renderer, "Copy link")).toBeUndefined();
    for (const status of ["expired", "consumed"]) {
      mock.loadChildInvitation.mockResolvedValueOnce({
        invitation: { ...active, status, url: undefined },
      });
      await act(async () => button(renderer, "Refresh status").props.onPress());
      expect(textOf(renderer)).toMatch(
        new RegExp(
          status === "consumed" ? "used and cannot be reused" : "expired",
        ),
      );
      expect(button(renderer, "Copy link")).toBeUndefined();
    }
    await act(async () => renderer.unmount());
  });

  it("shows retryable failure and expires the link locally", async () => {
    const mock = service();
    mock.loadChildInvitation.mockResolvedValueOnce({
      invitation: null,
      message: "Please try again.",
    });
    const renderer = await mount(mock);
    expect(button(renderer, "Try again")).toBeDefined();
    mock.loadChildInvitation.mockResolvedValueOnce({
      invitation: {
        ...active,
        expiresAt: new Date(Date.now() - 1).toISOString(),
      },
    });
    await act(async () => button(renderer, "Try again").props.onPress());
    expect(textOf(renderer)).toMatch(/expired/);
    expect(button(renderer, "Share link")).toBeUndefined();
    await act(async () => renderer.unmount());
  });
});
