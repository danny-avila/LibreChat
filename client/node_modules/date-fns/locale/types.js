"use strict"; /* eslint-disable no-unused-vars */

/**
 * The locale object with all functions and data needed to parse and format
 * dates. This is what each locale implements and exports.
 */

/**
 * The locale options.
 */

/// Format distance types

/**
 * The function that takes a token (i.e. halfAMinute) passed by `formatDistance`
 * or `formatDistanceStrict` and payload, and returns localized distance.
 *
 * @param token - The token to localize
 * @param count - The distance number
 * @param options - The object with options
 *
 * @returns The localized distance in words
 */

/**
 * The {@link FormatDistanceFn} function options.
 */

/**
 * The function used inside the {@link FormatDistanceFn} function, implementing
 * formatting for a particular token.
 */

/**
 * The tokens map to string templates used in the format distance function.
 * It looks like this:
 *
 *   const formatDistanceLocale: FormatDistanceLocale<FormatDistanceTokenValue> = {
 *     lessThanXSeconds: 'តិចជាង {{count}} វិនាទី',
 *     xSeconds: '{{count}} វិនាទី',
 *     // ...
 *   }
 *
 * @typeParam Template - The property value type.
 */

/**
 * The token used in the format distance function. Represents the distance unit
 * with prespecified precision.
 */

/// Format relative types

/**
 * The locale function that does the work for the `formatRelative` function.
 *
 * @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
 *
 * @param token - The token to localize
 * @param date - The date to format
 * @param baseDate - The date to compare with
 * @param options - The object with options
 *
 * @returns The localized relative date format
 */

/**
 * The {@link FormatRelativeFn} function options.
 */

/**
 * The locale function used inside the {@link FormatRelativeFn} function
 * implementing formatting for a particular token.
 *
 * @typeParam DateType - The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).
 *
 * @param date - The date to format
 * @param baseDate - The date to compare with
 * @param options - The object with options
 */

/**
 * The {@link FormatRelativeTokenFn} function options.
 */

/**
 * The token used in format relative function. Represents the time unit.
 */

/**
 * A format part that represents a token or string literal, used by format parser/tokenizer
 */

/// Localize types

/**
 * The object with functions used to localize various values. Part of the public
 * locale API.
 */

/**
 * Individual localize function. Part of {@link Localize}.
 *
 * @typeParam Value - The value type to localize.
 *
 * @param value - The value to localize
 * @param options - The object with options
 *
 * @returns The localized string
 */

/**
 * The {@link LocalizeFn} function options.
 */

/// Match types

/**
 * The object with functions used to match and parse various localized values.
 */

/**
 * The match function. Part of {@link Match}. Implements matcher for particular
 * unit type.
 *
 * @typeParam Result - The matched value type.
 * @typeParam ExtraOptions - The the extra options type.
 *
 * @param str - The string to match
 * @param options - The object with options
 *
 * @returns The match result or null if match failed
 */

/**
 * The {@link MatchFn} function options.
 *
 * @typeParam Result - The matched value type.
 */

/**
 * The function that allows to map the matched value to the actual type.
 *
 * @typeParam Arg - The argument type.
 * @typeParam Result - The matched value type.
 *
 * @param arg - The value to match
 *
 * @returns The matched value
 */

/**
 * The {@link MatchFn} function result.
 *
 * @typeParam Result - The matched value type.
 */

/// Format long types

/**
 * The object with functions that return localized formats. Long stands for
 * sequence of tokens (i.e. PPpp) that allows to define how format both date
 * and time at once. Part of the public locale API.
 */

/**
 * The format long function. Formats date, time or both.
 *
 * @param options - The object with options
 *
 * @returns The localized string
 */

/**
 * The {@link FormatLongFn} function options.
 */

/**
 * The format long width token, defines how short or long the formnatted value
 * might be. The actual result length is defined by the locale.
 */

/// Common types

/**
 * The formatting unit value, represents the raw value that can be formatted.
 */

/**
 * The format width. Defines how short or long the formatted string might be.
 * The actaul result length depends on the locale.
 */

/**
 * Token representing particular period of the day.
 */

/**
 * The units commonly used in the date formatting or parsing.
 */
