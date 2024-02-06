#include <stdint.h>

////////////////////////////////////////////////////////////////////////////////

#define ACCESS_COEF(ptr, offset) (*(ptr + offset))
#define ACCESS_A0(ptr) ACCESS_COEF(ptr, 0)
#define ACCESS_A1(ptr) ACCESS_COEF(ptr, 1)
#define ACCESS_A2(ptr) ACCESS_COEF(ptr, 2)
#define ACCESS_A3(ptr) ACCESS_COEF(ptr, 3)
#define ACCESS_B1(ptr) ACCESS_COEF(ptr, 4)
#define ACCESS_B2(ptr) ACCESS_COEF(ptr, 5)
#define ACCESS_LEFT_CORNER(ptr) ACCESS_COEF(ptr, 6)
#define ACCESS_RIGHT_CORNER(ptr) ACCESS_COEF(ptr, 7)

// We should use exp implementation from JS
extern double exp();


void __build_gaussian_coefs(float radius, float* coefs) {
    double a = 1.6939718862199047 / radius;
    double g1 = exp(-a);
    double g2 = exp(-2 * a);
    double k = (1 - g1) * (1 - g1) / (1 + 2 * a * g1 - g2);

    double a0 = k;
    double a1 = k * (a - 1) * g1;
    double a2 = k * (a + 1) * g1;
    double a3 = -k * g2;
    double b1 = 2 * g1;
    double b2 = -g2;
    double left_corner = (a0 + a1) / (1 - b1 - b2);
    double right_corner = (a2 + a3) / (1 - b1 - b2);

    ACCESS_A0(coefs) = a0;
    ACCESS_A1(coefs) = a1;
    ACCESS_A2(coefs) = a2;
    ACCESS_A3(coefs) = a3;
    ACCESS_B1(coefs) = b1;
    ACCESS_B2(coefs) = b2;
    ACCESS_LEFT_CORNER(coefs) = left_corner;
    ACCESS_RIGHT_CORNER(coefs) = right_corner;
}


void __gauss16_line(uint16_t* src, uint16_t* out, float* line,
                  float* coefs, uint32_t width, uint32_t height) {
    float a0 = ACCESS_A0(coefs);
    float a1 = ACCESS_A1(coefs);
    float a2 = ACCESS_A2(coefs);
    float a3 = ACCESS_A3(coefs);
    float b1 = ACCESS_B1(coefs);
    float b2 = ACCESS_B2(coefs);

    double prev_src;
    double curr_src;
    double curr_out;
    double prev_out;
    double prev_prev_out;

    // left to right
    prev_src = (double)(*src);
    prev_prev_out = prev_src * ACCESS_LEFT_CORNER(coefs);
    prev_out = prev_prev_out;

    for (int32_t i = width - 1; i >= 0; i--) {
        curr_src = (double)(*src++);

        curr_out = curr_src * a0 + prev_src * a1 +
                   prev_out * b1 + prev_prev_out * b2;

        prev_prev_out = prev_out;
        prev_out = curr_out;
        prev_src = curr_src;

        *line = prev_out;
        line++;
    }

    src--;
    line--;
    out += height * (width - 1);

    // right to left
    prev_src = (double)(*src);
    prev_prev_out = prev_src * ACCESS_RIGHT_CORNER(coefs);
    prev_out = prev_prev_out;
    curr_src = prev_src;

    for (int32_t i = width - 1; i >= 0; i--) {
        curr_out = curr_src * a2 + prev_src * a3 +
                   prev_out * b1 + prev_prev_out * b2;

        prev_prev_out = prev_out;
        prev_out = curr_out;

        prev_src = curr_src;
        curr_src = (double)(*src--);

        *out = (*line--) + prev_out;
        out -= height;
    }
}


void blurMono16(uint32_t offset_src, uint32_t offset_out, uint32_t offset_tmp_out, uint32_t offset_line,
              uint32_t offset_coefs, uint32_t width, uint32_t height, float radius) {
    uint8_t* memory = 0;
    uint16_t* src = (uint16_t*)(memory + offset_src);
    uint16_t* out = (uint16_t*)(memory + offset_out);
    uint16_t* tmp_out = (uint16_t*)(memory + offset_tmp_out);
    float* tmp_line = (float*)(memory + offset_line);
    float* coefs = (float*)(memory + offset_coefs);

    // Quick exit on zero radius
    if (!radius) return;

    if (radius < 0.5) radius = 0.5;

    __build_gaussian_coefs(radius, coefs);

    int line;
    uint16_t* src_line_offset;
    uint16_t* out_col_offset;

    // Horizontal pass + transpose image
    for(line = 0; line < height; line++) {
        src_line_offset = src + line * width;
        out_col_offset = tmp_out + line;
        __gauss16_line(src_line_offset, out_col_offset, tmp_line, coefs, width, height);
    }

    // Vertical pass (horisontal over transposed) + transpose back
    for(line = 0; line < width; line++) {
        src_line_offset = tmp_out + line * height;
        out_col_offset = out + line;
        __gauss16_line(src_line_offset, out_col_offset, tmp_line, coefs, height, width);
    }
}

////////////////////////////////////////////////////////////////////////////////

#define R(x) ((uint8_t)(x))
#define G(x) ((uint8_t)((x) >> 8))
#define B(x) ((uint8_t)((x) >> 16))
#define Max(r, g, b) (uint16_t)(((r >= g && r >= b) ? r : (g >= b && g >= r) ? g : b) << 8);

void hsv_v16(uint32_t offset_src, uint32_t offset_dst, uint32_t width, uint32_t height) {
    uint8_t* memory = 0;
    uint32_t size = width * height;
    uint32_t limit = size - 3;
    uint32_t* src = (uint32_t*)(memory + offset_src);
    uint16_t* dst = (uint16_t*)(memory + offset_dst);

    uint32_t rgba;

    while (size--) {
        rgba = *src++;
        *dst++ = Max(R(rgba), G(rgba), B(rgba));
    }
}

////////////////////////////////////////////////////////////////////////////////

void unsharp(uint32_t img_offset, uint32_t dst_offset, uint32_t brightness_offset, uint32_t blur_offset,
             uint32_t width, uint32_t height, uint32_t amount, uint32_t threshold) {
    uint8_t* memory = 0;
    int iTimes4;
    int32_t v1 = 0;
    int32_t v2 = 0;
    uint32_t vmul = 0;
    int32_t diff = 0;
    uint32_t diffabs = 0;
    int32_t amountFp = ((float)amount * 0x1000 / 100 + 0.5);
    uint32_t thresholdFp = threshold << 8;
    uint32_t size = width * height;
    uint32_t i = 0;
    uint8_t* img = memory + img_offset;
    uint8_t* dst = memory + dst_offset;
    uint16_t* brightness = (uint16_t*)(memory + brightness_offset);
    uint16_t* blured = (uint16_t*)(memory + blur_offset);

    for (; i < size; ++i) {
        v1 = brightness[i];
        diff = v1 - blured[i];
        diffabs = diff < 0 ? -diff : diff;

        if (diffabs >= thresholdFp) {
            // add unsharp mask to the brightness channel
            v2 = v1 + ((amountFp * diff + 0x800) >> 12);

            // Both v1 and v2 are within [0.0 .. 255.0] (0000-FF00) range, never going into
            // [255.003 .. 255.996] (FF01-FFFF). This allows to round this value as (x+.5)|0
            // later without overflowing.
            v2 = v2 > 0xff00 ? 0xff00 : v2;
            v2 = v2 < 0x0000 ? 0x0000 : v2;

            // Avoid division by 0. V=0 means rgb(0,0,0), unsharp with unsharpAmount>0 cannot
            // change this value (because diff between colors gets inflated), so no need to verify correctness.
            v1 = v1 != 0 ? v1 : 1;

            // Multiplying V in HSV model by a constant is equivalent to multiplying each component
            // in RGB by the same constant (same for HSL), see also:
            // https://beesbuzz.biz/code/16-hsv-color-transforms
            vmul = ((v2 << 12) / v1)|0;

            // Result will be in [0..255] range because:
            //  - all numbers are positive
            //  - r,g,b <= (v1/256)
            //  - r,g,b,(v1/256),(v2/256) <= 255
            // So highest this number can get is X*255/X+0.5=255.5 which is < 256 and rounds down.

            iTimes4 = i * 4;
            img[iTimes4]     = (img[iTimes4]     * vmul + 0x800) >> 12; // R
            img[iTimes4 + 1] = (img[iTimes4 + 1] * vmul + 0x800) >> 12; // G
            img[iTimes4 + 2] = (img[iTimes4 + 2] * vmul + 0x800) >> 12; // B
        }
    }
}
