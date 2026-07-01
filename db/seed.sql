-- Usuarios demo. Los password_hash de ejemplo abajo son ilustrativos
-- (en el backend real se generan con bcrypt en el momento de creación,
-- nunca se insertan hashes fijos en un seed de producción).
INSERT INTO usuarios (nombre, usuario, password_hash, rol_id, activo) VALUES
('Ana Administradora', 'admin',      '$2b$10$reemplazar_por_hash_bcrypt_real', 1, TRUE),
('Sofía Supervisora',  'supervisor', '$2b$10$reemplazar_por_hash_bcrypt_real', 2, TRUE),
('Óscar Operador',     'operador',   '$2b$10$reemplazar_por_hash_bcrypt_real', 3, TRUE),
('Lucía Lectura',      'lectura',    '$2b$10$reemplazar_por_hash_bcrypt_real', 4, TRUE);
