# NOVA

Chatbot de consulta sobre la normativa tributaria vigente en Colombia.

Consultorio Empresarial UDES | Proyecto PROP-DET07-26

## Arquitectura

| Contenedor | Qué hace |
|---|---|
| `mysql` | Base de datos (usuarios, sesiones, chats, corpus) |
| `api` | Node + Express. Expone `/api/*` |
| `web` | React compilado y servido por nginx; nginx también reenvía `/api` a la API |

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

Los cambios de esquema van en `api/src/migrations/NNN_nombre.sql`. Al arrancar, la API aplica en orden los que no se han aplicado y los registra en la tabla `schema_migrations`. Nunca editar una migración ya aplicada; crear una nueva.
