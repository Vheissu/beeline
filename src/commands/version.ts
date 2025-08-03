import { Command } from '@oclif/core';
import { getTheme, neonSymbols, getCurrentThemeName, playMatrixRain } from '../utils/neon.js';

export default class Version extends Command {
  static override description = 'Display version information with neon flair';
  
  static override examples = [
    `$ beeline version`,
  ];

  public async run(): Promise<void> {
    const theme = await getTheme();
    const pkg = require('../../package.json');
    
    const versionInfo = [
      `${theme.chalk.glow('beeline-cli')} ${theme.chalk.highlight('v' + pkg.version)}`,
      ``,
      `${theme.chalk.success('Node.js')}   ${neonSymbols.arrow} ${process.version}`,
      `${theme.chalk.accent('Platform')} ${neonSymbols.arrow} ${process.platform} ${process.arch}`,
      `${theme.chalk.glow('Runtime')}  ${neonSymbols.arrow} ${process.title}`,
      ``,
      `${theme.chalk.info('Built for the terminal matrix')}`
    ].join('\n');
    
    console.log(theme.createBox(versionInfo, `${neonSymbols.star} SYSTEM INFO ${neonSymbols.star}`));
    console.log('');
    console.log(theme.chalk.pulse('◆ Hive Terminal Wallet ◆ Multi-Theme Edition ◆'));
  }
}