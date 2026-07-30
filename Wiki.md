# Wiki

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Key decisions](#key-decisions)
- [Known issues](#known-issues)

---

## Overview

`example-three-tier-application` is a reference implementation of a three-tier web application built as a task manager (to-do list). Its primary purpose is to demonstrate how a modern web stack — frontend, API, and relational database — fits together across local development, containerised testing, and a cloud production environment.

| Tier | Technology |
|------|-----------|
| Web (frontend) | Next.js 16, React 19, Tailwind CSS |
| API (backend) | Express 5, Node.js 22 |
| Database | PostgreSQL 17, node-pg-migrate |
| Infrastructure | Terraform on Google Cloud Platform |

The application is intentionally simple. It is meant to be read and understood quickly, then used as a starting point or a comparison reference — not as a production product.

---

## Architecture

### Request flow

```
Browser
  │
  ▼
Next.js  (port 3000, public)
  │  HTTP
  ▼
Express  (port 3001, internal only)
  │  SQL
  ▼
PostgreSQL (port 5432, internal only)
```

The web tier is the only service exposed outside the Docker network (or Cloud Run public endpoint). The API is internal; it is never directly reachable by a browser or external client.

### Directory layout

```
.
├── src/
│   ├── api/            # Express 5 application and Jest tests
│   ├── web/            # Next.js 16 application
│   ├── db/
│   │   └── migrations/ # node-pg-migrate migration files
│   └── infrastructure/ # Terraform modules and variable definitions
├── docker-compose.yml  # Local development orchestration
├── .github/
│   └── workflows/
│       └── deploy.yml  # CI/CD pipeline
└── agents.md           # Project conventions for contributors and agents
```

### API endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check; also verifies database connectivity |
| `GET` | `/tasks` | — | List all tasks, ordered by creation time |
| `POST` | `/tasks` | `{ "title": "string" }` | Create a task |
| `PATCH` | `/tasks/:id` | `{ "completed": bool, "title": "string" }` | Update a task |

### Database schema

Migrations live in `src/db/migrations/` and are applied in order by node-pg-migrate. Two migrations exist today:

1. **`initial-schema`** — creates a `users` table.
2. **`create-tasks`** — creates the `tasks` table.

```sql
-- tasks table
id          SERIAL PRIMARY KEY
title       VARCHAR(500) NOT NULL
completed   BOOLEAN NOT NULL DEFAULT false
created_at  TIMESTAMP NOT NULL DEFAULT now()
```

### Cloud infrastructure (GCP)

Terraform in `src/infrastructure/` provisions:

- **VPC** — isolated network for all services.
- **Cloud SQL** — PostgreSQL 17 instance on a private IP.
- **Cloud Run** — separate services for the API and web containers.
- **Secret Manager** — stores `DATABASE_URL`; injected into Cloud Run at runtime.
- **Service accounts & IAM** — least-privilege bindings for each service.

Key Terraform input variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `project_id` | *(required)* | GCP project to deploy into |
| `api_image` | *(required)* | Full GCR image path for the API |
| `web_image` | *(required)* | Full GCR image path for the web |
| `region` | `us-central1` | GCP region |
| `environment` | `dev` | Deployment environment (`dev` / `staging` / `prod`) |

### CI/CD pipeline

The pipeline is defined in `.github/workflows/deploy.yml` and triggers on every push to `main` or via manual dispatch. It uses GCP Workload Identity Federation for keyless authentication.

Three sequential jobs:

1. **`build`** — Builds and pushes three Docker images (api, web, db/migrate) to Google Container Registry, tagged with the git SHA.
2. **`infrastructure`** — Runs `terraform apply` to converge cloud infrastructure.
3. **`migrate`** — Executes a Cloud Run Job to apply any pending database migrations.

---

## Getting started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin
- Ports `3000` and `5432` available on your machine

### Run locally

```bash
# Clone the repository
git clone <repo-url>
cd example-three-tier-application

# Build images and start all services
docker compose up --build
```

Docker Compose starts four services in dependency order:

| Service | Role | Exposed port |
|---------|------|-------------|
| `postgres` | Database (waits for health check) | internal |
| `migrate` | Runs migrations then exits | — |
| `api` | Express API | internal |
| `web` | Next.js frontend | `3000` |

Once all services are running, open **http://localhost:3000** in your browser.

### Stop and clean up

```bash
# Stop containers, keep the postgres_data volume
docker compose down

# Stop containers and delete all data
docker compose down -v
```

### Run the API tests

```bash
cd src/api
npm install
npm test
```

Tests use Jest and supertest against the Express application.

### Add a database migration

1. Create a new file in `src/db/migrations/` following the existing timestamp-prefixed naming convention.
2. Write only additive changes — see [Key decisions](#key-decisions) for the append-only rule.
3. Never edit or delete an existing migration file.
4. Test locally by restarting the `migrate` service:

```bash
docker compose up migrate --build
```

### Deploy to GCP

```bash
cd src/infrastructure

# Copy and fill in the example variables file
cp terraform.tfvars.example terraform.tfvars

# Initialise Terraform (supply your GCS bucket for remote state)
terraform init \
  -backend-config="bucket=<your-tf-state-bucket>" \
  -backend-config="prefix=terraform/dev"

# Preview and apply
terraform plan  -var="project_id=<your-project>" \
                -var="api_image=gcr.io/<your-project>/api:latest" \
                -var="web_image=gcr.io/<your-project>/web:latest"
terraform apply ...

# Get the public URL
terraform output web_url
```

The CI/CD pipeline (`deploy.yml`) automates these steps on every push to `main`.

---

## Key decisions

These conventions are documented in `agents.md` and must be followed by all contributors.

**Migrations are append-only.**
Migration files are never modified or deleted after they have been applied. New schema changes always go in a new migration file. This ensures the migration history is a reliable, replayable audit trail and prevents environment drift.

**The API is internal only.**
The Express API is not exposed outside the Docker network or the private VPC. All browser traffic enters through the Next.js web tier. This keeps the public attack surface minimal and makes the web layer the single point of entry for request validation and routing.

**Environment variables are the configuration boundary.**
No connection strings, credentials, or environment-specific values are hardcoded in application code. All configuration is injected via environment variables — locally through Docker Compose and in production through GCP Secret Manager and Cloud Run environment configuration.

**Node.js 22 and PostgreSQL 17 are the pinned runtimes.**
Any new Dockerfile or service added to the project must use Node.js 22 and PostgreSQL 17 to stay consistent with the existing services and the Cloud SQL instance provisioned by Terraform.

---

## Known issues

**No tests for the web tier.**
`src/web/` has no test suite. Frontend behaviour is currently unverified by automated tests.

**No tests for the database package.**
`src/db/package.json` defines the test script as `echo "Error: no test specified" && exit 1`. Migration correctness is not automatically verified.

**The `users` table is unused.**
The `initial-schema` migration creates a `users` table, but no application code reads from or writes to it. Any future work that requires user accounts should evaluate whether to build on this table or replace it with a new migration.

**`app_name` is hardcoded in CI.**
The `app_name` environment variable is set to the literal string `"todo"` inside `deploy.yml`. If the application is forked or renamed, this value must be updated manually in the workflow file.
