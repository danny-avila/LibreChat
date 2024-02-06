// Resize convolvers, pure JS implementation
//
'use strict';


// Precision of fixed FP values
//var FIXED_FRAC_BITS = 14;


function clampTo8(i) { return i < 0 ? 0 : (i > 255 ? 255 : i); }
function clampNegative(i) { return i >= 0 ? i : 0; }

// Convolve image data in horizontal direction. Can be used for:
//
// 1. bitmap with premultiplied alpha
// 2. bitmap without alpha (all values 255)
//
// Notes:
//
// - output is transposed
// - output resolution is ~15 bits per channel(for better precision).
//
function convolveHor(src, dest, srcW, srcH, destW, filters) {

  var r, g, b, a;
  var filterPtr, filterShift, filterSize;
  var srcPtr, srcY, destX, filterVal;
  var srcOffset = 0, destOffset = 0;

  // For each row
  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr  = 0;

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = (srcOffset + (filterShift * 4))|0;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        // Use reverse order to workaround deopts in old v8 (node v.10)
        // Big thanks to @mraleph (Vyacheslav Egorov) for the tip.
        a = (a + filterVal * src[srcPtr + 3])|0;
        b = (b + filterVal * src[srcPtr + 2])|0;
        g = (g + filterVal * src[srcPtr + 1])|0;
        r = (r + filterVal * src[srcPtr])|0;
        srcPtr = (srcPtr + 4)|0;
      }

      // Store 15 bits between passes for better precision
      // Instead of shift to 14 (FIXED_FRAC_BITS), shift to 7 only
      //
      dest[destOffset + 3] = clampNegative(a >> 7);
      dest[destOffset + 2] = clampNegative(b >> 7);
      dest[destOffset + 1] = clampNegative(g >> 7);
      dest[destOffset]     = clampNegative(r >> 7);
      destOffset = (destOffset + srcH * 4)|0;
    }

    destOffset = ((srcY + 1) * 4)|0;
    srcOffset  = ((srcY + 1) * srcW * 4)|0;
  }
}

// Supplementary method for `convolveHor()`
//
function convolveVert(src, dest, srcW, srcH, destW, filters) {

  var r, g, b, a;
  var filterPtr, filterShift, filterSize;
  var srcPtr, srcY, destX, filterVal;
  var srcOffset = 0, destOffset = 0;

  // For each row
  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr  = 0;

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = (srcOffset + (filterShift * 4))|0;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        // Use reverse order to workaround deopts in old v8 (node v.10)
        // Big thanks to @mraleph (Vyacheslav Egorov) for the tip.
        a = (a + filterVal * src[srcPtr + 3])|0;
        b = (b + filterVal * src[srcPtr + 2])|0;
        g = (g + filterVal * src[srcPtr + 1])|0;
        r = (r + filterVal * src[srcPtr])|0;
        srcPtr = (srcPtr + 4)|0;
      }

      // Sync with premultiplied version for exact result match
      r >>= 7;
      g >>= 7;
      b >>= 7;
      a >>= 7;

      // Bring this value back in range + round result.
      //
      dest[destOffset + 3] = clampTo8((a + (1 << 13)) >> 14);
      dest[destOffset + 2] = clampTo8((b + (1 << 13)) >> 14);
      dest[destOffset + 1] = clampTo8((g + (1 << 13)) >> 14);
      dest[destOffset]     = clampTo8((r + (1 << 13)) >> 14);
      destOffset = (destOffset + srcH * 4)|0;
    }

    destOffset = ((srcY + 1) * 4)|0;
    srcOffset  = ((srcY + 1) * srcW * 4)|0;
  }
}


// Premultiply & convolve image data in horizontal direction. Can be used for:
//
// - Any bitmap data, extracted with `.getImageData()` method (with
//   non-premultiplied alpha)
//
// For images without alpha channel this method is slower than `convolveHor()`
//
function convolveHorWithPre(src, dest, srcW, srcH, destW, filters) {

  var r, g, b, a, alpha;
  var filterPtr, filterShift, filterSize;
  var srcPtr, srcY, destX, filterVal;
  var srcOffset = 0, destOffset = 0;

  // For each row
  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr  = 0;

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = (srcOffset + (filterShift * 4))|0;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        // Use reverse order to workaround deopts in old v8 (node v.10)
        // Big thanks to @mraleph (Vyacheslav Egorov) for the tip.
        alpha = src[srcPtr + 3];
        a = (a + filterVal * alpha)|0;
        b = (b + filterVal * src[srcPtr + 2] * alpha)|0;
        g = (g + filterVal * src[srcPtr + 1] * alpha)|0;
        r = (r + filterVal * src[srcPtr] * alpha)|0;
        srcPtr = (srcPtr + 4)|0;
      }

      // Premultiply is (* alpha / 255).
      // Postpone division for better performance
      b = (b / 255)|0;
      g = (g / 255)|0;
      r = (r / 255)|0;

      // Store 15 bits between passes for better precision
      // Instead of shift to 14 (FIXED_FRAC_BITS), shift to 7 only
      //
      dest[destOffset + 3] = clampNegative(a >> 7);
      dest[destOffset + 2] = clampNegative(b >> 7);
      dest[destOffset + 1] = clampNegative(g >> 7);
      dest[destOffset]     = clampNegative(r >> 7);
      destOffset = (destOffset + srcH * 4)|0;
    }

    destOffset = ((srcY + 1) * 4)|0;
    srcOffset  = ((srcY + 1) * srcW * 4)|0;
  }
}

// Supplementary method for `convolveHorWithPre()`
//
function convolveVertWithPre(src, dest, srcW, srcH, destW, filters) {

  var r, g, b, a;
  var filterPtr, filterShift, filterSize;
  var srcPtr, srcY, destX, filterVal;
  var srcOffset = 0, destOffset = 0;

  // For each row
  for (srcY = 0; srcY < srcH; srcY++) {
    filterPtr  = 0;

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = (srcOffset + (filterShift * 4))|0;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        // Use reverse order to workaround deopts in old v8 (node v.10)
        // Big thanks to @mraleph (Vyacheslav Egorov) for the tip.
        a = (a + filterVal * src[srcPtr + 3])|0;
        b = (b + filterVal * src[srcPtr + 2])|0;
        g = (g + filterVal * src[srcPtr + 1])|0;
        r = (r + filterVal * src[srcPtr])|0;
        srcPtr = (srcPtr + 4)|0;
      }

      // Downscale to leave room for un-premultiply
      r >>= 7;
      g >>= 7;
      b >>= 7;
      a >>= 7;

      // Un-premultiply
      a = clampTo8((a + (1 << 13)) >> 14);
      if (a > 0) {
        r = (r * 255 / a)|0;
        g = (g * 255 / a)|0;
        b = (b * 255 / a)|0;
      }

      // Bring this value back in range + round result.
      // Shift value = FIXED_FRAC_BITS + 7
      //
      dest[destOffset + 3] = a;
      dest[destOffset + 2] = clampTo8((b + (1 << 13)) >> 14);
      dest[destOffset + 1] = clampTo8((g + (1 << 13)) >> 14);
      dest[destOffset]     = clampTo8((r + (1 << 13)) >> 14);
      destOffset = (destOffset + srcH * 4)|0;
    }

    destOffset = ((srcY + 1) * 4)|0;
    srcOffset  = ((srcY + 1) * srcW * 4)|0;
  }
}


module.exports = {
  convolveHor,
  convolveVert,
  convolveHorWithPre,
  convolveVertWithPre
};
