import { registerSettingsSection } from '../../shell/registry';
import { AiSection } from './AiSection';
import { AnalysisSettingsSection } from './AnalysisSettingsSection';
import './providers.css';

registerSettingsSection({ id: 'ia', order: 40, titleKey: 'settings.ai.title', descriptionKey: 'settings.ai.description', Component: AiSection });
registerSettingsSection({ id: 'analisis', order: 45, titleKey: 'settings.analysis.title', descriptionKey: 'settings.analysis.description', Component: AnalysisSettingsSection });
