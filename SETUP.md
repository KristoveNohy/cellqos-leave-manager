# Setup Guide

Tento projekt je Encore aplikácia. Nasledujte kroky nižšie, aby ste aplikáciu spustili lokálne.

## Predpoklady

Ak Encore používate prvýkrát, nainštalujte CLI, ktoré spúšťa lokálne vývojové prostredie. Použite príkaz podľa vášho systému:

- **macOS:** `brew install encoredev/tap/encore`
- **Linux:** `curl -L https://encore.dev/install.sh | bash`
- **Windows:** `iwr https://encore.dev/install.ps1 | iex`

Na správu balíkov je potrebný aj bun. Ak ho nemáte nainštalovaný, použite:

```bash
npm install -g bun
```

## Spustenie aplikácie

### Backend

1. Prejdite do priečinka backendu:
   ```bash
   cd backend
   ```

2. Spustite Encore vývojový server:
   ```bash
   encore run
   ```

Backend bude dostupný na adrese zobrazené v termináli (typicky `http://localhost:4000`).

### Frontend

1. Prejdite do priečinka frontendu:
   ```bash
   cd frontend
   ```

2. Nainštalujte závislosti:
   ```bash
   npm install
   ```

3. Spustite vývojový server:
   ```bash
   npx vite dev
   ```

Frontend bude dostupný na `http://localhost:5173` (alebo na najbližšom voľnom porte).

### Generovanie frontend klienta

Ak chcete vygenerovať frontend klienta, spustite tento príkaz v priečinku `backend`:

```bash
encore gen client --target leap
```

## Nasadenie

### Self-hosting

Pozrite si [pokyny pre self-hosting](https://encore.dev/docs/self-host/docker-build), ako použiť `encore build docker` na vytvorenie Docker image a jeho konfiguráciu.

### Encore Cloud Platform

#### Krok 1: Prihláste sa do Encore Cloud

Pred nasadením overte, že je Encore CLI prihlásené do vášho Encore účtu (rovnako ako Leap účet):

```bash
encore auth login
```

#### Krok 2: Nastavte Git remote

Pridajte Encore git remote pre priame nasadenie:

```bash
git remote add encore encore://cellqos-leave-manager-9st2
```

#### Krok 3: Nasadenie aplikácie

Nasadenie prebieha pushnutím kódu:

```bash
git add -A .
git commit -m "Deploy to Encore Cloud"
git push encore
```

Postup nasadenia sledujte v [Encore Cloud dashboarde](https://app.encore.dev/cellqos-leave-manager-9st2/deploys).

## GitHub integrácia (odporúčané pre produkciu)

Pre produkčné aplikácie odporúčame integráciu s GitHubom namiesto spravovaného git repa v Encore.

### Prepojenie GitHub účtu

1. Otvorte aplikáciu v **Encore Cloud dashboarde**
2. Prejdite na Encore Cloud [GitHub Integration settings](https://app.encore.cloud/cellqos-leave-manager-9st2/settings/integrations/github)
3. Kliknite na **Connect Account to GitHub**
4. Udeľte prístup k repozitáru

Po prepojení bude push do GitHub repozitára automaticky spúšťať nasadenia. Encore Cloud Pro používatelia získajú aj Preview Environments pre každý pull request.

### Nasadenie cez GitHub

Po prepojení GitHubu nasadzujte pushnutím do repozitára:

```bash
git add -A .
git commit -m "Deploy via GitHub"
git push origin main
```

## Ďalšie zdroje

- [Encore Documentation](https://encore.dev/docs)
- [Deployment Guide](https://encore.dev/docs/platform/deploy/deploying)
- [GitHub Integration](https://encore.dev/docs/platform/integrations/github)
- [Encore Cloud Dashboard](https://app.encore.dev)
