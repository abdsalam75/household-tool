import { encodeQr } from "../src/household/qrCode";

describe("parent invitation QR encoding", () => {
  it("creates a square Model 2 matrix deterministically from the exact URL", () => {
    const url =
      "https://invite.example.test/parent?token=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
    const matrix = encodeQr(url);
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    expect(matrix).toEqual(encodeQr(url));
    expect(matrix).not.toEqual(encodeQr(`${url}x`));
  });

  it("rejects non-URL-sized and non-ASCII payloads", () => {
    expect(() => encodeQr(`https://example.test/${"a".repeat(1000)}`)).toThrow(
      /too long/,
    );
    expect(() => encodeQr("https://example.test/é")).toThrow(/ASCII/);
  });
});
