import {
  FALLBACK_TIME_ZONE,
  isRuntimeNamedTimeZone,
  proposeDeviceTimeZone,
} from "../src/household/timeZone";

describe("household time-zone proposal", () => {
  it("proposes a device-resolved named IANA zone for review", () => {
    expect(proposeDeviceTimeZone("Africa/Lagos")).toEqual({
      timeZone: "Africa/Lagos",
      usedFallback: false,
    });
  });

  it.each([null, "", "+01:00", "UTC-0500", "Unknown/Nowhere"])(
    "uses an editable named fallback for unsupported device value %s",
    (zone) => {
      const proposal = proposeDeviceTimeZone(zone);

      expect(proposal.timeZone).toBe(FALLBACK_TIME_ZONE);
      expect(proposal.usedFallback).toBe(true);
      expect(proposal.message).toMatch(/review|replace/i);
    },
  );

  it("recognizes named zones, including a daylight-saving-observing zone", () => {
    expect(isRuntimeNamedTimeZone("America/New_York")).toBe(true);
    expect(isRuntimeNamedTimeZone("Etc/UTC")).toBe(true);
    expect(isRuntimeNamedTimeZone("+05:30")).toBe(false);
  });
});
