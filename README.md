# Arkana Backend
![CI](https://github.com/ProyectoArkana/arkana-backend/actions/workflows/ci.yml/badge.svg)

API de microservicios (Node.js 22, Express 5, Socket.IO, PostgreSQL 15) en monorepo.

## Requisitos
Node.js 22, npm 10 o superior, Docker (solo para integracion local).

## Preparar y verificar el entorno
    npm ci
    npm run lint
    npm test
    ./scripts/verify.sh --integration

## Pipeline de CI
Archivo: .github/workflows/ci.yml. Se ejecuta en push, pull_request
(hacia main y develop) y de forma nocturna.
Etapas: analisis estatico -> unitarias -> integracion -> resumen.
El trabajo "Resumen" es obligatorio para fusionar.

## Evidencias
Ver carpeta docs/evidencias (capturas de ejecuciones).
