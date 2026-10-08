import './privacy.css';
import { registerOverlay, registerSettingsSection, registerToolbarItem } from '../../shell/registry';
import { BlockingSection } from './BlockingSection';
import { OpenWithoutTorDialog } from './OpenWithoutTorDialog';
import { PrivacySection } from './PrivacySection';
import { PrivacySync } from './PrivacySync';
import { BlockingSummary, RedSummary } from './SettingsSummary';
import { ShieldBadge } from './ShieldBadge';
import { TorChip } from './TorChip';

registerToolbarItem({ id: 'shield', order: 10, slot: 'address', Component: ShieldBadge });
registerToolbarItem({ id: 'tor', order: 20, slot: 'address', Component: TorChip });
registerSettingsSection({ id: 'red', order: 20, titleKey: 'privacy.settings.title', glyph: '◎', Summary: RedSummary, Component: PrivacySection });
registerSettingsSection({ id: 'bloqueo', order: 30, titleKey: 'privacy.blocking.title', glyph: '⛉', Summary: BlockingSummary, Component: BlockingSection });
registerOverlay({ id: 'privacy-sync', Component: PrivacySync });
registerOverlay({ id: 'without-tor', Component: OpenWithoutTorDialog });
