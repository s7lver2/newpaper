import { registerOverlay, registerSettingsSection, registerToolbarItem } from '../../shell/registry';
import { FirstRun } from './FirstRun';
import { HelpSection } from './HelpSection';
import { SettingsButton } from './SettingsButton';
import './system.css';
import { Tour } from './tour/Tour';
import { startSystemBridge } from './updates';
import { UpdatesSection } from './UpdatesSection';
import { WhatsNew } from './WhatsNew';

registerOverlay({ id: 'first-run', Component: FirstRun });
registerOverlay({ id: 'tour', Component: Tour });
registerOverlay({ id: 'whats-new', Component: WhatsNew });
registerSettingsSection({ id: 'actualizaciones', order: 80, titleKey: 'settings.updates.title', descriptionKey: 'settings.updates.description', Component: UpdatesSection });
registerSettingsSection({ id: 'ayuda', order: 95, titleKey: 'settings.help.title', descriptionKey: 'settings.help.description', Component: HelpSection });
registerToolbarItem({ id: 'settings', order: 99, Component: SettingsButton });
void startSystemBridge().catch(() => {});
