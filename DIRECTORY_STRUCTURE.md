# Repository Directory Structure

This is a three-tier web application with a Next.js frontend, Express REST API, and PostgreSQL database. Below is a complete description of all directories and their purposes.

## Root Level Directories

### `.git/`
Git version control directory containing the repository history, configuration, and metadata.

### `.github/`
GitHub-specific configuration directory containing workflows and CI/CD automation.

#### `.github/workflows/`
Contains GitHub Actions workflow files for continuous integration and deployment.
- **deploy.yml** — Automated deployment workflow that builds and deploys the application to GCP.

### `src/`
Main source code directory containing all application code organized into four tiers.

---

## Source Code Directories (`src/`)

### `src/api/`
**Express REST API backend** — Node.js server that handles all business logic and database operations.

**Purpose:** Provides REST endpoints for the frontend to interact with the database. Runs on port 3001 internally.

**Key files:**
- **index.js** — Main Express application with route handlers for tasks (GET, POST, PATCH)
- **db.js** — PostgreSQL connection pool configuration
- **index.test.js** — Unit tests for API endpoints
- **Dockerfile** — Container configuration for running the API service
- **package.json** — Node.js dependencies and scripts
- **.dockerignore** — Files to exclude from Docker image

**API Endpoints:**
- `GET /health` — Health check
- `GET /tasks` — List all tasks
- `POST /tasks` — Create a new task
- `PATCH /tasks/:id` — Update a task

---

### `src/db/`
**Database migrations and schema management** — Handles PostgreSQL schema versioning and initialization.

**Purpose:** Manages database schema changes using node-pg-migrate. Runs as a one-time service during Docker Compose startup to apply all pending migrations.

**Key files:**
- **migrations/** — Directory containing all database migration files
- **Dockerfile** — Container configuration for running migrations
- **package.json** — Dependencies including node-pg-migrate
- **.dockerignore** — Files to exclude from Docker image

#### `src/db/migrations/`
Contains timestamped migration files that define database schema changes.

**Migration files:**
- **1718500000000_initial-schema.js** — Initial database setup (creates app user, database, etc.)
- **1718500001000_create-tasks.js** — Creates the tasks table with columns for id, title, completed, and timestamps

---

### `src/web/`
**Next.js frontend application** — React-based user interface for the task manager.

**Purpose:** Provides the web UI that users interact with. Runs on port 3000 and communicates with the API backend.

**Key files and directories:**
- **app/** — Next.js App Router directory containing pages and components
- **public/** — Static assets (SVG icons, images)
- **Dockerfile** — Container configuration for running the web service
- **package.json** — Node.js dependencies and build scripts
- **next.config.ts** — Next.js configuration
- **tsconfig.json** — TypeScript configuration
- **postcss.config.mjs** — PostCSS configuration for Tailwind CSS
- **eslint.config.mjs** — ESLint configuration for code quality
- **.dockerignore** — Files to exclude from Docker image
- **.gitignore** — Git ignore rules for Next.js projects
- **README.md** — Next.js project documentation
- **AGENTS.md** — Documentation for AI agents working on this project
- **CLAUDE.md** — Claude-specific documentation

#### `src/web/app/`
Next.js App Router directory containing the application structure.

**Files:**
- **layout.tsx** — Root layout component wrapping all pages
- **page.tsx** — Home page component (main task manager UI)
- **actions.ts** — Server actions for API communication
- **globals.css** — Global CSS styles
- **favicon.ico** — Browser tab icon

#### `src/web/public/`
Static assets served directly by the web server.

**Files:**
- **next.svg** — Next.js logo
- **vercel.svg** — Vercel logo
- **globe.svg** — Globe icon
- **file.svg** — File icon
- **window.svg** — Window icon

---

### `src/infrastructure/`
**Terraform infrastructure-as-code for GCP deployment** — Defines cloud resources for production deployment.

**Purpose:** Provisions and manages Google Cloud Platform resources including VPC, Cloud SQL, Cloud Run services, and IAM configurations.

**Key files:**
- **main.tf** — Primary Terraform configuration defining all GCP resources
- **variables.tf** — Input variables for Terraform (project_id, region, environment, etc.)
- **outputs.tf** — Output values after Terraform apply (web_url, API endpoints, etc.)
- **migration.tf** — Terraform configuration for database migration service
- **terraform.tfvars.example** — Example variables file template
- **.gitignore** — Ignores sensitive Terraform state files

**Provisions:**
- VPC network and subnet for private communication
- Cloud SQL PostgreSQL 17 instance (private IP)
- Cloud Run services for API and web frontend
- Secret Manager secret for database URL
- Service accounts and IAM role bindings

---

## Root Level Files

### `docker-compose.yml`
Docker Compose configuration that orchestrates local development environment with four services:
1. **postgres** — PostgreSQL 17 database
2. **migrate** — Runs database migrations
3. **api** — Express API server
4. **web** — Next.js frontend

### `README.md`
Main project documentation including:
- Architecture overview
- Local development setup instructions
- API endpoint documentation
- GCP deployment guide
- Database migration instructions

### `agents.md`
Documentation for AI agents and automation tools working on this project.

### `LICENSE`
Project license file.

### `.gitignore`
Git ignore rules for the entire repository.

---

## Architecture Summary

```
Browser (port 3000)
    ↓
Next.js Web Frontend (src/web/)
    ↓
Express API (src/api/, port 3001)
    ↓
PostgreSQL Database (managed by src/db/)
```

**Deployment:**
- Local: Docker Compose orchestrates all services
- Production: Terraform provisions GCP resources (Cloud Run + Cloud SQL)
- CI/CD: GitHub Actions workflows automate deployment

