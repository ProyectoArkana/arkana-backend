Proyecto Arkana - Backend API

Arquitectura de microservicios para el motor de juego de Arkana (Juego de cartas híbrido NFC). Construido con Node.js, Express, Socket.io, PostgreSQL y Redis.

📋 Requisitos Previos

Antes de empezar, asegúrate de tener instalado en tu computadora:

Node.js (v18 o superior)

Docker y Docker Compose (para levantar las bases de datos)

Git

🚀 Instalación y Configuración
1. Clonar el repositorio y cambiar a la rama de desarrollo
git clone <URL_DEL_REPOSITORIO>
cd arkana-backend
git checkout develop

2. Instalar dependencias globales del Monorepo

Gracias a NPM Workspaces, un solo comando instala las librerías de todos los microservicios:

npm install

3. Levantar las Bases de Datos (PostgreSQL y Redis)

Asegúrate de que el motor de Docker esté abierto en tu computadora y ejecuta:

docker compose up -d


Para apagar las bases de datos al terminar tu jornada:

docker compose down

🖥️ Levantando los Microservicios

Para poder ver los errores claramente, se recomienda encender cada servicio en una terminal separada.

Ejecuta estos comandos desde la raíz del proyecto (arkana-backend):

API Gateway — Enrutador principal
npm run dev --workspace=services/api-gateway

Auth Service — Login y JWT
npm run dev --workspace=services/auth-service

User Service — Perfiles y Estadísticas
npm run dev --workspace=services/user-service

Card Service — Catálogo, Mazos y NFC
npm run dev --workspace=services/card-service

Matchmaking Service — Cola de espera con Redis
npm run dev --workspace=services/matchmaking-service

Match Service — Motor de Combate en vivo con WebSockets
npm run dev --workspace=services/match-service

🗺️ Mapa de Puertos

Toda la comunicación desde la aplicación móvil debe apuntar únicamente al puerto 3000, correspondiente al API Gateway.

El Gateway se encarga de redirigir el tráfico internamente a los siguientes servicios:

Servicio	Puerto Local	Tecnología	Base de Datos
API Gateway	3000	Express / Proxy	N/A
Auth Service	3001	Express REST	PostgreSQL
User Service	3002	Express REST	PostgreSQL
Card Service	3003	Express REST	PostgreSQL
Matchmaking	3004	Express REST	Redis
Match Service	3005	Socket.io (WS)	N/A
🌿 Flujo de Trabajo Git (GitFlow)
Regla de Oro

NUNCA trabajar directamente en las ramas develop ni main.

1. Sincroniza tu entorno local antes de empezar
git checkout develop
git pull origin develop

2. Crea tu rama para la nueva tarea

Ejemplos:

git checkout -b daniel/login-ui

git checkout -b leonardo/nfc-scan


También puedes utilizar el formato:

git checkout -b <tu-nombre>/<nombre-de-la-tarea>

3. Escribe tu código y guarda tus cambios

Agrega los archivos modificados:

git add .


Crea el commit:

git commit -m "feat: descripción clara de tu avance"

4. Sube tu rama a GitHub
git push -u origin <tu-nombre>/<nombre-de-la-tarea>

5. Crea el Pull Request

Ve a GitHub y abre un Pull Request apuntando hacia la rama:

develop

