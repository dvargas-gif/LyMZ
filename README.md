# WMS · Slotting Mezanine — Sistema multiusuario

Evolución de la aplicación de slotting original hacia un sistema con
autenticación, roles, auditoría e historial de movimientos.

## ⚠️ Qué NO se tocó
`public/legacy/mapa_editable_slotting.html` es el mapa editable **original**,
sin cambios de lógica. El único agregado (dentro de la función `logMov`, que
ya existía para la terminal visual) es un `postMessage` que avisa al resto de
la app cuando ocurre un movimiento. Ese es el único punto de contacto entre
lo nuevo y lo viejo — todas las reglas de slotting, validaciones de
capacidad, mover/deshacer, bloqueo de posiciones, etc. siguen exactamente
igual que antes.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Usuarios demo (se siembran solos la primera vez
en localStorage, ver `src/auth/auth.service.js`):

| Usuario      | Password   | Rol             |
|--------------|-----------|------------------|
| admin        | admin123   | Administrador   |
| supervisor   | super123   | Supervisor      |
| operador     | oper123    | Operador        |
| lectura      | lect123    | Solo lectura    |

## Estructura

```
/public/legacy/mapa_editable_slotting.html   ← el mapa original (intocado, salvo el hook)
/src
  /auth        → login, roles/permisos, contexto de sesión
  /audit       → servicio de auditoría + vista de seguridad
  /historial   → pantalla de consulta con filtros + export Excel
  /dashboard   → productividad (ranking, tiempos, movimientos por día/hora)
  /components  → Header, Tabs, Timeline, SlottingFrame (iframe wrapper)
  /services    → storage.interface.js (contrato) + storage.local.js (adapter localStorage)
  /utils       → exportExcel.js
  /styles      → index.css
/db
  schema.sql   → DDL completo para Postgres/MySQL/SQL Server
  seed.sql     → usuarios demo (referencia)
```

## Roles y permisos (`src/auth/roles.js`)

| Acción                  | Admin | Supervisor | Operador | Solo lectura |
|--------------------------|:---:|:---:|:---:|:---:|
| Ver mapa                | ✔ | ✔ | ✔ | ✔ |
| Mover artículos          | ✔ | ✔ | ✔ | ✘ |
| Ver dashboard            | ✔ | ✔ | ✘ | ✔ |
| Ver historial            | ✔ | ✔ | ✘ | ✔ |
| Ver auditoría            | ✔ | ✔ | ✘ | ✘ |
| Exportar Excel           | ✔ | ✔ | ✘ | ✘ |
| Administrar usuarios     | ✔ | ✘ | ✘ | ✘ |

## Cómo migrar de localStorage a una API/BD real

Todo el acceso a datos pasa por `src/services/storage.local.js`, que
implementa el contrato de `storage.interface.js` (`getAll`, `insert`,
`update`, `find`). Para conectar un backend real:

1. Levantar la BD con `db/schema.sql`.
2. Crear `src/services/storage.api.js` implementando el mismo contrato,
   pero haciendo `fetch()` a tu API REST (o GraphQL) en lugar de leer
   localStorage.
3. Cambiar el import en `auth.service.js` y `audit.service.js`:
   `import { storage } from '../services/storage.local.js'` →
   `import { storage } from '../services/storage.api.js'`.

Ningún componente de React necesita cambiar, porque todos hablan con
`authService` / `auditService`, nunca directamente con el storage.

**Importante para producción:** el hash de contraseña en `auth.service.js`
usa SHA-256 en el navegador solo porque no hay backend todavía. En el
servidor real, mover el hashing a bcrypt/argon2 del lado del servidor y
que el cliente solo envíe la contraseña en texto plano por HTTPS.

## Limitaciones actuales (por diseño, mientras no hay backend)

- Los datos viven en `localStorage` del navegador: no se comparten entre
  usuarios/dispositivos distintos todavía.
- La IP del cliente no se puede obtener de forma confiable desde el
  navegador; el campo existe y se completa como `no-disponible-en-cliente`
  hasta que el backend la reporte con `req.ip`.
- El dashboard de productividad se llena a medida que se usan el mapa;
  arranca vacío en una instalación nueva.
