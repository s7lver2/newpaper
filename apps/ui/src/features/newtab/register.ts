import { registerInternalPage } from '../../shell/registry';
import { NewTabPage } from './NewTabPage';
import './newtab.css';

// Sustituye la página `inicio` provisional del subproyecto 1 (se importa después de `core`).
registerInternalPage('inicio', NewTabPage);
