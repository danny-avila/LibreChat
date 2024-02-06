"use strict";
exports.assertType = assertType;
exports.generateOffset = generateOffset;
exports.resetDefaultOptions = resetDefaultOptions;
var _index = require("./addLeadingZeros.js");
var _index2 = require("./defaultOptions.js");

function assertType(_) {}

function resetDefaultOptions() {
  (0, _index2.setDefaultOptions)({});
}

// This makes sure we create the consistent offsets across timezones, no matter where these tests are ran.
function generateOffset(originalDate) {
  // Add the timezone.
  let offset = "";
  const tzOffset = originalDate.getTimezoneOffset();

  if (tzOffset !== 0) {
    const absoluteOffset = Math.abs(tzOffset);
    const hourOffset = (0, _index.addLeadingZeros)(
      Math.trunc(absoluteOffset / 60),
      2,
    );
    const minuteOffset = (0, _index.addLeadingZeros)(absoluteOffset % 60, 2);
    // If less than 0, the sign is +, because it is ahead of time.
    const sign = tzOffset < 0 ? "+" : "-";

    offset = `${sign}${hourOffset}:${minuteOffset}`;
  } else {
    offset = "Z";
  }

  return offset;
}
