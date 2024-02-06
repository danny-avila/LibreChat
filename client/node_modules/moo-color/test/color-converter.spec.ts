import * as Converter from '../src/color-converter';

const rounding = (arr: number[]) => {
  return arr.map(x => Math.round(x));
};

describe('#ColorConverter', () => {
  describe('#HSL', () => {
    it('converts HSL to RGB', () => {
      const rgb = Converter.hslToRgb(0, 50, 50);
      expect(rounding(rgb)).toEqual([191, 64, 64]);
    });

    it('converts RGB to HSL', () => {
      const hsl = Converter.rgbToHsl(191, 64, 64);
      expect(rounding(hsl)).toEqual([0, 50, 50]);
      const hsl1 = Converter.rgbToHsl(255, 128, 64);
      expect(rounding(hsl1)).toEqual([20, 100, 63]);
    });

    it('achromatic gray test. (none delta)', () => {
      const [h, s] = Converter.rgbToHsl(128, 128, 128);
      expect(h).toEqual(0);
      expect(s).toEqual(0);
    });
  });

  describe('#HWB', () => {
    it('converts HWB to RGB', () => {
      const rgb = Converter.hwbToRgb(60, 0, 25);
      expect(rounding(rgb)).toEqual([191, 191, 0]);
    });

    it('converts RGB to HWB', () => {
      const hwb = Converter.rgbToHwb(160, 255, 51);
      expect(rounding(hwb)).toEqual([88, 20, 0]);
    });
  });

  describe('#HSV', () => {
    it('converts HSV to RGB', () => {
      const rgb = Converter.hsvToRgb(45, 80, 65);
      expect(rounding(rgb)).toEqual([166, 133, 33]);
      const rgb1 = Converter.hsvToRgb(330, 85, 50);
      expect(rounding(rgb1)).toEqual([128, 19, 73]);
    });

    it('converts RGB to HSV', () => {
      const hsv = Converter.rgbToHsv(80, 128, 0);
      expect(rounding(hsv)).toEqual([83, 100, 50]);
    });
  });

  describe('#CMYK', () => {
    it('converts CMYK to RGB', () => {
      const rgb = Converter.cmykToRgb(67, 75, 25, 15);
      expect(rounding(rgb)).toEqual([72, 54, 163]);
    });

    it('converts RGB to CMYK', () => {
      const cmyk = Converter.rgbToCmyk(72, 54, 163);
      expect(rounding(cmyk)).toEqual([56, 67, 0, 36]);
    });
  });

  describe('#HEX', () => {
    it('converts RGB to HEX string.', () => {
      const hex = Converter.rgbToHex(255, 0, 187);
      expect(hex).toEqual('ff00bb');
    });

    it('converts RGB to HEX as shorthand string.', () => {
      const hex = Converter.rgbToHex(255, 0, 187, null, true);
      expect(hex).toEqual('f0b');
    });

    it('RGB to HEX with alpha', () => {
      const hex = Converter.rgbToHex(255, 0, 187, .5);
      expect(hex).toEqual('ff00bb80');
    });

    it('converts HEX to RGB.', () => {
      const rgb = Converter.hexToRgb('ff00bb');
      const short = Converter.hexToRgb('f0b');
      expect(rgb).toEqual([255, 0, 187]);
      expect(rgb).toEqual(short);
    });

    it('converts Hex with alpha to RGB', () => {
      const rgba = Converter.hexToRgb('ff00bbff');
      expect(rgba).toEqual([255, 0, 187, 1]);
    });
  });

  describe('multiple converts.', () => {
    it('to be closed to original values.', () => {
      const original = [255, 128, 64];
      let val = [255, 128, 64];
      for (let i = 0; i < 100; i++) {
        val = Converter.rgbToHwb(val[0], val[1], val[2]);
        val = Converter.hwbToRgb(val[0], val[1], val[2]);
        val = Converter.rgbToHsl(val[0], val[1], val[2]);
        val = Converter.hslToRgb(val[0], val[1], val[2]);
        val = Converter.rgbToCmyk(val[0], val[1], val[2]);
        val = Converter.cmykToRgb(val[0], val[1], val[2], val[3]);
      }
      expect(val[0]).toBeCloseTo(original[0], 6);
      expect(val[1]).toBeCloseTo(original[1], 6);
      expect(val[2]).toBeCloseTo(original[2], 6);
    });
  });
});
