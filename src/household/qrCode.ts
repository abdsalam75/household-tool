export type QrMatrix = readonly (readonly boolean[])[];

type VersionLayout = {
  dataCodewords: readonly number[];
  errorCodewords: number;
  alignment: readonly number[];
};

// QR Code Model 2, error-correction level L. Parent invitation URLs fit in
// these versions without sending their token to an external QR service.
const LAYOUTS: readonly VersionLayout[] = [
  { dataCodewords: [19], errorCodewords: 7, alignment: [] },
  { dataCodewords: [34], errorCodewords: 10, alignment: [6, 18] },
  { dataCodewords: [55], errorCodewords: 15, alignment: [6, 22] },
  { dataCodewords: [80], errorCodewords: 20, alignment: [6, 26] },
  { dataCodewords: [108], errorCodewords: 26, alignment: [6, 30] },
  { dataCodewords: [68, 68], errorCodewords: 18, alignment: [6, 34] },
  { dataCodewords: [78, 78], errorCodewords: 20, alignment: [6, 22, 38] },
  { dataCodewords: [97, 97], errorCodewords: 24, alignment: [6, 24, 42] },
  { dataCodewords: [116, 116], errorCodewords: 30, alignment: [6, 26, 46] },
  {
    dataCodewords: [68, 68, 69, 69],
    errorCodewords: 18,
    alignment: [6, 28, 50],
  },
];

function appendBits(target: number[], value: number, length: number) {
  for (let bit = length - 1; bit >= 0; bit -= 1)
    target.push((value >>> bit) & 1);
}

function asciiBytes(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) throw new Error("Invitation URL must be ASCII");
    bytes.push(code);
  }
  return bytes;
}

function multiply(left: number, right: number) {
  let result = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((right >>> bit) & 1) * left;
  }
  return result;
}

function divisor(degree: number) {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let item = 0; item < result.length; item += 1) {
      result[item] = multiply(result[item], root);
      if (item + 1 < result.length) result[item] ^= result[item + 1];
    }
    root = multiply(root, 2);
  }
  return result;
}

function remainder(data: readonly number[], generator: readonly number[]) {
  const result = Array<number>(generator.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    for (let index = 0; index < result.length; index += 1)
      result[index] ^= multiply(generator[index], factor);
  }
  return result;
}

function makeCodewords(value: string, version: number, layout: VersionLayout) {
  const bytes = asciiBytes(value);
  const capacity = layout.dataCodewords.reduce((sum, item) => sum + item, 0);
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) appendBits(bits, byte, 8);
  appendBits(bits, 0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1)
      byte = (byte << 1) | bits[offset + bit];
    data.push(byte);
  }
  for (let pad = 0; data.length < capacity; pad += 1)
    data.push(pad % 2 === 0 ? 0xec : 0x11);

  const generator = divisor(layout.errorCodewords);
  const blocks: number[][] = [];
  const checks: number[][] = [];
  let offset = 0;
  for (const blockSize of layout.dataCodewords) {
    const block = data.slice(offset, offset + blockSize);
    blocks.push(block);
    checks.push(remainder(block, generator));
    offset += blockSize;
  }

  const result: number[] = [];
  const longest = Math.max(...layout.dataCodewords);
  for (let index = 0; index < longest; index += 1)
    for (const block of blocks)
      if (index < block.length) result.push(block[index]);
  for (let index = 0; index < layout.errorCodewords; index += 1)
    for (const check of checks) result.push(check[index]);
  return result;
}

function bchRemainder(value: number, polynomial: number) {
  let result = value;
  const degree = 31 - Math.clz32(polynomial);
  while (result !== 0 && 31 - Math.clz32(result) >= degree)
    result ^= polynomial << (31 - Math.clz32(result) - degree);
  return result;
}

export function encodeQr(value: string): QrMatrix {
  const bytes = asciiBytes(value);
  const versionIndex = LAYOUTS.findIndex((layout, index) => {
    const countBits = index + 1 < 10 ? 8 : 16;
    return (
      4 + countBits + bytes.length * 8 <=
      layout.dataCodewords.reduce((sum, item) => sum + item, 0) * 8
    );
  });
  if (versionIndex < 0) throw new Error("Invitation URL is too long for QR");
  const version = versionIndex + 1;
  const layout = LAYOUTS[versionIndex];
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const functionModule = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    functionModule[y][x] = true;
  };

  for (const [centerX, centerY] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let y = -4; y <= 4; y += 1)
      for (let x = -4; x <= 4; x += 1) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        setFunction(centerX + x, centerY + y, distance !== 2 && distance !== 4);
      }
  }

  for (let index = 0; index < size; index += 1) {
    if (!functionModule[6][index]) setFunction(index, 6, index % 2 === 0);
    if (!functionModule[index][6]) setFunction(6, index, index % 2 === 0);
  }

  for (const centerY of layout.alignment)
    for (const centerX of layout.alignment) {
      if (functionModule[centerY][centerX]) continue;
      for (let y = -2; y <= 2; y += 1)
        for (let x = -2; x <= 2; x += 1)
          setFunction(
            centerX + x,
            centerY + y,
            Math.max(Math.abs(x), Math.abs(y)) !== 1,
          );
    }

  const mask = 0;
  const format = ((0b01 << 3) | mask) << 10;
  const formatBits = (format | bchRemainder(format, 0x537)) ^ 0x5412;
  for (let index = 0; index <= 5; index += 1)
    setFunction(8, index, ((formatBits >>> index) & 1) !== 0);
  setFunction(8, 7, ((formatBits >>> 6) & 1) !== 0);
  setFunction(8, 8, ((formatBits >>> 7) & 1) !== 0);
  setFunction(7, 8, ((formatBits >>> 8) & 1) !== 0);
  for (let index = 9; index < 15; index += 1)
    setFunction(14 - index, 8, ((formatBits >>> index) & 1) !== 0);
  for (let index = 0; index < 8; index += 1)
    setFunction(size - 1 - index, 8, ((formatBits >>> index) & 1) !== 0);
  for (let index = 8; index < 15; index += 1)
    setFunction(8, size - 15 + index, ((formatBits >>> index) & 1) !== 0);
  setFunction(8, size - 8, true);

  if (version >= 7) {
    const versionData = version << 12;
    const versionBits = versionData | bchRemainder(versionData, 0x1f25);
    for (let index = 0; index < 18; index += 1) {
      const dark = ((versionBits >>> index) & 1) !== 0;
      const first = size - 11 + (index % 3);
      const second = Math.floor(index / 3);
      setFunction(first, second, dark);
      setFunction(second, first, dark);
    }
  }

  const codewords = makeCodewords(value, version, layout);
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (functionModule[y][x]) continue;
        const source =
          bitIndex < codewords.length * 8
            ? ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
            : false;
        const masked = (x + y) % 2 === 0;
        modules[y][x] = source !== masked;
        bitIndex += 1;
      }
    }
  }

  return modules;
}
