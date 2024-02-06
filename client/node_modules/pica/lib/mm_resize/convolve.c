#include <stdint.h>

inline uint8_t clampTo8(int32_t i) {
  return i < 0 ? 0 : (i > 255 ? 255 : i);
}

inline uint32_t clampNegative(int32_t i) {
  return i >= 0 ? i : 0;
}


#define R(x) ((uint8_t)(x))
#define G(x) ((uint8_t)((x) >> 8))
#define B(x) ((uint8_t)((x) >> 16))
#define A(x) ((uint8_t)((x) >> 24))

#define RGBA(r, g, b, a) ((r) | ((g) << 8) | ((b) << 16) | ((a) << 24))


void convolveHor(uint32_t *src, uint16_t *dest, uint32_t srcW, uint32_t srcH, uint32_t destW, int16_t *filters)
{
  int32_t  r, g, b, a;
  uint32_t filterPtr, filterShift, filterSize;
  uint32_t srcPtr, srcY, destX;
  int32_t  filterVal;
  uint32_t srcOffset = 0, destOffset = 0;
  //
  for (srcY=0; srcY < srcH; srcY++) {
    filterPtr = 0;
    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr      = srcOffset + filterShift;

      r = g = b = a = 0;
      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];
        uint32_t rgba = src[srcPtr++];

        r += filterVal * R(rgba);
        g += filterVal * G(rgba);
        b += filterVal * B(rgba);
        a += filterVal * A(rgba);
      };

      // Store 15 bits between passes for better precision
      // Instead of shift to 14 (FIXED_FRAC_BITS), shift to 7 only
      //
      dest[destOffset++] = clampNegative(r >> 7);
      dest[destOffset++] = clampNegative(g >> 7);
      dest[destOffset++] = clampNegative(b >> 7);
      dest[destOffset++] = clampNegative(a >> 7);
      destOffset += srcH * 4 - 4;
    };
    destOffset = (srcY + 1) * 4;
    srcOffset  = (srcY + 1) * srcW;
  };
}


void convolveVert(uint16_t *src, uint32_t *dest, uint32_t srcW, uint32_t srcH, uint32_t destW, int16_t *filters)
{
  int32_t  r, g, b, a;
  uint32_t filterPtr, filterShift, filterSize;
  uint32_t srcPtr, srcY, destX;
  int32_t  filterVal;
  uint32_t srcOffset = 0, destOffset = 0;
  //
  for (srcY=0; srcY < srcH; srcY++) {
    filterPtr = 0;

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = srcOffset + filterShift*4;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        r += filterVal * src[srcPtr++];
        g += filterVal * src[srcPtr++];
        b += filterVal * src[srcPtr++];
        a += filterVal * src[srcPtr++];
      };

      // Sync with premultiplied version for exact result match
      r >>= 7;
      g >>= 7;
      b >>= 7;
      a >>= 7;

      // Bring this value back in range + round result.
      //
      dest[destOffset] = RGBA(
        clampTo8((r + (1 << 13)) >> 14),
        clampTo8((g + (1 << 13)) >> 14),
        clampTo8((b + (1 << 13)) >> 14),
        clampTo8((a + (1 << 13)) >> 14)
      );
      destOffset += srcH;
    };
    destOffset = srcY + 1;
    srcOffset  = (srcY + 1) * srcW * 4;
  };
}


void convolveHorWithPre(uint32_t *src, uint16_t *dest, uint32_t srcW, uint32_t srcH, uint32_t destW, int16_t *filters)
{
  int32_t  r, g, b, a;
  uint32_t filterPtr, filterShift, filterSize;
  uint32_t srcPtr, srcY, destX;
  int32_t  filterVal;
  uint32_t srcOffset = 0, destOffset = 0;
  //
  for (srcY=0; srcY < srcH; srcY++) {
    filterPtr = 0;
    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr      = srcOffset + filterShift;

      r = g = b = a = 0;
      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];
        uint32_t rgba = src[srcPtr++];

        uint8_t alpha = A(rgba);

        r += filterVal * alpha * R(rgba);
        g += filterVal * alpha * G(rgba);
        b += filterVal * alpha * B(rgba);
        a += filterVal * alpha;
      };

      // Premultiply is (* alpha / 255).
      // Postpone division for better performance
      r /= 255;
      g /= 255;
      b /= 255;

      // Store 15 bits between passes for better precision
      // Instead of shift to 14 (FIXED_FRAC_BITS), shift to 7 only
      //
      dest[destOffset++] = clampNegative(r >> 7);
      dest[destOffset++] = clampNegative(g >> 7);
      dest[destOffset++] = clampNegative(b >> 7);
      dest[destOffset++] = clampNegative(a >> 7);
      destOffset += srcH * 4 - 4;
    };
    destOffset = (srcY + 1) * 4;
    srcOffset  = (srcY + 1) * srcW;
  };
}


void convolveVertWithPre(uint16_t *src, uint32_t *dest, uint32_t srcW, uint32_t srcH, uint32_t destW, int16_t *filters)
{
  int32_t  r, g, b, a;
  uint32_t filterPtr, filterShift, filterSize;
  uint32_t srcPtr, srcY, destX;
  int32_t  filterVal;
  uint32_t srcOffset = 0, destOffset = 0;
  //
  for (srcY=0; srcY < srcH; srcY++) {
    filterPtr = 0;

    // Apply precomputed filters to each destination row point
    for (destX = 0; destX < destW; destX++) {
      // Get the filter that determines the current output pixel.
      filterShift = filters[filterPtr++];
      filterSize  = filters[filterPtr++];

      srcPtr = srcOffset + filterShift*4;

      r = g = b = a = 0;

      // Apply the filter to the row to get the destination pixel r, g, b, a
      for (; filterSize > 0; filterSize--) {
        filterVal = filters[filterPtr++];

        r += filterVal * src[srcPtr++];
        g += filterVal * src[srcPtr++];
        b += filterVal * src[srcPtr++];
        a += filterVal * src[srcPtr++];
      };

      // Downscale to leave room for un-premultiply
      r >>= 7;
      g >>= 7;
      b >>= 7;
      a >>= 7;

      // Un-premultiply
      a = clampTo8((a + (1 << 13)) >> 14);
      if (a > 0) {
        r = r * 255 / a;
        g = g * 255 / a;
        b = b * 255 / a;
      }

      // Bring this value back in range + round result.
      // Shift value = FIXED_FRAC_BITS + 7
      //
      dest[destOffset] = RGBA(
        clampTo8((r + (1 << 13)) >> 14),
        clampTo8((g + (1 << 13)) >> 14),
        clampTo8((b + (1 << 13)) >> 14),
        a
      );
      destOffset += srcH;
    };
    destOffset = srcY + 1;
    srcOffset  = (srcY + 1) * srcW * 4;
  };
}


void convolveHV(uint32_t filtersX_offset,
                uint32_t filtersY_offset,
                uint32_t tmp_offset,
                uint32_t srcW,
                uint32_t srcH,
                uint32_t destW,
                uint32_t destH,
                uint8_t has_alpha)
{
  uint8_t  *memory  = 0;

  uint32_t *src     = (uint32_t *)memory;
  uint16_t *tmp     = (uint16_t *)(memory + tmp_offset);
  int16_t  *filterX = (int16_t *)(memory + filtersX_offset);
  int16_t  *filterY = (int16_t *)(memory + filtersY_offset);

  if (has_alpha) {
    convolveHorWithPre(src, tmp, srcW, srcH, destW, filterX);
    convolveVertWithPre(tmp, src, srcH, destW, destH, filterY);
  } else {
    convolveHor(src, tmp, srcW, srcH, destW, filterX);
    convolveVert(tmp, src, srcH, destW, destH, filterY);
  }
}
