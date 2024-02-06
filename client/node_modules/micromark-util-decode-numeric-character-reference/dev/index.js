import {codes} from 'micromark-util-symbol/codes.js'
import {values} from 'micromark-util-symbol/values.js'

/**
 * Turn the number (in string form as either hexa- or plain decimal) coming from
 * a numeric character reference into a character.
 *
 * Sort of like `String.fromCharCode(Number.parseInt(value, base))`, but makes
 * non-characters and control characters safe.
 *
 * @param {string} value
 *   Value to decode.
 * @param {number} base
 *   Numeric base.
 * @returns {string}
 *   Character.
 */
export function decodeNumericCharacterReference(value, base) {
  const code = Number.parseInt(value, base)

  if (
    // C0 except for HT, LF, FF, CR, space.
    code < codes.ht ||
    code === codes.vt ||
    (code > codes.cr && code < codes.space) ||
    // Control character (DEL) of C0, and C1 controls.
    (code > codes.tilde && code < 160) ||
    // Lone high surrogates and low surrogates.
    (code > 55295 && code < 57344) ||
    // Noncharacters.
    (code > 64975 && code < 65008) ||
    /* eslint-disable no-bitwise */
    (code & 65535) === 65535 ||
    (code & 65535) === 65534 ||
    /* eslint-enable no-bitwise */
    // Out of range
    code > 1114111
  ) {
    return values.replacementCharacter
  }

  return String.fromCharCode(code)
}
