import { encodeQr, type QrMatrix } from "../src/household/qrCode";

// Decode the byte payload from the version 5, level L matrix used by a
// canonical child URL. This reads the modules rather than trusting the input.
function decodeChildUrl(matrix: QrMatrix): string {
  const size = matrix.length;
  expect(size).toBe(37);
  const reserved = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) reserved[y][x] = true;
  };
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let y = -4; y <= 4; y += 1)
      for (let x = -4; x <= 4; x += 1) mark(cx + x, cy + y);
  }
  for (let i = 0; i < size; i += 1) {
    mark(i, 6);
    mark(6, i);
  }
  for (let y = 28; y <= 32; y += 1)
    for (let x = 28; x <= 32; x += 1) mark(x, y);
  for (let i = 0; i <= 5; i += 1) mark(8, i);
  mark(8, 7);
  mark(8, 8);
  mark(7, 8);
  for (let i = 9; i < 15; i += 1) mark(14 - i, 8);
  for (let i = 0; i < 8; i += 1) mark(size - 1 - i, 8);
  for (let i = 8; i < 15; i += 1) mark(8, size - 15 + i);
  mark(8, size - 8);

  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (!reserved[y][x])
          bits.push(Number(matrix[y][x] !== ((x + y) % 2 === 0)));
      }
    }
  }
  const data = Array.from({ length: 108 }, (_, byte) =>
    bits
      .slice(byte * 8, byte * 8 + 8)
      .reduce((value, bit) => (value << 1) | bit, 0),
  );
  const read = (offset: number, length: number) => {
    let result = 0;
    for (let bit = offset; bit < offset + length; bit += 1)
      result = (result << 1) | ((data[bit >>> 3] >>> (7 - (bit & 7))) & 1);
    return result;
  };
  expect(read(0, 4)).toBe(0b0100);
  const length = read(4, 8);
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(read(12 + index * 8, 8)),
  ).join("");
}

it("decodes the same canonical child URL that copy and share use", () => {
  const token = "Z".repeat(43);
  const url = `https://invite.example.test/invitations/child?token=${token}`;
  expect(decodeChildUrl(encodeQr(url))).toBe(url);
  expect([...new URL(url).searchParams]).toEqual([["token", token]]);
});
