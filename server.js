require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Helper para rutas GET que solo ejecutan una consulta
const get = (ruta, sql) => app.get(ruta, async (req, res) => {
  try { res.json((await pool.query(sql)).rows); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

get('/api/clientes', `
  SELECT c.id, c.nombre, td.nombre AS "tipoDocumento", c.numeroDocumento AS "numeroDocumento",
         c.correo, c.telefono, c.lugarNacimiento AS "lugarNacimiento", c.estado
  FROM OSBA.Cliente c JOIN OSBA.TipoDocumento td ON td.id = c.idTipoDocumento
  ORDER BY c.id`);

get('/api/cuentas', `
  SELECT cu.id, cu.numeroCuenta AS "numeroCuenta", cl.nombre AS cliente, tc.nombre AS "tipoCuenta",
         ec.nombre AS "estadoCuenta", s.nombre AS sucursal, cu.saldo, cu.tipoMoneda AS "tipoMoneda"
  FROM OSBA.Cuenta cu
  JOIN OSBA.Cliente cl ON cl.id = cu.idCliente
  JOIN OSBA.TipoCuenta tc ON tc.id = cu.idTipoCuenta
  JOIN OSBA.EstadoCuenta ec ON ec.id = cu.idEstadoCuenta
  JOIN OSBA.Sucursal s ON s.id = cu.idSucursalApertura
  ORDER BY cu.id`);

get('/api/transacciones', `
  SELECT t.id, t.fechaHora AS "fechaHora", tt.nombre AS tipo, ce.numeroCuenta AS emisor,
         cr.numeroCuenta AS receptor, t.monto, d.nombre AS divisa, t.estado
  FROM OSBA.Transaccion t
  JOIN OSBA.TipoTransaccion tt ON tt.id = t.idTipoTransaccion
  JOIN OSBA.Divisa d ON d.id = t.idDivisa
  LEFT JOIN OSBA.Cuenta ce ON ce.id = t.idEmisor
  LEFT JOIN OSBA.Cuenta cr ON cr.id = t.idReceptor
  ORDER BY t.fechaHora DESC, t.id DESC LIMIT 500`);

get('/api/sucursales', `
  SELECT s.id, s.nombre, to_char(s.horaApertura,'HH24:MI') AS apertura, to_char(s.horaCierre,'HH24:MI') AS cierre,
         (SELECT count(*) FROM OSBA.Empleado e WHERE e.idSucursal = s.id)::int AS empleados,
         (SELECT count(*) FROM OSBA.Cuenta c WHERE c.idSucursalApertura = s.id)::int AS cuentas, s.estado
  FROM OSBA.Sucursal s ORDER BY s.id`);

get('/api/empleados', `
  SELECT e.id, e.nombre, r.nombre AS rol, s.nombre AS sucursal, e.correo, e.telefono, e.estado
  FROM OSBA.Empleado e JOIN OSBA.Rol r ON r.id = e.idRol JOIN OSBA.Sucursal s ON s.id = e.idSucursal
  ORDER BY e.id`);

get('/api/auditoria', `
  SELECT a.id, a.fechaHora AS "fechaHora", cu.numeroCuenta AS "numeroCuenta", a.tipoOperacion AS "tipoOperacion",
         a.valorAnterior AS "valorAnterior", a.valorNuevo AS "valorNuevo",
         a.saldoContable AS "saldoContable", a.saldoRetenido AS "saldoRetenido"
  FROM OSBA.AuditoriaCuenta a JOIN OSBA.Cuenta cu ON cu.id = a.idCuenta
  ORDER BY a.fechaHora DESC, a.id DESC LIMIT 500`);

// Datos para el dashboard
app.get('/api/resumen', async (req, res) => {
  try {
    const [t, s] = await Promise.all([
      pool.query(`SELECT (SELECT count(*) FROM OSBA.Cliente)::int AS clientes,
                         (SELECT count(*) FROM OSBA.Cuenta)::int AS cuentas,
                         (SELECT count(*) FROM OSBA.Sucursal)::int AS sucursales,
                         (SELECT count(*) FROM OSBA.Transaccion)::int AS transacciones`),
      pool.query(`SELECT tipoMoneda AS "tipoMoneda", sum(saldo) AS total, count(*)::int AS cuentas
                  FROM OSBA.Cuenta GROUP BY tipoMoneda ORDER BY count(*) DESC`),
    ]);
    res.json({ totales: t.rows[0], saldos: s.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Datos para los formularios (select)
app.get('/api/catalogos', async (req, res) => {
  try {
    const [td, cu] = await Promise.all([
      pool.query('SELECT id, nombre FROM OSBA.TipoDocumento WHERE estado ORDER BY id'),
      pool.query(`SELECT cu.id, cu.numeroCuenta AS "numeroCuenta", cl.nombre AS cliente, cu.saldo, cu.tipoMoneda AS "tipoMoneda"
                  FROM OSBA.Cuenta cu JOIN OSBA.Cliente cl ON cl.id = cu.idCliente
                  WHERE cu.idEstadoCuenta = 1 ORDER BY cu.id`),
    ]);
    res.json({ tiposDocumento: td.rows, cuentas: cu.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear cliente
app.post('/api/clientes', async (req, res) => {
  const b = req.body;
  try {
    const { rows } = await pool.query(`
      INSERT INTO OSBA.Cliente (nombre, numeroDocumento, idTipoDocumento, correo, telefono, fechaNacimiento, lugarNacimiento, direccion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [b.nombre, b.numeroDocumento, b.idTipoDocumento, b.correo, b.telefono, b.fechaNacimiento, b.lugarNacimiento, b.direccion]);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Depósito, retiro o transferencia: todo en una sola transacción SQL
app.post('/api/transacciones', async (req, res) => {
  const { operacion } = req.body;
  const monto = Number(req.body.monto);
  const tipo = { deposito: 1, retiro: 2, transferencia: 3 }[operacion]; // ids en TipoTransaccion
  const em = operacion === 'deposito' ? null : Number(req.body.idEmisor) || null;
  const re = operacion === 'retiro' ? null : Number(req.body.idReceptor) || null;
  const falta = operacion === 'transferencia' ? !(em && re) : !(em || re);
  if (!tipo || !(monto > 0) || falta || em === re) return res.status(400).json({ error: 'Datos inválidos' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const ids = [em, re].filter(Boolean).sort((a, b) => a - b); // orden fijo evita deadlocks
    const { rows } = await db.query(
      `SELECT id, saldo, tipoMoneda AS moneda, idEstadoCuenta AS estado
       FROM OSBA.Cuenta WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [ids]);
    if (rows.length !== ids.length) throw new Error('Cuenta no encontrada');
    if (rows.some(c => c.estado !== 1)) throw new Error('Solo se puede operar con cuentas activas');
    if (new Set(rows.map(c => c.moneda)).size > 1) throw new Error('Las cuentas deben tener la misma moneda');
    const cuentas = Object.fromEntries(rows.map(c => [c.id, c]));

    const mover = async (id, delta, op) => {
      const { rows: [a] } = await db.query(
        'SELECT saldoRetenido AS ret FROM OSBA.AuditoriaCuenta WHERE idCuenta = $1 ORDER BY id DESC LIMIT 1', [id]);
      const ret = a ? Number(a.ret) : 0;
      if (delta < 0 && Number(cuentas[id].saldo) - ret < -delta) throw new Error('Saldo disponible insuficiente');
      // La auditoría la inserta automáticamente el trigger trgAuditarCuenta (AFTER UPDATE sobre Cuenta).
      // Solo le indicamos qué operación es:
      await db.query("SELECT set_config('osba.operacion', $1, true)", [op]);
      await db.query('UPDATE OSBA.Cuenta SET saldo = saldo + $1 WHERE id = $2', [delta, id]);
    };
    if (em) await mover(em, -monto, re ? 'TRANSFERENCIA_ENVIADA' : 'RETIRO');
    if (re) await mover(re, monto, em ? 'TRANSFERENCIA_RECIBIDA' : 'DEPOSITO');

    const { rows: [d] } = await db.query('SELECT id FROM OSBA.Divisa WHERE nombre = $1', [rows[0].moneda]);
    if (!d) throw new Error('La moneda de la cuenta no existe en Divisa');
    const { rows: [t] } = await db.query(
      `INSERT INTO OSBA.Transaccion (idEmisor, idReceptor, idDivisa, idTipoTransaccion, monto)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`, [em, re, d.id, tipo, monto]);
    await db.query('COMMIT');
    res.status(201).json(t);
  } catch (e) {
    await db.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { db.release(); }
});

pool.query('SELECT count(*) FROM OSBA.Cliente')
  .then(r => console.log(`Conectado a Neon. Clientes en la base: ${r.rows[0].count}`))
  .catch(e => console.error('No se pudo conectar a Neon:', e.message));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));