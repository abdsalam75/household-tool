import { jest } from "@jest/globals";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";

import { ChildProfilesFlow } from "../src/household/ChildProfilesFlow";
import { HouseholdFlow } from "../src/household/HouseholdFlow";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ada = { id: "opaque-ada", displayName: "Ada", active: true };
const ben = { id: "opaque-ben", displayName: "Ben", active: true };

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function service() {
  return {
    listChildProfiles: jest.fn(async () => ({ profiles: [] })),
    createChildProfile: jest.fn(async () => ({ profile: ada })),
    deactivateChildProfile: jest.fn(async () => ({
      profile: { ...ada, active: false },
    })),
  };
}

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

async function mount(mockService) {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ChildProfilesFlow service={mockService} onBack={jest.fn()} />,
    );
  });
  return renderer;
}

describe("child profile administration screen", () => {
  it("opens from the authenticated household settings and returns", async () => {
    const mock = {
      ...service(),
      load: jest.fn(async () => ({
        settings: { householdId: "private-house", timeZone: "Africa/Lagos" },
      })),
      loadParentInvitation: jest.fn(async () => ({ invitation: null })),
    };
    mock.listChildProfiles.mockResolvedValue({ profiles: [ada] });
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <HouseholdFlow
          account={{ id: "parent", email: "parent@example.test" }}
          service={mock}
          signingOut={false}
          onSignOut={jest.fn()}
        />,
      );
    });
    await act(async () =>
      button(renderer, "Manage child profiles").props.onPress(),
    );
    expect(mock.listChildProfiles).toHaveBeenCalledTimes(1);
    expect(textOf(renderer)).toMatch(/Ada Active/);
    expect(textOf(renderer)).not.toMatch(
      /private-house|parent@example.test|opaque-ada/,
    );
    await act(async () =>
      button(renderer, "Back to household").props.onPress(),
    );
    expect(textOf(renderer)).toMatch(/Household time zone/);
  });

  it("shows loading, empty state, validation, pending create, and one successful profile", async () => {
    const mock = service();
    const initial = deferred();
    mock.listChildProfiles.mockReturnValueOnce(initial.promise);
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <ChildProfilesFlow service={mock} onBack={jest.fn()} />,
      );
    });
    expect(textOf(renderer)).toMatch(/Loading child profiles/);
    expect(button(renderer, "Back to household").props.disabled).toBe(true);
    await act(async () => initial.resolve({ profiles: [] }));
    expect(textOf(renderer)).toMatch(/No child profiles yet.*Add a child/);

    await act(async () => button(renderer, "Add child").props.onPress());
    expect(textOf(renderer)).toMatch(/Enter a child name/);
    expect(mock.createChildProfile).not.toHaveBeenCalled();

    await act(async () =>
      renderer.root.findByType(TextInput).props.onChangeText("  Ada  "),
    );
    const create = deferred();
    mock.createChildProfile.mockReturnValueOnce(create.promise);
    act(() => button(renderer, "Add child").props.onPress());
    expect(button(renderer, "Adding child…").props.disabled).toBe(true);
    expect(renderer.root.findByType(TextInput).props.editable).toBe(false);
    await act(async () => button(renderer, "Adding child…").props.onPress());
    expect(mock.createChildProfile).toHaveBeenCalledTimes(1);
    expect(mock.createChildProfile).toHaveBeenCalledWith("Ada");
    await act(async () => create.resolve({ profile: ada }));
    expect(textOf(renderer)).toMatch(/Ada added/);
    expect(textOf(renderer)).toMatch(/Ada Active/);
    expect(textOf(renderer)).not.toMatch(/opaque-ada/);
  });

  it("shows a safe duplicate error and keeps the list", async () => {
    const mock = service();
    mock.listChildProfiles.mockResolvedValue({ profiles: [ada] });
    mock.createChildProfile.mockResolvedValue({
      profile: null,
      message: "A child with this name already exists.",
    });
    const renderer = await mount(mock);
    await act(async () =>
      renderer.root.findByType(TextInput).props.onChangeText("ADA"),
    );
    await act(async () => button(renderer, "Add child").props.onPress());
    expect(textOf(renderer)).toMatch(/already exists/);
    expect(textOf(renderer)).toMatch(/Ada Active/);
    expect(button(renderer, "Deactivate Ada")).toBeDefined();
  });

  it("keeps the entered name and existing profiles after create is denied", async () => {
    const mock = service();
    mock.listChildProfiles.mockResolvedValue({ profiles: [ben] });
    mock.createChildProfile.mockResolvedValue({
      profile: null,
      message: "Child profiles are unavailable for this account.",
    });
    const renderer = await mount(mock);
    await act(async () =>
      renderer.root.findByType(TextInput).props.onChangeText("Cara"),
    );
    await act(async () => button(renderer, "Add child").props.onPress());
    expect(textOf(renderer)).toMatch(/Ben Active/);
    expect(textOf(renderer)).toMatch(/unavailable for this account/);
    expect(renderer.root.findByType(TextInput).props.value).toBe("Cara");
  });

  it("requires named confirmation and changes only the selected active child", async () => {
    const mock = service();
    mock.listChildProfiles.mockResolvedValue({
      profiles: [ada, ben, { id: "old", displayName: "Cal", active: false }],
    });
    const renderer = await mount(mock);
    expect(textOf(renderer)).toMatch(/Cal Deactivated/);
    expect(button(renderer, "Deactivate Cal")).toBeUndefined();
    await act(async () => button(renderer, "Deactivate Ada").props.onPress());
    expect(button(renderer, "Confirm deactivate Ada")).toBeDefined();
    expect(mock.deactivateChildProfile).not.toHaveBeenCalled();
    await act(async () => button(renderer, "Cancel").props.onPress());
    expect(mock.deactivateChildProfile).not.toHaveBeenCalled();
    await act(async () => button(renderer, "Deactivate Ada").props.onPress());
    const pending = deferred();
    mock.deactivateChildProfile.mockReturnValueOnce(pending.promise);
    act(() => button(renderer, "Confirm deactivate Ada").props.onPress());
    expect(button(renderer, "Deactivating…").props.disabled).toBe(true);
    await act(async () => button(renderer, "Deactivating…").props.onPress());
    expect(mock.deactivateChildProfile).toHaveBeenCalledTimes(1);
    await act(async () =>
      pending.resolve({ profile: { ...ada, active: false } }),
    );
    expect(textOf(renderer)).toMatch(/Ada Deactivated/);
    expect(textOf(renderer)).toMatch(/Ben Active/);
    expect(button(renderer, "Deactivate Ada")).toBeUndefined();
  });

  it("retries a failed list and keeps safe state on a denied deactivation", async () => {
    const mock = service();
    mock.listChildProfiles
      .mockResolvedValueOnce({
        profiles: null,
        message: "Child profiles are unavailable.",
      })
      .mockResolvedValueOnce({ profiles: [ada] });
    const renderer = await mount(mock);
    expect(textOf(renderer)).toMatch(/Child profiles are unavailable/);
    expect(textOf(renderer)).not.toMatch(/opaque-ada/);
    await act(async () => button(renderer, "Try again").props.onPress());
    expect(textOf(renderer)).toMatch(/Ada Active/);
    mock.deactivateChildProfile.mockResolvedValue({
      profile: null,
      message: "Child profiles are unavailable for this account.",
    });
    await act(async () => button(renderer, "Deactivate Ada").props.onPress());
    await act(async () =>
      button(renderer, "Confirm deactivate Ada").props.onPress(),
    );
    expect(textOf(renderer)).toMatch(/Ada Active/);
    expect(textOf(renderer)).toMatch(/unavailable for this account/);
  });
});
