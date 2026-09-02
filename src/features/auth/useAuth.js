// Separado de AuthContext.jsx para que ese archivo exporte solo componentes
// (react-refresh/only-export-components).
import { useContext } from 'react';
import { AuthContext } from './authContextObject.js';

export function useAuth() {
  return useContext(AuthContext);
}
