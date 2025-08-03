import { Command, Flags, Args } from '@oclif/core';
import { 
  setTheme, 
  getTheme, 
  getCurrentThemeName, 
  listThemes, 
  playMatrixRain,
  ThemeType,
  themes
} from '../utils/neon.js';

export default class Theme extends Command {
  static override description = 'Manage terminal styling and visual effects';

  static override examples = [
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> set cyberpunk',
    '<%= config.bin %> <%= command.id %> set matrix',
    '<%= config.bin %> <%= command.id %> preview matrix'
  ];

  static override flags = {};

  static override args = {
    action: Args.string({
      description: 'Action to perform: list, set, preview',
      required: true,
      options: ['list', 'set', 'preview']
    }),
    theme: Args.string({
      description: 'Theme name when using set or preview',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args } = await this.parse(Theme);
    const { action, theme } = args;

    switch (action) {
      case 'list':
        await this.listThemes();
        break;
      case 'set':
        if (!theme) {
          this.error('Theme name is required for set action. Available themes: ' + listThemes().join(', '));
        }
        await this.setTheme(theme as ThemeType);
        break;
      case 'preview':
        if (!theme) {
          this.error('Theme name is required for preview action. Available themes: ' + listThemes().join(', '));
        }
        await this.previewTheme(theme as ThemeType);
        break;
      default:
        this.error(`Unknown action: ${action}`);
    }
  }

  private async listThemes(): Promise<void> {
    const currentTheme = await getCurrentThemeName();
    const availableThemes = listThemes();
    
    const theme = await getTheme();
    console.log(theme.createBox(`Available Styles:

${availableThemes.map(t => {
  const displayName = themes[t as ThemeType].name;
  return t === currentTheme 
    ? theme.chalk.success(`▶ ${displayName} (current)`)
    : theme.chalk.info(`  ${displayName}`);
}).join('\n')}

Use 'theme set <name>' to switch styles
Use 'theme preview <name>' to see a style demo`, 'STYLE MANAGER'));
  }

  private async setTheme(themeName: ThemeType): Promise<void> {
    if (!listThemes().includes(themeName)) {
      this.error(`Invalid theme: ${themeName}. Available themes: ${listThemes().join(', ')}`);
    }

    await setTheme(themeName);
    const theme = await getTheme();
    
    // Show theme preview after switching
    console.log(theme.chalk.success(`✓ Theme switched to: ${theme.name}`));
    console.log('');
    
    // Show a preview of the new theme
    await this.previewTheme(themeName);
  }

  private async previewTheme(themeName: ThemeType): Promise<void> {
    if (!listThemes().includes(themeName)) {
      this.error(`Invalid theme: ${themeName}. Available themes: ${listThemes().join(', ')}`);
    }

    await setTheme(themeName);
    const theme = await getTheme();

    console.log('');
    console.log(theme.chalk.accent('═'.repeat(60)));
    console.log(theme.chalk.highlight(`  ${theme.name.toUpperCase()} STYLE PREVIEW`));
    console.log(theme.chalk.accent('═'.repeat(60)));
    console.log('');

    // Show banner
    try {
      const banner = await theme.createBanner('BEELINE');
      console.log(banner);
    } catch (error) {
      // Fallback if figlet fails
      console.log(theme.chalk.glow('BEELINE WALLET'));
    }
    
    console.log('');
    
    // Show styled elements
    console.log(theme.createBox(`Colors and Effects:

${theme.chalk.success('✓ Success messages')}
${theme.chalk.error('✗ Error messages')} 
${theme.chalk.warning('⚠ Warning messages')}
${theme.chalk.info('ℹ Info messages')}
${theme.chalk.glow('★ Glow effects')}
${theme.chalk.pulse('◆ Pulse effects')}
${theme.chalk.highlight('▶ Highlights')}

Balance: ${theme.chalk.success('1,337.42 HIVE')}
Address: ${theme.chalk.accent('@alice')}
Status: ${theme.chalk.glow('CONNECTED')}`, `${theme.name} Preview`));

    console.log('');
    console.log(theme.chalk.accent('═'.repeat(60)));
    
    // Show rain effect for terminal theme
    if (themeName === 'matrix') {
      console.log(theme.chalk.info('Activating terminal mode...'));
      console.log('');
      await playMatrixRain(2000);
      console.log(theme.chalk.success('🔋 Terminal theme activated!'));
    } else {
      console.log(theme.chalk.success(`🎨 ${theme.name} theme activated!`));
    }
  }

}