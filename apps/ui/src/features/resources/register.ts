import { registerOverlay } from '../../shell/registry';
import { ResourceWarning } from './ResourceWarning';

registerOverlay({ id: 'resource-warning', Component: ResourceWarning });
