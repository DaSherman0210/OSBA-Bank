# OSBA Bank

Aplicación web para administrar cuentas de débito de las sucursales del banco OSBA: clientes, cuentas, transacciones, sucursales, empleados y auditoría. Usa una base de datos PostgreSQL alojada en Neon, una API en Node.js/Express y una página web en HTML + JavaScript.

```
Página web (public/index.html)  →  API (server.js, Express)  →  PostgreSQL en Neon (schema OSBA)
```

---

## Desarrollo del proyecto

### Introducción y reglas del negocio

El banco OSBA necesita automatizar la administración de cuentas de débito de sus sucursales.

Los clientes se acercan a una sucursal, registran sus datos personales, para luego declarar el tipo de divisa que trabajará la cuenta y depositar un monto inicial como su primera transacción. OSBA permite que los clientes realicen transacciones entre sí o realizar movimientos con efectivo, esto si la sucursal está abierta al público.

Detrás del funcionamiento del banco están los empleados y según su rol tienen acceso a la base de datos. Los asesores pueden dar apertura a los productos que han ofrecido sus compañeros de ventas; mientras, los supervisores pueden realizar ajustes avanzados a las cuentas (como cambiar su tipo de divisa) y cancelar transacciones, finalmente los gerentes pueden realizar despidos y auditar el sistema de transacciones.

### Reglas del negocio

- El banco solicita registrar la fecha y hora de las transacciones entre los clientes registrados. Por motivos de seguridad, si una transacción retiró más de $600 dólares de un cliente, el supervisor de su sucursal debe ser notificado.
- Entre los empleados de la sucursal destaca el gerente, él tendrá a su cargo una sucursal; al momento de cerrarla, él descargará un informe que le permitirá auditar las transacciones de los clientes registrados en la sucursal a su cargo. Para conseguir esto, se debe disponer una tabla para auditar las transacciones.
- Si una cuenta registra inactividad por 180 días y no podrá realizar retiros de ningún tipo, se debe marcar como inactiva hasta que reciba una transacción de tipo depósito con valor superior a $15000 pesos colombianos.
- Solo los supervisores de agencia cuentan con acceso a la bóveda, pueden desactivar una cuenta con divisas diferentes a la moneda local y retirar sus fondos a efectivo. Mientras que los asesores solo pueden consultar información de las cuentas en divisas extranjeras sin realizar modificaciones al sistema.
- Si se hace una transacción entre cuentas que no comparten la misma divisa, se convertirá a la tasa banco y se descontará el 2% de esa transacción.

### Estado de implementación

| Regla | Estado | Detalle |
|---|---|---|
| Registrar fecha y hora de las transacciones | Implementado | `Transaccion.fechaHora` (`TIMESTAMPTZ`, por defecto `now()`) |
| Transacciones entre clientes y movimientos en efectivo | Implementado | Transferencia, depósito y retiro desde la página, dentro de una transacción SQL |
| Tabla para auditar transacciones | Implementado | `AuditoriaCuenta` guarda saldo anterior, nuevo, contable y retenido de cada movimiento |
| Notificar al supervisor si se retiran más de $600 USD | Pendiente | No hay sistema de notificaciones |
| Gerente a cargo de una sucursal e informe al cerrar | Parcial | Existe el rol Gerente y la auditoría, pero falta vincular gerente y sucursal y generar el informe descargable |
| Cuenta inactiva por 180 días | Pendiente | Requiere un proceso programado que revise la última actividad |
| Permisos por rol (asesor, supervisor, gerente) y bóveda | Pendiente | La página no tiene login; la tabla `Rol` existe pero no se usa para restringir acciones |
| Transacciones entre divisas distintas (tasa banco y 2 % de descuento) | Pendiente | Hoy el servidor rechaza transferencias entre cuentas de monedas diferentes. Las tasas están en `Divisa.valorDolar` |
| Operar solo si la sucursal está abierta | Pendiente | Los horarios están en `Sucursal`, pero no se validan |
| Apertura de cuentas con monto inicial desde la web | Pendiente | Desde la página solo se crean clientes; las cuentas se crean por SQL |

---

## Tecnologías

- **Base de datos:** PostgreSQL en [Neon](https://neon.tech)
- **Backend:** Node.js, Express, `pg`, `dotenv`
- **Frontend:** HTML, CSS y JavaScript sin frameworks
- **Banderas de países:** imágenes de `flagcdn.com` (requiere internet)

## Requisitos

1. **Node.js 18 o superior** (recomendado la versión LTS). Descárgalo en https://nodejs.org y verifica con:
   ```bash
   node -v
   npm -v
   ```
2. **Una cuenta en Neon** (gratuita) con un proyecto creado.
3. Un navegador actualizado y conexión a internet.

## Estructura del proyecto

```
OSBA-Bank/
├── database/
│   ├── DDL.sql                    # creación del schema y las tablas
│   └── insercion_datos_OSBA.sql   # datos de prueba (40+ registros por tabla)
├── public/
│   └── index.html                 # página web
├── .env                           # credenciales (NO se sube a Git)
├── .gitignore
├── package.json
└── server.js                      # API y servidor web
```

## Instalación

### 1. Crear la base de datos en Neon

1. Entra a https://console.neon.tech y abre tu proyecto.
2. Ve al **SQL Editor**.
3. Ejecuta el contenido de `DDL.sql` completo.
4. Ejecuta después el contenido de `insercion_datos_OSBA.sql`. Hazlo con las tablas vacías: los `id` se asignan solos (1 a N) y las llaves foráneas dependen de ese orden.
5. Comprueba que los datos quedaron cargados:
   ```sql
   SELECT count(*) FROM OSBA.Cliente;   -- debe devolver 40
   ```

### 2. Instalar las dependencias

En la carpeta del proyecto:

```bash
npm install express pg dotenv
```

Si la carpeta aún no tiene `package.json`, créalo antes con `npm init -y`.

Opcional: para poder arrancar con `npm start`, agrega esto en `package.json`:

```json
"scripts": {
  "start": "node server.js"
}
```

### 3. Configurar la conexión (`.env`)

1. En Neon pulsa **Connect** y copia la cadena de conexión.
2. Crea un archivo llamado exactamente `.env` en la raíz del proyecto, junto a `server.js`:

```env
DATABASE_URL=postgresql://USUARIO:CONTRASEÑA@ep-xxxxxx.region.aws.neon.tech/neondb?sslmode=require
PORT=3000
```

Pega la cadena tal cual la entrega Neon, sin comillas ni espacios.

3. Crea un archivo `.gitignore` con este contenido, para no subir las credenciales ni las dependencias:

```
node_modules/
.env
```

### 4. Colocar los archivos

- `server.js` en la raíz del proyecto.
- `index.html` dentro de la carpeta `public/` (créala si no existe).

## Cómo ejecutarlo

```bash
node server.js
```

En la consola debe aparecer:

```
Servidor en http://localhost:3000
Conectado a Neon. Clientes en la base: 40
```

Abre http://localhost:3000 en el navegador.

Node no recarga el código solo: cada vez que cambies `server.js`, detén el servidor con **Ctrl + C** y vuelve a ejecutarlo. Cuando cambies `index.html` basta con recargar la página con **Ctrl + F5**.

## Funcionalidades de la página

- **Resumen:** totales de clientes, cuentas, sucursales y transacciones; saldo total por moneda; últimas transacciones.
- **Clientes, Cuentas, Transacciones, Sucursales, Empleados y Auditoría:** tablas que leen la base de datos, con buscador.
- **Paginación:** el usuario elige ver 10, 15 o 20 registros por página.
- **Nuevo cliente:** formulario con selector de indicativo telefónico (con bandera) para todos los países.
- **Nueva transacción:** depósito, retiro o transferencia. Se ejecuta en una sola transacción SQL que bloquea las cuentas, valida que estén activas, que compartan moneda y que el saldo disponible alcance, actualiza los saldos y registra la auditoría. Si algo falla, no se guarda nada.

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/resumen` | Totales y saldos por moneda |
| GET | `/api/catalogos` | Tipos de documento y cuentas activas (para los formularios) |
| GET | `/api/clientes` | Lista de clientes |
| POST | `/api/clientes` | Crea un cliente |
| GET | `/api/cuentas` | Cuentas con titular, tipo, estado y sucursal |
| GET | `/api/transacciones` | Últimas 500 transacciones |
| POST | `/api/transacciones` | Depósito, retiro o transferencia |
| GET | `/api/sucursales` | Sucursales con número de empleados y cuentas |
| GET | `/api/empleados` | Empleados con rol y sucursal |
| GET | `/api/auditoria` | Últimos 500 movimientos auditados |

Ejemplo de cuerpo para `POST /api/transacciones`:

```json
{ "operacion": "transferencia", "idEmisor": 5, "idReceptor": 19, "monto": 150000 }
```

`operacion` puede ser `deposito` (solo `idReceptor`), `retiro` (solo `idEmisor`) o `transferencia` (ambos).

