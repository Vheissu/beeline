import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

export const neonColors = {
  cyan: '#00FFFF',
  magenta: '#FF00FF', 
  electric: '#00FF00',
  green: '#32CD32',
  purple: '#9D00FF',
  pink: '#FF1493',
  orange: '#FF4500',
  yellow: '#FFFF00',
  white: '#FFFFFF',
  darkCyan: '#008B8B',
  darkMagenta: '#8B008B'
};

export const matrixColors = {
  brightGreen: '#00FF41',
  green: '#00FF00',
  darkGreen: '#008F11',
  mediumGreen: '#00AA00',
  black: '#000000',
  white: '#FFFFFF'
};

export const neonGradients = {
  cyber: gradient(['#00FFFF', '#FF00FF']),
  matrix: gradient(['#00FF41', '#008F11']),
  synthwave: gradient(['#FF00FF', '#00FFFF', '#FFFF00']),
  electric: gradient(['#00FFFF', '#9D00FF']),
  sunset: gradient(['#FF4500', '#FF1493', '#9D00FF'])
};

export const matrixGradients = {
  rain: gradient(['#FFFFFF', '#00FF41', '#008F11']),
  code: gradient(['#00FF41', '#00AA00']),
  terminal: gradient(['#00FF00', '#008F11'])
};

export const neonChalk = {
  cyan: chalk.hex(neonColors.cyan),
  magenta: chalk.hex(neonColors.magenta),
  electric: chalk.hex(neonColors.electric),
  green: chalk.hex(neonColors.green),
  purple: chalk.hex(neonColors.purple),
  pink: chalk.hex(neonColors.pink),
  orange: chalk.hex(neonColors.orange),
  yellow: chalk.hex(neonColors.yellow),
  white: chalk.hex(neonColors.white),
  darkCyan: chalk.hex(neonColors.darkCyan),
  darkMagenta: chalk.hex(neonColors.darkMagenta),
  
  // Special effects
  glow: (text: string) => chalk.bold.hex(neonColors.cyan)(text),
  pulse: (text: string) => chalk.bold.hex(neonColors.magenta)(text),
  error: (text: string) => chalk.bold.hex(neonColors.pink)(text),
  success: (text: string) => chalk.bold.hex(neonColors.electric)(text),
  warning: (text: string) => chalk.bold.hex(neonColors.orange)(text),
  info: (text: string) => chalk.bold.hex(neonColors.cyan)(text),
  
  // Grid elements
  border: chalk.hex(neonColors.darkCyan),
  accent: chalk.hex(neonColors.magenta),
  highlight: chalk.bold.hex(neonColors.yellow)
};

export const matrixChalk = {
  brightGreen: chalk.hex(matrixColors.brightGreen),
  green: chalk.hex(matrixColors.green),
  darkGreen: chalk.hex(matrixColors.darkGreen),
  mediumGreen: chalk.hex(matrixColors.mediumGreen),
  white: chalk.hex(matrixColors.white),
  black: chalk.hex(matrixColors.black),
  
  // Special effects
  glow: (text: string) => chalk.bold.hex(matrixColors.brightGreen)(text),
  pulse: (text: string) => chalk.bold.hex(matrixColors.green)(text),
  error: (text: string) => chalk.bold.hex(matrixColors.brightGreen)(text),
  success: (text: string) => chalk.bold.hex(matrixColors.brightGreen)(text),
  warning: (text: string) => chalk.bold.hex(matrixColors.green)(text),
  info: (text: string) => chalk.bold.hex(matrixColors.mediumGreen)(text),
  
  // Grid elements
  border: chalk.hex(matrixColors.darkGreen),
  accent: chalk.hex(matrixColors.brightGreen),
  highlight: chalk.bold.hex(matrixColors.white)
};

export const neonSymbols = {
  bullet: '▶',
  arrow: '→',
  check: '✔',
  cross: '✖',
  star: '★',
  diamond: '◆',
  square: '■',
  circle: '●',
  triangle: '▲',
  line: '─',
  verticalLine: '│',
  corner: '└',
  tee: '├',
  grid: '▓',
  block: '█',
  shade: '░',
  mediumShade: '▒',
  darkShade: '▓',
  warning: '⚠',
  info: 'ℹ',
  pause: '⏸',
  download: '⬇',
  search: '🔍',
  vote: '🗳',
  proxy: '🔗',
  list: '📋'
};

export async function createNeonBanner(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    figlet.text(text, {
      font: 'ANSI Shadow',
      horizontalLayout: 'fitted',
      verticalLayout: 'fitted'
    }, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (data) {
        resolve(neonGradients.cyber(data));
      } else {
        reject(new Error('Failed to generate banner'));
      }
    });
  });
}

export function createNeonBox(content: string, title?: string): string {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(line => line.length));
  const width = Math.max(maxLength + 4, title ? title.length + 4 : 0);
  
  let box = '';
  
  // Top border
  if (title) {
    const titlePadding = Math.floor((width - title.length - 2) / 2);
    const leftPadding = '─'.repeat(titlePadding);
    const rightPadding = '─'.repeat(width - title.length - 2 - titlePadding);
    box += neonChalk.border(`┌${leftPadding}`) + neonChalk.accent(` ${title} `) + neonChalk.border(`${rightPadding}┐\n`);
  } else {
    box += neonChalk.border('┌' + '─'.repeat(width - 2) + '┐\n');
  }
  
  // Content
  lines.forEach(line => {
    const padding = ' '.repeat(width - line.length - 4);
    box += neonChalk.border('│ ') + line + padding + neonChalk.border(' │\n');
  });
  
  // Bottom border
  box += neonChalk.border('└' + '─'.repeat(width - 2) + '┘');
  
  return box;
}

export function createNeonGrid(width = 60): string {
  let grid = '';
  
  // Create a cyberpunk grid pattern
  for (let i = 0; i < 3; i++) {
    let line = '';
    for (let j = 0; j < width; j += 3) {
      if (Math.random() > 0.7) {
        line += neonChalk.cyan(neonSymbols.block);
      } else if (Math.random() > 0.5) {
        line += neonChalk.darkCyan(neonSymbols.mediumShade);
      } else {
        line += neonChalk.darkCyan(neonSymbols.shade);
      }
      
      if (j + 1 < width) {
        line += neonChalk.border(' ');
      }
      if (j + 2 < width) {
        line += Math.random() > 0.8 ? neonChalk.magenta(neonSymbols.darkShade) : ' ';
      }
    }
    grid += line + '\n';
  }
  
  return grid;
}

export function neonSpinner(text: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  
  return setInterval(() => {
    process.stdout.write(`\r${neonChalk.cyan(frames[i % frames.length])} ${neonChalk.glow(text)}`);
    i++;
  }, 80);
}

export function matrixSpinner(text: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  
  return setInterval(() => {
    process.stdout.write(`\r${matrixChalk.brightGreen(frames[i % frames.length])} ${matrixChalk.glow(text)}`);
    i++;
  }, 80);
}

export async function createMatrixBanner(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    figlet.text(text, {
      font: 'ANSI Shadow',
      horizontalLayout: 'fitted',
      verticalLayout: 'fitted'
    }, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      if (data) {
        resolve(matrixGradients.rain(data));
      } else {
        reject(new Error('Failed to generate banner'));
      }
    });
  });
}

export function createMatrixBox(content: string, title?: string): string {
  const lines = content.split('\n');
  const maxLength = Math.max(...lines.map(line => line.length));
  const width = Math.max(maxLength + 4, title ? title.length + 4 : 0);
  
  let box = '';
  
  // Top border
  if (title) {
    const titlePadding = Math.floor((width - title.length - 2) / 2);
    const leftPadding = '─'.repeat(titlePadding);
    const rightPadding = '─'.repeat(width - title.length - 2 - titlePadding);
    box += matrixChalk.border(`┌${leftPadding}`) + matrixChalk.accent(` ${title} `) + matrixChalk.border(`${rightPadding}┐\n`);
  } else {
    box += matrixChalk.border('┌' + '─'.repeat(width - 2) + '┐\n');
  }
  
  // Content
  lines.forEach(line => {
    const padding = ' '.repeat(width - line.length - 4);
    box += matrixChalk.border('│ ') + line + padding + matrixChalk.border(' │\n');
  });
  
  // Bottom border
  box += matrixChalk.border('└' + '─'.repeat(width - 2) + '┘');
  
  return box;
}

export class MatrixRain {
  private columns: Array<{
    x: number;
    y: number;
    speed: number;
    chars: string[];
    length: number;
  }> = [];
  private width: number;
  private height: number;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  
  // Matrix-style characters (mix of katakana, numbers, and symbols)
  private readonly matrixChars = [
    'ア', 'カ', 'サ', 'タ', 'ナ', 'ハ', 'マ', 'ヤ', 'ラ', 'ワ',
    'イ', 'キ', 'シ', 'チ', 'ニ', 'ヒ', 'ミ', 'リ', 'ウ', 'ク',
    'ス', 'ツ', 'ヌ', 'フ', 'ム', 'ユ', 'ル', 'エ', 'ケ', 'セ',
    'テ', 'ネ', 'ヘ', 'メ', 'レ', 'オ', 'コ', 'ソ', 'ト', 'ノ',
    'ホ', 'モ', 'ヨ', 'ロ', 'ヲ', 'ン', '0', '1', '2', '3', '4',
    '5', '6', '7', '8', '9', ':', '・', '"', '=', '*', '+', '-',
    '<', '>', '¦', '|', 'ç', 'ﾘ'
  ];
  
  constructor(width = 80, height = 25) {
    this.width = width;
    this.height = height;
    this.initializeColumns();
  }
  
  private initializeColumns() {
    this.columns = [];
    const numColumns = Math.floor(this.width / 2);
    
    for (let i = 0; i < numColumns; i++) {
      this.columns.push({
        x: i * 2,
        y: Math.floor(Math.random() * -this.height),
        speed: Math.random() * 3 + 1,
        chars: [],
        length: Math.floor(Math.random() * 20) + 5
      });
    }
  }
  
  private getRandomChar(): string {
    return this.matrixChars[Math.floor(Math.random() * this.matrixChars.length)];
  }
  
  private renderFrame(): string {
    const screen: string[][] = Array(this.height).fill(null).map(() => Array(this.width).fill(' '));
    
    // Update and render each column
    this.columns.forEach(column => {
      // Move column down
      column.y += column.speed;
      
      // Reset column if it's off screen
      if (column.y > this.height + column.length) {
        column.y = Math.floor(Math.random() * -20) - column.length;
        column.speed = Math.random() * 3 + 1;
        column.length = Math.floor(Math.random() * 20) + 5;
        column.chars = [];
      }
      
      // Generate new characters for the column
      while (column.chars.length < column.length) {
        column.chars.push(this.getRandomChar());
      }
      
      // Render the column
      for (let i = 0; i < column.length; i++) {
        const y = Math.floor(column.y - i);
        const x = column.x;
        
        if (y >= 0 && y < this.height && x >= 0 && x < this.width) {
          const char = column.chars[i] || this.getRandomChar();
          let coloredChar: string;
          
          if (i === 0) {
            // Head of the stream - bright white
            coloredChar = matrixChalk.white(char);
          } else if (i < 3) {
            // Bright green for the leading characters
            coloredChar = matrixChalk.brightGreen(char);
          } else if (i < 8) {
            // Medium green for middle characters
            coloredChar = matrixChalk.green(char);
          } else {
            // Dark green for trailing characters
            coloredChar = matrixChalk.darkGreen(char);
          }
          
          screen[y][x] = coloredChar;
        }
      }
    });
    
    // Convert screen to string
    return screen.map(row => row.join('')).join('\n');
  }
  
  start(duration = 3000): Promise<void> {
    return new Promise((resolve) => {
      if (this.isRunning) {
        resolve();
        return;
      }
      
      this.isRunning = true;
      console.clear();
      process.stdout.write('\x1b[?25l'); // Hide cursor
      
      this.intervalId = setInterval(() => {
        console.clear();
        process.stdout.write(this.renderFrame());
      }, 100);
      
      setTimeout(() => {
        this.stop();
        resolve();
      }, duration);
    });
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    process.stdout.write('\x1b[?25h'); // Show cursor
    console.clear();
  }
}

export async function playMatrixRain(duration = 3000, width?: number, height?: number): Promise<void> {
  const rain = new MatrixRain(width, height);
  await rain.start(duration);
}

// Subtle Matrix-themed command output enhancement
export function addMatrixFlair(text: string): string {
  const currentThemeName = getCurrentThemeName();
  
  // Only add flair for Matrix theme, and do it synchronously to avoid delays
  if (typeof currentThemeName === 'object' && currentThemeName instanceof Promise) {
    // If it's a promise, just return the text as-is to avoid async complications
    return text;
  }
  
  if (currentThemeName === 'matrix') {
    // Add subtle Matrix characters as a prefix/suffix without blocking
    const matrixChars = ['ア', 'カ', 'サ', 'タ', 'ナ', 'ハ', '0', '1'];
    const randomChar = matrixChars[Math.floor(Math.random() * matrixChars.length)];
    const matrixTheme = themes.matrix;
    
    // Add a subtle Matrix character prefix in dark green occasionally  
    if (Math.random() < 0.1) { // 10% chance
      return matrixTheme.chalk.info(randomChar) + ' ' + text;
    }
  }
  
  return text;
}

export type ThemeType = 'cyberpunk' | 'matrix';

export interface Theme {
  name: string;
  colors: typeof neonColors | typeof matrixColors;
  chalk: typeof neonChalk | typeof matrixChalk;
  gradients: typeof neonGradients | typeof matrixGradients;
  createBanner: (text: string) => Promise<string>;
  createBox: (content: string, title?: string) => string;
  spinner: (text: string) => NodeJS.Timeout;
}

export const themes: Record<ThemeType, Theme> = {
  cyberpunk: {
    name: 'Neon',
    colors: neonColors,
    chalk: neonChalk,
    gradients: neonGradients,
    createBanner: createNeonBanner,
    createBox: createNeonBox,
    spinner: neonSpinner
  },
  matrix: {
    name: 'Terminal',
    colors: matrixColors,
    chalk: matrixChalk,
    gradients: matrixGradients,
    createBanner: createMatrixBanner,
    createBox: createMatrixBox,
    spinner: matrixSpinner
  }
};

let currentTheme: ThemeType = 'cyberpunk';

const CONFIG_DIR = path.join(os.homedir(), '.beeline');
const THEME_CONFIG_FILE = path.join(CONFIG_DIR, 'theme.json');

// Load theme from config file on module initialization
async function loadTheme(): Promise<void> {
  try {
    if (await fs.pathExists(THEME_CONFIG_FILE)) {
      const config = await fs.readJson(THEME_CONFIG_FILE);
      if (config.theme && themes[config.theme as ThemeType]) {
        currentTheme = config.theme as ThemeType;
      }
    }
  } catch (error) {
    // Ignore errors, use default theme
  }
}

// Save theme to config file
async function saveTheme(theme: ThemeType): Promise<void> {
  try {
    await fs.ensureDir(CONFIG_DIR);
    await fs.writeJson(THEME_CONFIG_FILE, { theme });
  } catch (error) {
    // Ignore errors, theme just won't persist
  }
}

export async function setTheme(theme: ThemeType): Promise<void> {
  currentTheme = theme;
  await saveTheme(theme);
}

export async function getTheme(): Promise<Theme> {
  await loadTheme();
  return themes[currentTheme];
}

export async function getCurrentThemeName(): Promise<ThemeType> {
  await loadTheme();
  return currentTheme;
}

export function listThemes(): ThemeType[] {
  return Object.keys(themes) as ThemeType[];
}