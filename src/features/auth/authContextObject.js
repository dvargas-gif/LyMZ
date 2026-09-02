// El objeto de contexto en sí, separado tanto de AuthContext.jsx (que debe
// exportar solo el componente AuthProvider) como de useAuth.js -- ambos lo
// importan de acá.
import { createContext } from 'react';

export const AuthContext = createContext(null);
