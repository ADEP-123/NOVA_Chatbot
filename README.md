# NOVA

Chatbot de consulta sobre la normativa tributaria vigente en Colombia.

Consultorio Empresarial UDES | Proyecto PROP-DET07-26

## Arquitectura

| Contenedor | Qué hace |
|---|---|
| `mysql` | Base de datos (usuarios, sesiones, chats, corpus) |
| `api` | Node + Express. Expone `/api/*` |
| `web` | React compilado y servido por nginx; nginx también reenvía `/api` a la API |
| `ollama` | Modelo de IA local (opcional, perfil `ollama`) |
| `mailpit` | Buzón falso para desarrollo: ves los correos de verificación en http://localhost:8025 |

```
nova/
├── api/            Backend (Node + Express)
│   ├── data/           normas.json (matriz) y preguntas.json (100 preguntas de referencia)
│   └── src/
│       ├── migrations/   Archivos .sql que se aplican solos al arrancar
│       ├── llm.js        Proveedor de IA (chat y embeddings)
│       └── rag/          Ingesta del corpus y búsqueda
├── web/            Frontend (React + Vite)
└── docker-compose.yml
```

## Requisitos

- Docker Desktop (en Windows con WSL2 activado) o Docker Engine en Linux.
- Git.
- Node 22 solo si vas a desarrollar fuera de Docker.

## Arrancar con Docker

```bash
cp .env.example .env      # en Windows PowerShell: copy .env.example .env
# edita .env y cambia las contraseñas
docker compose up -d --build                                              # sin GPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build   # con GPU NVIDIA
```

La primera vez, `ollama-pull` descarga los modelos (unos 3 GB). Para ver el avance: `docker compose logs -f ollama-pull`.

Abre http://localhost:8080.

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
# en .env deja DB_HOST=localhost y publica el puerto agregando en docker-compose.yml, servicio mysql:
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

## Modelo de IA

NOVA usa dos modelos:

- **Chat** (`LLM_*`): redacta la respuesta.
- **Embeddings** (`EMBED_*`): convierte textos en vectores para encontrar los fragmentos de norma relevantes.

Toda la plataforma los usa a través de `api/src/llm.js` (funciones `chat()` y `embed()`), así que **cambiar de modelo no requiere tocar código**: solo el `.env`. El proveedor `openai` sirve para cualquier API compatible con OpenAI, y casi todos los servicios la ofrecen.

### Local con Ollama (por defecto, gratis)

| Equipo | Modelo de chat sugerido |
|---|---|
| GPU de 4 GB (p. ej. GTX 1650 Ti) | `qwen2.5:3b` (por defecto) o `llama3.2:3b` |
| Solo CPU | `qwen2.5:1.5b` (más rápido, menos preciso) |
| GPU de 12–16 GB | `qwen2.5:14b` |
| GPU de 24 GB o más | `qwen2.5:32b` |

Para cambiarlo, edita `OLLAMA_PULL_MODELS` y `LLM_MODEL` y ejecuta `docker compose up -d`.

**Windows con GPU:** hay dos caminos.

- **A. Ollama dentro de Docker.** Requiere Docker Desktop con WSL2 y el driver NVIDIA actualizado. Usa el comando con `docker-compose.gpu.yml`.
- **B. Ollama instalado en Windows** (https://ollama.com/download). Suele aprovechar mejor una GPU pequeña. En el `.env` deja `COMPOSE_PROFILES=` vacío, usa `LLM_BASE_URL=http://host.docker.internal:11434/v1` y `EMBED_BASE_URL=http://host.docker.internal:11434/v1`, y descarga los modelos con `ollama pull qwen2.5:3b` y `ollama pull bge-m3`.

Varios usuarios a la vez: Ollama atiende las peticiones en cola. En un servidor con más memoria puedes subir `OLLAMA_NUM_PARALLEL` (agrégalo en `environment` del servicio `ollama`) para atender varias respuestas en paralelo.

### Cambiar a un servicio de pago

1. En `.env` cambia solo las variables `LLM_*`. Ejemplos:

| Proveedor | `LLM_BASE_URL` | `LLM_MODEL` (ejemplo) |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | `claude-haiku-5-5` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |

   Pon la clave en `LLM_API_KEY`. Los nombres de modelo cambian con el tiempo: confírmalos en la documentación del proveedor.

2. Embeddings: puedes seguir usando `bge-m3` en Ollama (gratis) o pasarlos a un servicio de pago (p. ej. OpenAI con `EMBED_MODEL=text-embedding-3-small`). **Si cambias el modelo de embeddings, reindexa el corpus** desde el panel admin.
3. Si ya no usas Ollama, deja `COMPOSE_PROFILES=` vacío.
4. `docker compose up -d` para aplicar los cambios.

Si en el futuro un proveedor no es compatible con OpenAI, se agrega un nuevo `provider` en `createProvider()` de `api/src/llm.js` con las mismas dos funciones.

> Protección de datos: con un servicio de pago, las preguntas de los usuarios se envían a ese proveedor (transferencia internacional de datos, Ley 1581). Actualiza la política de privacidad antes de activarlo.

Para desarrollar sin modelo, usa `LLM_PROVIDER=fake` y `EMBED_PROVIDER=fake`: el chat responde un texto de prueba y busca en el corpus por palabras.

## Corpus normativo (cómo sabe NOVA lo que sabe)

NOVA usa **RAG** (generación aumentada con recuperación):

1. **Ingesta.** Para cada norma de `api/data/normas.json` se indexa su **ficha** (la fila de la matriz) y se intenta descargar el **texto completo** desde `ingest_urls`. Se usa primero el normograma oficial de la DIAN y, si falla, la URL de la matriz. El texto se parte en fragmentos de unos 1.200 caracteres, respetando los artículos, y cada fragmento se convierte en un vector con el modelo de embeddings.
2. **Búsqueda.** Ante cada pregunta se buscan los fragmentos más parecidos. Si la pregunta menciona un artículo ("artículo 592"), se priorizan los fragmentos de ese artículo.
3. **Respuesta.** El modelo responde solo con esos fragmentos y cita la fuente.

Las 100 preguntas de la plantilla (`api/data/preguntas.json`) también se indexan, y además sirven como ejemplos del formato de respuesta.

### Indexar

```bash
docker compose exec api npm run ingest          # indexa lo nuevo, lo modificado y lo que falló
docker compose exec api npm run ingest -- --all # reindexa todo (p. ej. si cambiaste de modelo de embeddings)
```

La primera vez tarda (el Estatuto Tributario y el DUR 1625 son documentos grandes); con una GPU de 4 GB, calcula entre 20 y 40 minutos. Estados posibles de una fuente:

| Estado | Significado |
|---|---|
| `indexed` | Ficha y texto completo indexados |
| `partial` | No se pudo descargar el texto completo; solo está la ficha. Sube el PDF desde el panel admin |
| `error` | Falló la indexación (p. ej. Ollama apagado); se reintenta en la próxima ingesta |
| `pending` | Nueva o modificada, falta indexar |

### Actualizar la normativa

- **Editar o agregar normas:** modifica `api/data/normas.json` (mismos campos que la matriz) y reconstruye la API. Al arrancar, las fuentes cambiadas quedan como `pending`; luego corre la ingesta.
- **Subir un PDF** (una resolución nueva, un concepto DIAN o el texto de una norma que no se pudo descargar): desde el panel admin.

### Actualización hecha sobre la matriz original (octubre 2026)

- **Corrección:** el tope de 1.400 UVT para 2025 es $69.718.600, no $69.692.000.
- **Res. 000227 y 000233 de 2025:** se completaron sus descripciones (Resolución Única DIAN y su modificación de exógena).
- **Normas nuevas:** UVT 2026 ($52.374, Res. 000238 de 2025), calendario tributario 2026, Decreto 1474 de 2025 (**no vigente**), decretos legislativos 173 y 240 de 2026 (impuesto al patrimonio de personas jurídicas, normalización y alivios), Res. 000011 de 2026 (regularización de facturación) y Res. 000021 de 2026 (exógena AG 2025).
- **Estado de cada norma:** cada una tiene un campo `estado` (vigente, derogada, histórica, no vigente) para que NOVA no presente como vigente algo que ya no lo está.
- **Por verificar:** el formulario 210 (N26) podría haber sido prescrito por la Res. 000044 de 2024 y no por la 000193. Está anotado en la ficha.

## Chat

- `POST /api/chat` recibe `{ message, conversationId? }` (o `{ message, history }` si es anónimo) y responde en **streaming** (Server-Sent Events) con los eventos `meta` (fuentes y conversación), `token` (texto), `done` (tokens usados) y `error`.
- **Registrados:** cada consulta se guarda en `conversations` y `messages`; el historial aparece en la barra lateral y se puede borrar.
- **Anónimos:** el historial solo vive en la pestaña del navegador y se pierde al recargar. El servidor no lo guarda.
- El modelo recibe las instrucciones de formato (**Respuesta / Fuente**), dos ejemplos de la plantilla, los últimos 6 mensajes y los fragmentos encontrados en el corpus. Las instrucciones están en `api/src/chat/prompt.js`.
