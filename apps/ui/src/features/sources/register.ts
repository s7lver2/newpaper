import './sources.css';
import { registerInternalPage, registerOverlay, registerSettingsSection, registerToolbarItem } from '../../shell/registry';
import { EditionPage } from './EditionPage';
import { OfflineBuilder } from './OfflineBuilder';
import { OfflineSection } from './OfflineSection';
import { SaveButton } from './SaveButton';
import { SourcesSection } from './SourcesSection';

registerToolbarItem({ id: 'save', order: 5, Component: SaveButton });
registerInternalPage('edicion', EditionPage);
registerSettingsSection({ id: 'fuentes', order: 40, titleKey: 'sources.settings.title', Component: SourcesSection });
registerSettingsSection({ id: 'sin-conexion', order: 50, titleKey: 'sources.offline.title', Component: OfflineSection });
registerOverlay({ id: 'offline-builder', Component: OfflineBuilder });
