import { Command, Flags } from '@oclif/core';
import { KeyManager } from '../utils/crypto.js';
import { TerminalUI } from '../ui/TerminalUI.js';
import { getTheme, neonSymbols, getCurrentThemeName, playMatrixRain } from '../utils/neon.js';

export default class UI extends Command {
  static override description = 'Launch the visual terminal interface for Beeline wallet';
  
  static override examples = [
    '$ beeline ui',
    '$ beeline ui --mock'
  ];

  static override flags = {
    mock: Flags.boolean({
      char: 'm',
      description: 'use mock data for testing',
      default: false
    }),
    node: Flags.string({
      char: 'n',
      description: 'RPC node to use',
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(UI);
    
    const theme = await getTheme();
    
    try {
      // Initialize KeyManager
      const keyManager = new KeyManager();
      await keyManager.initialize();
      
      // Clear screen and show loading message
      console.clear();
      console.log(theme.chalk.glow(`${neonSymbols.diamond} Starting Beeline Terminal UI...`));
      
      // Create and run the terminal UI
      const ui = new TerminalUI(keyManager, {
        mock: flags.mock,
        node: flags.node
      });
      
      ui.run();
      
    } catch (error) {
      console.clear();
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to start UI: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(theme.chalk.info('You can still use individual commands:'));
      console.log(theme.chalk.highlight('beeline balance --help'));
      console.log(theme.chalk.highlight('beeline transfer --help'));
      console.log(theme.chalk.highlight('beeline accounts --help'));
    }
  }
}