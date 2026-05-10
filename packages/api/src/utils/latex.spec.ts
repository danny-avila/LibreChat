import { unescapeLaTeX } from './latex';

describe('unescapeLaTeX', () => {
  describe('currency dollar signs', () => {
    it('should unescape single backslash dollar signs', () => {
      const input = 'Price: \\$14';
      const expected = 'Price: $14';
      expect(unescapeLaTeX(input)).toBe(expected);
    });

    it('should unescape double backslash dollar signs', () => {
      const input = 'Price: \\\\$14';
      const expected = 'Price: $14';
      expect(unescapeLaTeX(input)).toBe(expected);
    });

    it('should unescape multiple currency values', () => {
      const input = '**Crispy Calamari** - *\\\\$14*\n**Truffle Fries** - *\\\\$12*';
      const expected = '**Crispy Calamari** - *$14*\n**Truffle Fries** - *$12*';
      expect(unescapeLaTeX(input)).toBe(expected);
    });

    it('should handle currency with commas and decimals', () => {
      const input = 'Total: \\\\$1,234.56';
      const expected = 'Total: $1,234.56';
      expect(unescapeLaTeX(input)).toBe(expected);
    });
  });

  describe('mhchem notation', () => {
    it('should unescape mhchem ce notation', () => {
      const input = '$$\\\\ce{H2O}$$';
      const expected = '$\\ce{H2O}$';
      expect(unescapeLaTeX(input)).toBe(expected);
    });

    it('should unescape mhchem pu notation', () => {
      const input = '$$\\\\pu{123 kJ/mol}$$';
      const expected = '$\\pu{123 kJ/mol}$';
      expect(unescapeLaTeX(input)).toBe(expected);
    });

    it('should handle multiple mhchem expressions', () => {
      const input = '$$\\\\ce{H2O}$$ and $$\\\\ce{CO2}$$';
      const expected = '$\\ce{H2O}$ and $\\ce{CO2}$';
      expect(unescapeLaTeX(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(unescapeLaTeX('')).toBe('');
    });

    it('should handle null', () => {
      expect(unescapeLaTeX(null)).toBe(null);
    });

    it('should handle undefined', () => {
      expect(unescapeLaTeX(undefined)).toBe(undefined);
    });

    it('should handle string with no dollar signs', () => {
      const input = 'Hello world';
      expect(unescapeLaTeX(input)).toBe(input);
    });

    it('should handle mixed escaped and unescaped content', () => {
      const input = 'Price \\\\$14 and some text';
      const expected = 'Price $14 and some text';
      expect(unescapeLaTeX(input)).toBe(expected);
    });
  });

  describe('real-world example from bug report', () => {
    it('should correctly unescape restaurant menu content', () => {
      const input = `# The Golden Spoon
## *Contemporary American Cuisine*

---

### STARTERS

**Crispy Calamari** - *\\\\$14*  
Lightly fried, served with marinara & lemon aioli

**Truffle Fries** - *\\\\$12*  
Hand-cut fries, parmesan, truffle oil, fresh herbs

**Burrata & Heirloom Tomatoes** - *\\\\$16*  
Fresh burrata, basil pesto, balsamic reduction, grilled sourdough

**Thai Chicken Lettuce Wraps** - *\\\\$13*  
Spicy ground chicken, water chestnuts, ginger-soy glaze

**Soup of the Day** - *\\\\$9`;

      const expected = `# The Golden Spoon
## *Contemporary American Cuisine*

---

### STARTERS

**Crispy Calamari** - *$14*  
Lightly fried, served with marinara & lemon aioli

**Truffle Fries** - *$12*  
Hand-cut fries, parmesan, truffle oil, fresh herbs

**Burrata & Heirloom Tomatoes** - *$16*  
Fresh burrata, basil pesto, balsamic reduction, grilled sourdough

**Thai Chicken Lettuce Wraps** - *$13*  
Spicy ground chicken, water chestnuts, ginger-soy glaze

**Soup of the Day** - *$9`;

      expect(unescapeLaTeX(input)).toBe(expected);
    });
  });
});
