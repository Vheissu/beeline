import { Command } from '@oclif/core';
import { neonChalk, neonSymbols, createNeonBox } from '../utils/neon.js';

export default class Version extends Command {
  static override description = 'Display version information with neon flair';
  
  static override examples = [
    `$ beeline version`,
  ];

  public async run(): Promise<void> {
    const pkg = require('../../package.json');
    
    const versionInfo = [
      `${neonChalk.glow('beeline-cli')} ${neonChalk.highlight('v' + pkg.version)}`,
      ``,
      `${neonChalk.cyan('Node.js')}   ${neonSymbols.arrow} ${process.version}`,
      `${neonChalk.magenta('Platform')} ${neonSymbols.arrow} ${process.platform} ${process.arch}`,
      `${neonChalk.electric('Runtime')}  ${neonSymbols.arrow} ${process.title}`,
      ``,
      `${neonChalk.darkCyan('Built for the neon grid')}`
    ].join('\n');
    
    console.log(createNeonBox(versionInfo, `${neonSymbols.star} SYSTEM INFO ${neonSymbols.star}`));
    console.log('');
    console.log(neonChalk.pulse('◆ Hive Terminal Wallet ◆ Neon Grid Edition ◆'));
  }
}