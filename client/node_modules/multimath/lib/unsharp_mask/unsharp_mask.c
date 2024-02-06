#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>

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
#define MinPlusMax(r, g, b) (uint16_t)((( \
            ((r >= g && r >= b) ? r : (g >= b && g >= r) ? g : b) + \
                ((r <= g && r <= b) ? r : (g <= b && g <= r) ? g : b)) * 257) >> 1);

void hsl_l16(uint32_t offset_src, uint32_t offset_dst, uint32_t width, uint32_t height) {
    uint8_t* memory = 0;
    uint32_t size = width * height;
    uint32_t limit = size - 3;
    uint32_t* src = (uint32_t*)(memory + offset_src);
    uint16_t* dst = (uint16_t*)(memory + offset_dst);

    uint32_t rgba;

    while (size--) {
        rgba = *src++;
        *dst++ = MinPlusMax(R(rgba), G(rgba), B(rgba));
    }
}

////////////////////////////////////////////////////////////////////////////////

void unsharp(uint32_t img_offset, uint32_t dst_offset, uint32_t lightness_offset, uint32_t blur_offset,
             uint32_t width, uint32_t height, uint32_t amount, uint32_t threshold) {
    uint8_t* memory = 0;
    uint8_t r, g, b;
    uint16_t h = 0;
    uint16_t s = 0;
    int32_t l = 0;
    uint8_t min, max;
    uint16_t hShifted = 0;
    uint32_t m1 = 0;
    uint32_t m2 = 0;
    int32_t diff = 0;
    uint32_t diffabs = 0;
    uint32_t iTimes4 = 0;
    int32_t amountFp = ((float)amount * 0x1000 / 100 + 0.5);
    uint32_t thresholdFp = (threshold * 257);
    uint32_t size = width * height;
    uint32_t i = 0;
    uint8_t* img = memory + img_offset;
    uint8_t* dst = memory + dst_offset;
    uint16_t* lightness = (uint16_t*)(memory + lightness_offset);
    uint16_t* blured = (uint16_t*)(memory + blur_offset);

    for (; i < size; ++i) {
        diff = 2 * (lightness[i] - blured[i]);
        diffabs = diff < 0 ? -diff : diff;

        if (diffabs >= thresholdFp) {
            r = *img++;
            g = *img++;
            b = *img++;
            ++img;

            // convert RGB to HSL
            // take RGB, 8-bit unsigned integer per each channel
            // save HSL, H and L are 16-bit unsigned integers, S is 12-bit unsigned integer
            // math is taken from here: http://www.easyrgb.com/index.php?X=MATH&H=18
            // and adopted to be integer (fixed point in fact) for sake of performance
            max = (r >= g && r >= b) ? r : (g >= r && g >= b) ? g : b; // min and max are in [0..0xff]
            min = (r <= g && r <= b) ? r : (g <= r && g <= b) ? g : b;
            l = (max + min) * 257 >> 1; // l is in [0..0xffff] that is caused by multiplication by 257

            if (min == max) {
                h = s = 0;
            } else {
                s = (l <= 0x7fff) ?
                    (((max - min) * 0xfff) / (max + min)) :
                    (((max - min) * 0xfff) / (2 * 0xff - max - min)); // s is in [0..0xfff]
                // h could be less 0, it will be fixed in backward conversion to RGB, |h| <= 0xffff / 6
                h = (r == max) ? (((g - b) * 0xffff) / (6 * (max - min)))
                    : (g == max) ? 0x5555 + ((((b - r) * 0xffff) / (6 * (max - min)))) // 0x5555 == 0xffff / 3
                    : 0xaaaa + ((((r - g) * 0xffff) / (6 * (max - min)))); // 0xaaaa == 0xffff * 2 / 3
            }

            // add unsharp mask mask to the lightness channel
            l = l + ((amountFp * diff + 0x800) >> 12);
            if (l > 0xffff) {
                l = 0xffff;
            }
            else if (l < 0) {
                l = 0;
            }

            // convert HSL back to RGB
            // for information about math look above
            if (s == 0) {
                r = g = b = l >> 8;
            } else {
                m2 = (l <= 0x7fff) ? ((uint32_t)l * (0x1000 + (uint32_t)s) + 0x800) >> 12 :
                    l  + (((0xffff - l) * s + 0x800) >> 12);
                m1 = ((2 * l) - m2) >> 8;
                m2 >>= 8;
                // save result to RGB channels
                // R channel
                hShifted = (h + 0x5555) & 0xffff; // 0x5555 == 0xffff / 3
                r = (hShifted >= 0xaaaa) ? m1 // 0xaaaa == 0xffff * 2 / 3
                    : (hShifted >= 0x7fff) ?  m1 + (((m2 - m1) * 6 * (0xaaaa - hShifted) + 0x8000) >> 16)
                    : (hShifted >= 0x2aaa) ? m2 // 0x2aaa == 0xffff / 6
                    : m1 + (((m2 - m1) * 6 * hShifted + 0x8000) >> 16);
                // G channel
                hShifted = h & 0xffff;
                g = (hShifted >= 0xaaaa) ? m1 // 0xaaaa == 0xffff * 2 / 3
                    : (hShifted >= 0x7fff) ?  m1 + (((m2 - m1) * 6 * (0xaaaa - hShifted) + 0x8000) >> 16)
                    : (hShifted >= 0x2aaa) ? m2 // 0x2aaa == 0xffff / 6
                    : m1 + (((m2 - m1) * 6 * hShifted + 0x8000) >> 16);
                // B channel
                hShifted = (h - 0x5555) & 0xffff;
                b = (hShifted >= 0xaaaa) ? m1 // 0xaaaa == 0xffff * 2 / 3
                    : (hShifted >= 0x7fff) ?  m1 + (((m2 - m1) * 6 * (0xaaaa - hShifted) + 0x8000) >> 16)
                    : (hShifted >= 0x2aaa) ? m2 // 0x2aaa == 0xffff / 6
                    : m1 + (((m2 - m1) * 6 * hShifted + 0x8000) >> 16);
            }

            *dst++ = r;
            *dst++ = g;
            *dst++ = b;
            ++dst;
        }
        else {
            img += 4;
            dst += 4;
        }
    }
}
