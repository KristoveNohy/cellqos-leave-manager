# Setup Guide

Nasledujte kroky nižšie, aby ste aplikáciu spustili lokálne bez Encore.

## Predpoklady

Na správu balíkov je potrebný aj bun. Ak ho nemáte nainštalovaný, použite:

```bash
npm install -g bun
```

## Spustenie aplikácie

### Backend

1. Spustite backend z koreňa repozitára:
   ```bash
   npm run dev:backend
   ```

Backend bude dostupný na adrese zobrazené v termináli (typicky `http://localhost:4000`).

### Prisma migrácie a seed

Prisma schéma sa nachádza v `backend/prisma/schema.prisma`. Pred prvým spustením nastavte JWT secret a databázové pripojenie pre API server:

```bash
export JWT_SECRET="change-me"
export DATABASE_URL="postgresql://user:password@localhost:5432/cellqos"
```

Následne skontrolujte, že databáza má zapnuté rozšírenie `pgcrypto` (kvôli heslám):

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

Migrácie a seed spustite v `backend`:

```bash
cd backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

### Frontend

1. Nainštalujte závislosti:
   ```bash
   npm install
   ```

2. Spustite vývojový server z koreňa repozitára:
   ```bash
   npm run dev:frontend
   ```

Frontend bude dostupný na `http://localhost:5173` (alebo na najbližšom voľnom porte).

Ak backend beží na inom URL, nastavte vo fronte:

```bash
export VITE_API_BASE_URL="http://localhost:4000"
```

### Autentifikácia

Aplikácia používa email + heslo, voliteľne magic link. API endpointy:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/magic-link`
- `POST /auth/magic-link/verify`

Demo účty používajú heslo `Password123!`.

### Generovanie frontend klienta

Frontend používa lokálny HTTP klient, takže nie je potrebné generovať špeciálne klienty.
