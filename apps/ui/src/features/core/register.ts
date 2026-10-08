import { Ajustes } from '../../pages/Ajustes';
import { Inicio } from '../../pages/Inicio';
import { DataSection } from '../../pages/settings/DataSection';
import { GeneralSection } from '../../pages/settings/GeneralSection';
import { DataSummary } from '../../pages/settings/DataSummary';
import { GeneralSummary } from '../../pages/settings/GeneralSummary';
import { FallbackCrash, FallbackError } from '../../shell/FallbackSurfaces';
import { DefaultReader } from '../../shell/ReaderSurface';
import {
  registerInternalPage, registerReaderView, registerSettingsSection, registerTabSurface,
} from '../../shell/registry';
import { registerCoreShortcuts } from '../../shell/shortcuts';

registerInternalPage('inicio', Inicio);
registerInternalPage('ajustes', Ajustes);
registerSettingsSection({ id: 'general', order: 30, titleKey: 'settings.general.title', glyph: '◐', Summary: GeneralSummary, Component: GeneralSection });
registerSettingsSection({ id: 'datos', order: 90, titleKey: 'settings.data.title', glyph: '▤', Summary: DataSummary, Component: DataSection });
registerReaderView(DefaultReader);
registerTabSurface('error', FallbackError);
registerTabSurface('crash', FallbackCrash);
registerCoreShortcuts();
