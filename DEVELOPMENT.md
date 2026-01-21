# Getting Started

Follow the steps below to get the app running locally without Encore.

## Prerequisites

You also need to have bun installed for package management. If you don't have bun installed, you can install it by running:

```bash
npm install -g bun
```

## Running the Application

### Backend Setup

1. Start the backend from the repository root:
   ```bash
   npm run dev:backend
   ```

The backend will be available at the URL shown in your terminal (typically `http://localhost:4000`).

### Prisma Migrations & Seed

Set the JWT secret and database URL for the API server:

```bash
export JWT_SECRET="change-me"
export DATABASE_URL="postgresql://user:password@localhost:5432/cellqos"
```

Ensure the database has `pgcrypto` enabled for password hashing:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

Generate the Prisma client, run migrations, and seed data:

```bash
cd backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```



### Frontend Setup

1. Install the dependencies:
   ```bash
   npm install
   ```

2. Start the development server from the repository root:
   ```bash
   npm run dev:frontend
   ```

The frontend will be available at `http://localhost:5173` (or the next available port).

If the API server runs elsewhere, set:

```bash
export VITE_API_BASE_URL="http://localhost:4000"
```


### Frontend Client

The frontend uses direct HTTP calls, so no client generation step is required.
