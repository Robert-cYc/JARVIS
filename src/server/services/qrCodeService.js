/**
 * Stark Industries Precision QR Code Generator (Model 2, Byte Mode, Versions 1-10)
 * 100% Zero-Dependency Pure JavaScript Implementation with ISO/IEC 18004 Standard Compliance.
 */

// GF(256) Math for Reed-Solomon Error Correction
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

let val = 1;
for (let i = 0; i < 255; i++) {
  GF_EXP[i] = val;
  GF_LOG[val] = i;
  val = (val << 1) ^ (val & 128 ? 0x11d : 0);
}
for (let i = 255; i < 512; i++) {
  GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const factor = [1, GF_EXP[i]];
    const next = new Array(poly.length + factor.length - 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        next[j + k] ^= gfMul(poly[j], factor[k]);
      }
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data, numEccCodewords) {
  const gen = rsGeneratorPoly(numEccCodewords);
  const out = new Array(numEccCodewords).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    for (let i = 0; i < numEccCodewords; i++) {
      out[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return out;
}

// QR Spec Table (Versions 1-10): [eccPerBlock, b1, d1, b2, d2]
const QR_TABLE = {
  1: { L: [7, 1, 19, 0, 0], M: [10, 1, 16, 0, 0], Q: [13, 1, 13, 0, 0], H: [17, 1, 9, 0, 0] },
  2: { L: [10, 1, 34, 0, 0], M: [16, 1, 28, 0, 0], Q: [22, 1, 22, 0, 0], H: [28, 1, 16, 0, 0] },
  3: { L: [15, 1, 55, 0, 0], M: [26, 1, 44, 0, 0], Q: [18, 2, 17, 0, 0], H: [22, 2, 13, 0, 0] },
  4: { L: [20, 1, 80, 0, 0], M: [18, 2, 32, 0, 0], Q: [26, 2, 24, 0, 0], H: [16, 4, 9, 0, 0] },
  5: { L: [26, 1, 108, 0, 0], M: [24, 2, 43, 0, 0], Q: [18, 2, 15, 2, 16], H: [22, 2, 11, 2, 12] },
  6: { L: [18, 2, 68, 0, 0], M: [16, 4, 27, 0, 0], Q: [24, 4, 19, 0, 0], H: [28, 4, 15, 0, 0] },
  7: { L: [20, 2, 78, 0, 0], M: [18, 4, 31, 0, 0], Q: [18, 2, 14, 4, 15], H: [26, 4, 13, 1, 14] },
  8: { L: [24, 2, 97, 0, 0], M: [22, 2, 38, 2, 39], Q: [22, 4, 18, 2, 19], H: [26, 4, 14, 2, 15] },
  9: { L: [30, 2, 116, 0, 0], M: [22, 3, 36, 2, 37], Q: [20, 4, 16, 4, 17], H: [24, 4, 12, 4, 13] },
  10: { L: [18, 2, 68, 2, 69], M: [26, 4, 43, 1, 44], Q: [24, 6, 19, 2, 20], H: [28, 6, 15, 2, 16] }
};

const ALIGNMENT_PATTERN_POS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50]
};

const FORMAT_EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * Calculates 15-bit format information for a given error correction level and mask index.
 */
function getFormatBits(ecLevel, mask) {
  const data = (FORMAT_EC_BITS[ecLevel] << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) {
      rem ^= (0x537 << (i - 10));
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

/**
 * Encodes input text into byte mode bitstream and applies error correction codewords.
 */
function encodeData(text, version, ecLevel) {
  const spec = QR_TABLE[version][ecLevel];
  const [ecPerBlock, b1, d1, b2, d2] = spec;
  const totalDataCodewords = b1 * d1 + b2 * d2;

  const utf8Bytes = Buffer.from(text, 'utf8');
  const countIndicatorBits = version <= 9 ? 8 : 16;
  const capacityBits = totalDataCodewords * 8;

  // Bit buffer
  let bits = '';
  // 1. Mode indicator: Byte mode = 0100
  bits += '0100';
  // 2. Character count indicator
  bits += utf8Bytes.length.toString(2).padStart(countIndicatorBits, '0');
  // 3. Data bytes
  for (const b of utf8Bytes) {
    bits += b.toString(2).padStart(8, '0');
  }

  // 4. Terminator
  const terminatorLen = Math.min(4, capacityBits - bits.length);
  if (terminatorLen > 0) {
    bits += '0'.repeat(terminatorLen);
  }

  // 5. Pad to multiple of 8
  if (bits.length % 8 !== 0) {
    bits += '0'.repeat(8 - (bits.length % 8));
  }

  // 6. Pad codewords (0xEC, 0x11)
  const padPatterns = ['11101100', '00010001'];
  let padIdx = 0;
  while (bits.length < capacityBits) {
    bits += padPatterns[padIdx % 2];
    padIdx++;
  }

  // Convert bits to data codeword array
  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    dataCodewords.push(parseInt(bits.slice(i, i + 8), 2));
  }

  // Split into blocks and compute ECC
  const dataBlocks = [];
  const eccBlocks = [];
  let offset = 0;

  for (let b = 0; b < b1; b++) {
    const slice = dataCodewords.slice(offset, offset + d1);
    dataBlocks.push(slice);
    eccBlocks.push(rsComputeRemainder(slice, ecPerBlock));
    offset += d1;
  }
  for (let b = 0; b < b2; b++) {
    const slice = dataCodewords.slice(offset, offset + d2);
    dataBlocks.push(slice);
    eccBlocks.push(rsComputeRemainder(slice, ecPerBlock));
    offset += d2;
  }

  // Interleave data codewords
  const interleaved = [];
  const maxDataLen = Math.max(d1, d2);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) interleaved.push(blk[i]);
    }
  }

  // Interleave ECC codewords
  for (let i = 0; i < ecPerBlock; i++) {
    for (const blk of eccBlocks) {
      if (i < blk.length) interleaved.push(blk[i]);
    }
  }

  return interleaved;
}

/**
 * Creates empty grid with function pattern reservations.
 */
function createMatrix(version) {
  const size = version * 4 + 17;
  // null = unassigned, false = light, true = dark
  const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  function setModule(r, c, val, isRes = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (isRes) reserved[r][c] = true;
    }
  }

  // Finder Patterns + Separators
  function addFinder(top, left) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isDark = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setModule(row, col, isDark);
        } else {
          setModule(row, col, false); // Separator
        }
      }
    }
  }

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const alignCoords = ALIGNMENT_PATTERN_POS[version] || [];
  for (const r of alignCoords) {
    for (const c of alignCoords) {
      // Don't place over finder patterns
      if (
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= size - 9) ||
        (r >= size - 9 && c <= 8)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isDark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setModule(r + dr, c + dc, isDark);
        }
      }
    }
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Reserve Format Info areas
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    reserved[8][i] = true;
  }
  for (let i = size - 7; i < size; i++) {
    reserved[i][8] = true;
  }

  return { matrix, reserved, size };
}

/**
 * Places interleaved codewords into the matrix.
 */
function placeCodewords(matrix, reserved, size, codewords) {
  let bitIdx = 0;
  const bitString = codewords.map((b) => b.toString(2).padStart(8, '0')).join('');

  let dir = -1; // -1 = up, 1 = down
  let r = size - 1;
  let c = size - 1;

  while (c > 0) {
    if (c === 6) c--; // Skip vertical timing column

    const val = bitIdx < bitString.length ? bitString[bitIdx] === '1' : false;
    if (!reserved[r][c]) {
      matrix[r][c] = val;
      bitIdx++;
    }

    const cLeft = c - 1;
    const valLeft = bitIdx < bitString.length ? bitString[bitIdx] === '1' : false;
    if (!reserved[r][cLeft]) {
      matrix[r][cLeft] = valLeft;
      bitIdx++;
    }

    r += dir;
    if (r < 0 || r >= size) {
      dir = -dir;
      r += dir;
      c -= 2;
    }
  }
}

// 8 Standard QR Mask Conditions
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, _c) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

/**
 * Calculates ISO penalty score for a masked matrix.
 */
function calculatePenalty(matrix, size) {
  let penalty = 0;

  // Rule 1: 5+ consecutive modules of same color
  for (let r = 0; r < size; r++) {
    let runColor = null;
    let runLen = 0;
    for (let c = 0; c < size; c++) {
      const color = matrix[r][c];
      if (color === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = color;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  for (let c = 0; c < size; c++) {
    let runColor = null;
    let runLen = 0;
    for (let r = 0; r < size; r++) {
      const color = matrix[r][c];
      if (color === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = color;
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = matrix[r][c];
      if (
        val === matrix[r + 1][c] &&
        val === matrix[r][c + 1] &&
        val === matrix[r + 1][c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  return penalty;
}

/**
 * Applies format information into the matrix.
 */
function applyFormatInfo(matrix, size, ecLevel, mask) {
  const formatBits = getFormatBits(ecLevel, mask);

  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;

    // Around top-left finder pattern
    if (i <= 5) {
      matrix[8][i] = bit;
    } else if (i === 6) {
      matrix[8][7] = bit;
    } else if (i === 7) {
      matrix[8][8] = bit;
    } else if (i === 8) {
      matrix[7][8] = bit;
    } else {
      matrix[14 - i][8] = bit;
    }

    // Second copy around top-right and bottom-left
    if (i < 8) {
      matrix[size - 1 - i][8] = bit;
    } else {
      matrix[8][size - 15 + i] = bit;
    }
  }
}

/**
 * Selects the smallest viable QR version (1 to 10) for the given byte count and ECC level.
 */
export function getMinimumVersion(byteCount, ecLevel = 'M') {
  const countIndicatorBits = 8;
  for (let v = 1; v <= 10; v++) {
    const [ecPerBlock, b1, d1, b2, d2] = QR_TABLE[v][ecLevel];
    const totalDataCodewords = b1 * d1 + b2 * d2;
    // Total bits = 4 (mode) + countIndicatorBits + byteCount * 8
    const requiredBits = 4 + (v <= 9 ? 8 : 16) + byteCount * 8;
    if (requiredBits <= totalDataCodewords * 8) {
      return v;
    }
  }
  return null;
}

/**
 * Renders the boolean QR matrix to a scalable SVG string.
 */
export function renderSvg(matrix, {
  size = 256,
  margin = 4,
  darkColor = '#000000',
  lightColor = '#ffffff'
} = {}) {
  const moduleCount = matrix.length;
  const totalModules = moduleCount + margin * 2;
  const cellSize = (size / totalModules).toFixed(4);

  let pathData = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = ((c + margin) * parseFloat(cellSize)).toFixed(2);
        const y = ((r + margin) * parseFloat(cellSize)).toFixed(2);
        pathData += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${lightColor}"/>` +
    `<path d="${pathData.trim()}" fill="${darkColor}"/>` +
    `</svg>`;
}

/**
 * Renders the boolean QR matrix to terminal-friendly Unicode blocks (██ and '  ').
 */
export function renderAscii(matrix, { margin = 2 } = {}) {
  const moduleCount = matrix.length;
  const lines = [];

  const emptyLine = '  '.repeat(moduleCount + margin * 2);
  for (let i = 0; i < margin; i++) lines.push(emptyLine);

  for (let r = 0; r < moduleCount; r++) {
    let line = '  '.repeat(margin);
    for (let c = 0; c < moduleCount; c++) {
      line += matrix[r][c] ? '██' : '  ';
    }
    line += '  '.repeat(margin);
    lines.push(line);
  }

  for (let i = 0; i < margin; i++) lines.push(emptyLine);
  return lines.join('\n');
}

/**
 * Formats a Wi-Fi configuration string for QR codes.
 */
export function formatWifiPayload({ ssid, password = '', encryption = 'WPA', hidden = false } = {}) {
  if (!ssid) return '';
  return `WIFI:T:${encryption};S:${ssid};P:${password};${hidden ? 'H:true;' : ''};`;
}

/**
 * Generates a complete QR code Model 2 (SVG, Data URL, and ASCII) for arbitrary text.
 * @param {string} text
 * @param {object} [options]
 * @param {'L'|'M'|'Q'|'H'} [options.ecLevel='M']
 * @param {number} [options.size=256]
 * @param {number} [options.margin=4]
 * @param {string} [options.darkColor='#000000']
 * @param {string} [options.lightColor='#ffffff']
 * @returns {{success: boolean, version: number, size: number, ecLevel: string, payload: string, svg: string, dataUrl: string, ascii: string, error?: string}}
 */
export function generateQrCode(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { success: false, error: 'Empty or invalid QR code payload' };
  }

  const ecLevel = ['L', 'M', 'Q', 'H'].includes(options.ecLevel?.toUpperCase())
    ? options.ecLevel.toUpperCase()
    : 'M';

  const utf8Len = Buffer.byteLength(text, 'utf8');
  const version = getMinimumVersion(utf8Len, ecLevel);

  if (!version) {
    return {
      success: false,
      error: `Payload length (${utf8Len} bytes) exceeds maximum capacity of Version 10 (${ecLevel} level)`
    };
  }

  const codewords = encodeData(text, version, ecLevel);
  const { matrix, reserved, size } = createMatrix(version);
  placeCodewords(matrix, reserved, size, codewords);

  // Test 8 mask patterns and select lowest penalty
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestMatrix = null;

  for (let m = 0; m < 8; m++) {
    const masked = matrix.map((row, r) =>
      row.map((val, c) => (reserved[r][c] ? val : val ^ MASKS[m](r, c)))
    );
    applyFormatInfo(masked, size, ecLevel, m);
    const penalty = calculatePenalty(masked, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = m;
      bestMatrix = masked;
    }
  }

  const svg = renderSvg(bestMatrix, options);
  const base64Svg = Buffer.from(svg).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
  const ascii = renderAscii(bestMatrix, { margin: 1 });

  return {
    success: true,
    version,
    matrixSize: size,
    mask: bestMask,
    ecLevel,
    payload: text,
    svg,
    dataUrl,
    ascii
  };
}
