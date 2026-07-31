# README Files in the Repository

## Overview
This repository contains multiple README files that document different aspects of the three-tier application.

## README Files

### 1. **Root README.md** (`/README.md`)
**Purpose:** Main project documentation

**Contents:**
- Architecture overview (diagram showing Browser → Web → API → PostgreSQL)
- Technology stack table (Next.js, Express, PostgreSQL, Terraform)
- Local development setup with Docker Compose
- API endpoints reference
- Project structure overview
- GCP deployment instructions with Terraform
- Database migration guide

**Key Sections:**
- Running locally with Docker Compose
- API endpoints (GET /health, GET /tasks, POST /tasks, PATCH /tasks/:id)
- Deploying to GCP with required variables
- Database migration commands

---

### 2. **Frontend README.md** (`/src/web/README.md`)
**Purpose:** Next.js frontend-specific documentation

**Contents:**
- Standard Next.js project setup guide
- Development server startup instructions
- File editing guidance (app/page.tsx)
- Font optimization information (Geist font)
- Links to Next.js documentation
- Vercel deployment instructions

**Key Sections:**
- Getting Started (npm run dev)
- Learn More (Next.js resources)
- Deploy on Vercel

---

## Summary

| File | Location | Audience | Focus |
|------|----------|----------|-------|
| Main README | `/README.md` | All developers | Full stack setup, architecture, deployment |
| Frontend README | `/src/web/README.md` | Frontend developers | Next.js-specific development |

The main README provides comprehensive guidance for the entire application, while the frontend README focuses on Next.js-specific development practices.
