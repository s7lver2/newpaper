import { registerInternalPage, registerTabSurface } from '../../shell/registry';
import { CrashSurface } from './CrashSurface';
import { NetErrorSurface } from './NetErrorSurface';
import { NotFoundPage } from './NotFoundPage';
import { OfflinePage } from './OfflinePage';
import { startOfflineQueue } from './offlineQueue';
import './pages.css';

registerTabSurface('error', NetErrorSurface);
registerTabSurface('crash', CrashSurface);
registerInternalPage('404', NotFoundPage);
registerInternalPage('sin-conexion', OfflinePage);
startOfflineQueue();
