export const FALLBACK_TIME_ZONE = "Etc/UTC";

const FIXED_OFFSET =
  /^(?:[+-]\d{2}(?::?\d{2})?|(?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?)$/i;

export function isRuntimeNamedTimeZone(candidate: string): boolean {
  const zone = candidate.trim();
  if (!zone || FIXED_OFFSET.test(zone)) return false;

  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export type DeviceTimeZoneProposal = {
  timeZone: string;
  usedFallback: boolean;
  message?: string;
};

export function proposeDeviceTimeZone(
  resolvedTimeZone: string | null = Intl.DateTimeFormat().resolvedOptions()
    .timeZone,
): DeviceTimeZoneProposal {
  if (resolvedTimeZone && isRuntimeNamedTimeZone(resolvedTimeZone)) {
    return { timeZone: resolvedTimeZone, usedFallback: false };
  }

  return {
    timeZone: FALLBACK_TIME_ZONE,
    usedFallback: true,
    message:
      "We couldn’t detect a named IANA time zone. Review or replace this fallback before continuing.",
  };
}
