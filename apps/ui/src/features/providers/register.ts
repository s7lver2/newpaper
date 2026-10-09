import { registerSettingsSection } from '../../shell/registry';
import { AiSection } from './AiSection';
import { AiSummary, AnalysisSummary } from './AiSummary';
import { AnalysisSettingsSection } from './AnalysisSettingsSection';
import './providers.css';
import './wizard.css';

// El orden del mockup: Privacidad y red, Inteligencia artificial, Análisis, Fuentes, Bloqueo…
registerSettingsSection({ id: 'ia', order: 12, titleKey: 'settings.ai.title', descriptionKey: 'settings.ai.description', glyph: '✳', Summary: AiSummary, Component: AiSection });
registerSettingsSection({ id: 'analisis', order: 14, titleKey: 'settings.analysis.title', descriptionKey: 'settings.analysis.description', glyph: '⚖', Summary: AnalysisSummary, Component: AnalysisSettingsSection });
