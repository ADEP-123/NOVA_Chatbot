# NOVA

Chatbot de consulta sobre la normativa tributaria vigente en Colombia.

Consultorio Empresarial UDES | Proyecto PROP-DET07-26

## Arquitectura

| Contenedor | Qué hace |
|---|---|
| `mysql` | Base de datos (usuarios, sesiones, chats, corpus) |
| `api` | Node + Express. Expone `/api/*` |
| `web` | React compilado y servido por nginx; nginx también reenvía `/api` a la API |
| `mailpit` | Buzón falso para desarrollo: ves los correos de verificación en http://localhost:8025 |

```
nova/
├── api/            Backend (Node + Express)
│   └── src/
│       └── migrations/   Archivos .sql que se aplican solos al arrancar
├── web/            Frontend (React + Vite)
├── data/           Matriz normativa y preguntas de ejemplo
└── docker-compose.yml
```

## Requisitos

- Docker Desktop (en Windows con WSL2 activado) o Docker Engine en Linux.
- Git.
- Node 22.

## Arrancar con Docker

```bash
cp .env.example .env      # en Windows PowerShell: copy .env.example .env
# editar .env y cambiar las contraseñas
docker compose up -d --build
```

Abrir http://localhost:8080.

Comandos útiles:

```bash
docker compose ps                 # ver qué está corriendo
docker compose logs -f api        # ver logs de la API
docker compose down               # apagar (conserva los datos)
docker compose down -v            # apagar y BORRAR la base de datos
```

## Desarrollo sin reconstruir contenedores

```bash
docker compose up -d mysql        # solo la base de datos
# en .env deja DB_HOST=localhost y publicar el puerto agregando en docker-compose.yml, servicio mysql:
#   ports: ["3306:3306"]
cd api && npm install && npm run dev      # API en :3000 con recarga automática
cd web && npm install && npm run dev      # Web en :5173, reenvía /api a :3000
```

## Base de datos

Los cambios de esquema van en `api/src/migrations/NNN_nombre.sql`. Al arrancar, la API aplica en orden los que no se han aplicado y los registra en la tabla `schema_migrations`. Nunca edites una migración ya aplicada; crea una nueva.

## Usuarios y sesiones

| Tipo | Cómo se identifica | Historial |
|---|---|---|
| `anon` (no registrado) | Cookie de sesión temporal | No se guarda |
| `registered` | Correo + contraseña, correo confirmado | Se guarda |
| `admin` | Igual que registrado, con `role = 'admin'` | Se guarda |

- Las sesiones se guardan en la tabla `sessions` de MySQL (cookie `nova.sid`, `httpOnly`). Así varios usuarios pueden usar NOVA a la vez y las sesiones sobreviven a reinicios de la API.
- El rol es texto libre en `users.role`, así que puedes crear nuevos tipos de usuario sin cambiar la base de datos.
- El administrador inicial se crea al arrancar con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
- Registro: el usuario acepta la política de datos (Ley 1581), recibe un correo de confirmación (enlace válido 48 h) y solo después puede iniciar sesión. "Recuperar contraseña" envía un enlace válido 1 hora.
- La política de datos en `/privacidad` es un **borrador**: reemplázala por la oficial de la UDES.

## Pruebas de la API

Usan una base de datos aparte (`nova_test`) que se **borra** en cada corrida. Con MySQL publicado en el puerto 3306:

```bash
docker compose exec mysql mysql -uroot -p -e "CREATE DATABASE nova_test; GRANT ALL ON nova_test.* TO 'nova'@'%';"
cd api && npm test
```

Ajusta usuario y contraseña en `api/test/.env.test` si no son `nova`/`nova`.
