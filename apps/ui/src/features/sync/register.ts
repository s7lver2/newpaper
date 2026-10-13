import { registerSettingsSection } from '../../shell/registry';
import { DevicesSection, DevicesSummary } from './DevicesSection';
import './sync.css';

registerSettingsSection({ id: 'dispositivos', order: 85, titleKey: 'settings.devices.title', descriptionKey: 'settings.devices.description', glyph: '⇆', Summary: DevicesSummary, Component: DevicesSection });
