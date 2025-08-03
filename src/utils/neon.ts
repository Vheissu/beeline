import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';

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

export const neonGradients = {
  cyber: gradient(['#00FFFF', '#FF00FF']),
  matrix: gradient(['#00FF00', '#008000']),
  synthwave: gradient(['#FF00FF', '#00FFFF', '#FFFF00']),
  electric: gradient(['#00FFFF', '#9D00FF']),
  sunset: gradient(['#FF4500', '#FF1493', '#9D00FF'])
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
  info: 'ℹ'
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