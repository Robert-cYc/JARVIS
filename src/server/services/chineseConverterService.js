/**
 * J.A.R.V.I.S. Neural Linguistic Engine — Simplified to Traditional Chinese Converter
 * Built using the standard OpenCC character dictionary (3,800+ character mappings).
 * Converts simplified characters deterministically into Taiwanese Traditional Chinese (正體中文).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DICT_PATH = path.resolve(__dirname, '../resources/st_dict.json');

/** @type {Record<string, string>} */
let ST_DICT = {};
try {
  if (fs.existsSync(DICT_PATH)) {
    const content = fs.readFileSync(DICT_PATH, 'utf-8');
    ST_DICT = JSON.parse(content);
  }
} catch {
  ST_DICT = {};
}

/**
 * Converts Simplified Chinese characters in a string to Traditional Chinese (zh-TW).
 * Preserves Latin characters, digits, punctuation, and existing Traditional Chinese.
 * @param {string} text
 * @returns {string}
 */
export function toTraditionalChinese(text) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    result += ST_DICT[char] || char;
  }
  return result;
}
