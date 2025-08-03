import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock external dependencies at the top level
const mockFigletText = jest.fn((text: string, options: any, callback: Function) => {
  // Default successful behavior
  callback(null, 'ASCII BANNER');
});

jest.mock('figlet', () => ({
  default: {
    text: mockFigletText
  },
  text: mockFigletText // Also provide direct text property for CommonJS
}));

const mockHexFunction = jest.fn((text: string) => text || '');
const mockChalk = {
  hex: jest.fn(() => mockHexFunction),
  bold: {
    hex: jest.fn(() => mockHexFunction)
  }
};

jest.mock('chalk', () => mockChalk);

jest.mock('gradient-string', () => jest.fn((colors: string[]) => {
  return jest.fn((text: string) => text || '');
}));

// Import after mocks are set up
import {
  neonColors,
  neonGradients,
  neonChalk,
  neonSymbols,
  createNeonBanner,
  createNeonBox,
  createNeonGrid,
  neonSpinner
} from '../../../src/utils/neon';
import figlet from 'figlet';

describe('Neon Utility Module', () => {
  let stdoutSpy: any;
  let randomSpy: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up spies
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    
    // Reset figlet mock to default behavior
    mockFigletText.mockImplementation((text: string, options: any, callback: Function) => {
      callback(null, 'ASCII BANNER');
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    stdoutSpy?.mockRestore();
    randomSpy?.mockRestore();
  });

  describe('neonColors', () => {
    it('should export color palette object', () => {
      expect(neonColors).toBeDefined();
      expect(typeof neonColors).toBe('object');
      expect(neonColors).toHaveProperty('cyan');
      expect(neonColors).toHaveProperty('magenta');
      expect(neonColors).toHaveProperty('electric');
    });

    it('should have valid hex color values', () => {
      const colorValues = Object.values(neonColors);
      expect(colorValues.length).toBeGreaterThan(0);
      
      colorValues.forEach(color => {
        expect(typeof color).toBe('string');
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  describe('neonGradients', () => {
    it('should export gradient functions', () => {
      expect(neonGradients).toBeDefined();
      expect(typeof neonGradients).toBe('object');
      expect(neonGradients).toHaveProperty('cyber');
      expect(neonGradients).toHaveProperty('matrix');
      expect(typeof neonGradients.cyber).toBe('function');
    });

    it('should apply gradients to text', () => {
      const testText = 'TEST';
      const result = neonGradients.cyber(testText);
      
      expect(typeof result).toBe('string');
      expect(result).toBe(testText); // Since we mock gradient-string to return input
    });
  });

  describe('neonChalk', () => {
    it('should export styling functions', () => {
      expect(neonChalk).toBeDefined();
      expect(typeof neonChalk).toBe('object');
      
      // Test some known functions exist
      expect(neonChalk).toHaveProperty('cyan');
      expect(neonChalk).toHaveProperty('glow');
      expect(neonChalk).toHaveProperty('error');
      expect(typeof neonChalk.cyan).toBe('function');
    });

    it('should apply styling to text', () => {
      const testText = 'test';
      
      expect(typeof neonChalk.cyan(testText)).toBe('string');
      expect(typeof neonChalk.glow(testText)).toBe('string');
      expect(typeof neonChalk.error(testText)).toBe('string');
    });
  });

  describe('neonSymbols', () => {
    it('should export symbol object', () => {
      expect(neonSymbols).toBeDefined();
      expect(typeof neonSymbols).toBe('object');
    });

    it('should have basic symbols', () => {
      expect(neonSymbols).toHaveProperty('bullet');
      expect(neonSymbols).toHaveProperty('arrow');
      expect(neonSymbols).toHaveProperty('check');
      expect(neonSymbols).toHaveProperty('cross');
      expect(neonSymbols).toHaveProperty('star');
    });

    it('should have correct symbol values', () => {
      expect(neonSymbols.bullet).toBe('▶');
      expect(neonSymbols.arrow).toBe('→');
      expect(neonSymbols.check).toBe('✔');
      expect(neonSymbols.cross).toBe('✖');
      expect(neonSymbols.star).toBe('★');
    });
  });

  describe('createNeonBanner', () => {
    it('should create ASCII banner successfully', async () => {
      const mockAscii = 'ASCII ART BANNER';
      mockFigletText.mockImplementation((text: string, options: any, callback: Function) => {
        callback(null, mockAscii);
      });

      const result = await createNeonBanner('TEST');

      expect(mockFigletText).toHaveBeenCalledWith(
        'TEST',
        {
          font: 'ANSI Shadow',
          horizontalLayout: 'fitted',
          verticalLayout: 'fitted'
        },
        expect.any(Function)
      );

      expect(result).toBe(mockAscii); // Since gradient is mocked to return input
    });

    it('should handle figlet errors', async () => {
      mockFigletText.mockImplementation((text: string, options: any, callback: Function) => {
        callback(new Error('Font not found'), null);
      });

      await expect(createNeonBanner('TEST')).rejects.toThrow('Font not found');
    });

    it('should handle null figlet result', async () => {
      mockFigletText.mockImplementation((text: string, options: any, callback: Function) => {
        callback(null, null);
      });

      await expect(createNeonBanner('TEST')).rejects.toThrow('Failed to generate banner');
    });
  });

  describe('createNeonBox', () => {
    it('should create a basic box', () => {
      const content = 'Test content';
      const result = createNeonBox(content);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('Test content');
    });

    it('should create box with title', () => {
      const content = 'Test content';
      const title = 'TEST TITLE';
      const result = createNeonBox(content, title);

      expect(result).toContain(title);
      expect(result).toContain('Test content');
    });

    it('should handle multiline content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const result = createNeonBox(content);

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });

    it('should handle empty content', () => {
      const content = '';
      const result = createNeonBox(content);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('createNeonGrid', () => {
    it('should create a grid string', () => {
      const result = createNeonGrid();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should create grid with custom width', () => {
      const customWidth = 40;
      const result = createNeonGrid(customWidth);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate multiple lines', () => {
      const result = createNeonGrid();
      const lines = result.split('\n').filter(line => line.length > 0);

      expect(lines.length).toBeGreaterThan(0);
    });
  });

  describe('neonSpinner', () => {
    it('should create a spinner interval', () => {
      jest.useFakeTimers();
      const testText = 'Loading...';
      const intervalId = neonSpinner(testText);

      // With Jest fake timers, intervalId might be an object
      expect(intervalId).toBeDefined();
      expect(intervalId).not.toBeNull();
      
      clearInterval(intervalId);
      jest.useRealTimers();
    });

    it('should write to stdout after interval', () => {
      jest.useFakeTimers();
      const testText = 'Processing...';
      const intervalId = neonSpinner(testText);

      // Initially no output
      expect(process.stdout.write).not.toHaveBeenCalled();
      
      // After advancing time, should write
      jest.advanceTimersByTime(100);
      expect(process.stdout.write).toHaveBeenCalled();

      clearInterval(intervalId);
      jest.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle empty strings gracefully', () => {
      expect(() => createNeonBox('')).not.toThrow();
      expect(() => neonChalk.glow('')).not.toThrow();
    });

    it('should handle undefined inputs', () => {
      // These will throw errors, so we expect them to throw
      expect(() => createNeonBox(undefined as any)).toThrow();
      expect(() => neonChalk.cyan(undefined as any)).not.toThrow(); // chalk should handle undefined
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      
      expect(() => createNeonBox(longString)).not.toThrow();
      expect(() => neonChalk.cyan(longString)).not.toThrow();
    });

    it('should handle special characters', () => {
      const specialContent = 'Special chars: ñáéíóú üöä 中文 🎮';
      
      expect(() => createNeonBox(specialContent)).not.toThrow();
      expect(() => neonChalk.electric(specialContent)).not.toThrow();
    });
  });

  describe('function consistency', () => {
    it('should return strings from chalk functions', () => {
      const testText = 'test';
      
      expect(typeof neonChalk.cyan(testText)).toBe('string');
      expect(typeof neonChalk.error(testText)).toBe('string');
      expect(typeof neonChalk.glow(testText)).toBe('string');
    });

    it('should return strings from utility functions', () => {
      expect(typeof createNeonBox('test')).toBe('string');
      expect(typeof createNeonGrid()).toBe('string');
    });
  });
});