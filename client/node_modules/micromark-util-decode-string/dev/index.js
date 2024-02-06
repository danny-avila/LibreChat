import {decodeNamedCharacterReference} from 'decode-named-character-reference'
import {decodeNumericCharacterReference} from 'micromark-util-decode-numeric-character-reference'
import {codes} from 'micromark-util-symbol/codes.js'
import {constants} from 'micromark-util-symbol/constants.js'

const characterEscapeOrReference =
  /\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi

/**
 * Decode markdown strings (which occur in places such as fenced code info
 * strings, destinations, labels, and titles).
 *
 * The “string” content type allows character escapes and -references.
 * This decodes those.
 *
 * @param {string} value
 *   Value to decode.
 * @returns {string}
 *   Decoded value.
 */
export function decodeString(value) {
  return value.replace(characterEscapeOrReference, decode)
}

/**
 * @param {string} $0
 * @param {string} $1
 * @param {string} $2
 * @returns {string}
 */
function decode($0, $1, $2) {
  if ($1) {
    // Escape.
    return $1
  }

  // Reference.
  const head = $2.charCodeAt(0)

  if (head === codes.numberSign) {
    const head = $2.charCodeAt(1)
    const hex = head === codes.lowercaseX || head === codes.uppercaseX
    return decodeNumericCharacterReference(
      $2.slice(hex ? 2 : 1),
      hex ? constants.numericBaseHexadecimal : constants.numericBaseDecimal
    )
  }

  return decodeNamedCharacterReference($2) || $0
}
