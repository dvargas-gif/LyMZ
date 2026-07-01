-- =====================================================================
-- Esquema de base de datos · WMS Slotting Mezanine
-- Compatible con PostgreSQL / MySQL / SQL Server (ajustar tipos si es
-- necesario: SERIAL->IDENTITY en SQL Server, etc.)
-- =====================================================================

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE  -- Administrador, Supervisor, Operador, Solo lectura
);

INSERT INTO roles (nombre) VALUES
    ('Administrador'), ('Supervisor'), ('Operador'), ('Solo lectura');

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    usuario VARCHAR(60) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,   -- bcrypt/argon2 en el servidor real
    rol_id INT NOT NULL REFERENCES roles(id),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE sesiones (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuarios(id),
    ip VARCHAR(45),
    inicio TIMESTAMP NOT NULL DEFAULT NOW(),
    fin TIMESTAMP NULL,
    resultado VARCHAR(20) NOT NULL DEFAULT 'activa'  -- activa | cerrada
);

CREATE TABLE intentos_login (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(60) NOT NULL,     -- se guarda el string tipeado, exista o no la cuenta
    ip VARCHAR(45),
    fecha_hora TIMESTAMP NOT NULL DEFAULT NOW(),
    exitoso BOOLEAN NOT NULL
);

-- Tabla de auditoría. NUNCA se hace DELETE sobre esta tabla desde la app;
-- solo el DBA con acceso directo podría, y no se recomienda.
CREATE TABLE auditoria (
    id SERIAL PRIMARY KEY,
    usuario_id INT NULL REFERENCES usuarios(id),   -- NULL permitido: ej. login fallido con usuario inexistente
    usuario_nombre VARCHAR(120),                    -- snapshot, sobrevive si el usuario se borra/renombra
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    ip VARCHAR(45),
    accion VARCHAR(30) NOT NULL,          -- movimiento | login | logout | login_fallido | cambio_password | admin
    rack_origen VARCHAR(20),
    nivel_origen VARCHAR(20),
    rack_destino VARCHAR(20),
    nivel_destino VARCHAR(20),
    articulo VARCHAR(40),
    cantidad INT DEFAULT 0,
    tipo_movimiento VARCHAR(20),           -- individual | cuerpo_completo
    estado VARCHAR(20) NOT NULL DEFAULT 'Correcto',  -- Correcto | Cancelado | Deshecho
    observaciones TEXT
);

CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);
CREATE INDEX idx_auditoria_accion ON auditoria(accion);
CREATE INDEX idx_auditoria_rack_origen ON auditoria(rack_origen);
CREATE INDEX idx_auditoria_rack_destino ON auditoria(rack_destino);
