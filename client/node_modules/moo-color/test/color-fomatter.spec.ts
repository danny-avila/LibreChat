import { ColorFormatter } from '../src/color-formatter';
import parser from '../src/input-parser';

describe('#ColorFormatter', () => {
  const cf = new ColorFormatter();

  describe('#convert', () => {
    it('convert rgb to hwb', () => {
      const color = parser('rgb(255, 0, 0)');
      const converted = cf.convert(color, 'hwb');
      expect(converted.model).toEqual('hwb');
      expect(converted.values).toEqual([0, 0, 0]);
    });

    it('convert with alpha.', () => {
      const color = parser('#ff000080');
      const converted = cf.convert(color, 'hsl');
      expect(converted.model).toEqual('hsl');
      expect(converted.values).toEqual([0, 100, 50]);
      expect(converted.alpha).toEqual(0.5);
    });
  });

  describe('#toHex', () => {
    it('represent to hex string.', () => {
      const color = parser('rgb(255, 255, 255)');
      const hex = cf.setColor(color).toHex();
      expect(hex).toEqual('#ffffff');
    });

    it('"short" mode.', () => {
      const color = parser('rgb(255, 0, 0)');
      const hex = cf.setColor(color).toHex('short');
      expect(hex).toEqual('#f00');
    });

    it('"name" mode.', () => {
      const color = parser('rgb(255, 0, 0)');
      const hex = cf.setColor(color).toHex('name');
      expect(hex).toEqual('red');
    });
  });

  describe('#toRgb', () => {
    it('represent to rgb string.', () => {
      let color = parser('#f00');
      expect(cf.setColor(color).toRgb()).toEqual('rgb(255, 0, 0)');
      color = parser('#ff000080');
      expect(cf.setColor(color).toRgb()).toEqual('rgba(255, 0, 0, 0.5)');
    });

    it('"percent" mode.', () => {
      const color = parser('#f0f');
      expect(cf.setColor(color).toRgb('percent')).toEqual('rgb(100%, 0%, 100%)');
      expect(cf.setAlpha(.5).toRgb('percent')).toEqual('rgba(100%, 0%, 100%, 0.5)');
    });
  });

  describe('#toHwb', () => {
    it('represent to hwb string.', () => {
      let color = parser('rgb(0, 255, 255)');
      expect(cf.setColor(color).toHwb()).toEqual('hwb(180, 0%, 0%)');
      color = parser('rgba(0, 255, 255, 0.4)');
      expect(cf.setColor(color).toHwb()).toEqual('hwb(180, 0%, 0%, 0.4)');
    });
  });

  describe('#toHsl', () => {
    it('represents to hsl string.', () => {
      let color = parser('rgb(255, 0, 0)');
      expect(cf.setColor(color).toHsl()).toEqual('hsl(0, 100%, 50%)');
      color = parser('rgba(255, 0, 0, .8)');
      expect(cf.setColor(color).toHsl()).toEqual('hsla(0, 100%, 50%, 0.8)');
    });
  });

  describe('#toHsv', () => {
    it('represents to hsv string.', () => {
      let color = parser('#0f0');
      expect(cf.setColor(color).toHsv()).toEqual('hsv(120, 100%, 100%)');
      color = parser('#0f00');
      expect(cf.setColor(color).toHsv()).toEqual('hsva(120, 100%, 100%, 0)');
    });
  });

  describe('#toCmyk', () => {
    it('represents to cmyk string.', () => {
      let color = parser('rgb(0, 0, 255)');
      expect(cf.setColor(color).toCmyk()).toEqual('cmyk(100%, 100%, 0%, 0%)');
      color = parser('rgba(0, 0, 255, 0.5)');
      expect(cf.setColor(color).toCmyk()).toEqual('cmyk(100%, 100%, 0%, 0%, 0.5)');
    });
  });

  describe('#toString', () => {
    it('represents to string.', () => {
      let color = parser('rgb(255, 0, 0)');
      expect(cf.setColor(color).toString()).toEqual('rgb(255, 0, 0)');
      color = parser('hwb(120, 0%, 0%, .5)');
      expect(cf.setColor(color).toString()).toEqual('hwb(120, 0%, 0%, 0.5)');
      expect(cf.setColor(color).toString('rgb')).toEqual('rgba(0, 255, 0, 0.5)');
    });
  });
});
