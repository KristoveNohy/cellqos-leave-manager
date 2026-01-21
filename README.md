# CellQos Leave Manager

Komplexný systém správy dovoleniek a absencií s riadením prístupu podľa rolí.

## Funkcie

### Kľúčové funkcie (MVP)
- **Kalendárový prehľad**: Mesačný/týždenný pohľad na všetky žiadosti o voľno
- **Žiadosti o voľno**: Vytvárať, upravovať a rušiť žiadosti s viacerými typmi (dovolenka, PN, home office, neplatené voľno, iné)
- **Schvaľovací workflow**: Manažéri môžu schvaľovať/zamietať žiadosti s komentármi
- **Riadenie prístupu podľa rolí**:
  - **EMPLOYEE**: Zobrazenie vlastného kalendára, vytváranie/úprava vlastných žiadostí (len DRAFT/PENDING)
  - **MANAGER**: Plný prístup ku všetkým žiadostiam, správa používateľov, schvaľovací workflow

### Pokročilé funkcie (v1)
- **Limity tímu**: Maximálny počet súčasných schválených absencií za deň
- **Sviatky**: Slovenské sviatky + správa vlastných sviatkov
- **Export**: Export žiadostí o voľno do CSV
- **Hromadné operácie**: Schválenie/zamietnutie viacerých žiadostí naraz
- **Vyhľadávanie a filtre**: Pokročilé filtrovanie podľa používateľa, typu, stavu, dátumov, tímu
- **Prílohy**: Nahrávanie dokumentov pre PN a iné typy
- **Audit log**: Kompletná história všetkých zmien
- **Zostatok dovolenky**: Sledovanie nároku, vyčerpania a zostávajúcich dní

## Technologický stack

- **Frontend**: React, TypeScript, shadcn/ui, React Big Calendar, React Hook Form, Zod
- **Backend**: Node.js (Express), PostgreSQL
- **ORM**: Prisma (migrácie + seed)
- **Autentifikácia**: Email + heslo, voliteľne magic link, JWT session

## Schéma databázy

### Tabuľky

**users**
- id (string, primary key) - ID používateľa
- email (string, unique)
- name (string)
- role (enum: EMPLOYEE, MANAGER)
- team_id (bigint, foreign key)
- is_active (boolean)
- created_at, updated_at (timestamp)

**teams**
- id (bigserial, primary key)
- name (string, unique)
- max_concurrent_leaves (integer, nullable) - Maximálny počet ľudí na voľne súčasne
- created_at, updated_at (timestamp)

**leave_requests**
- id (bigserial, primary key)
- user_id (string, foreign key)
- type (enum: ANNUAL_LEAVE, SICK_LEAVE, HOME_OFFICE, UNPAID_LEAVE, OTHER)
- start_date (date)
- end_date (date)
- is_half_day_start (boolean) - AM/PM pre prvý deň
- is_half_day_end (boolean) - AM/PM pre posledný deň
- status (enum: DRAFT, PENDING, APPROVED, REJECTED, CANCELLED)
- reason (text, nullable)
- manager_comment (text, nullable)
- approved_by (string, nullable) - ID manažéra
- approved_at (timestamp, nullable)
- computed_days (double precision) - Pracovné dni bez víkendov/sviatkov
- attachment_url (text, nullable)
- created_at, updated_at (timestamp)

**holidays**
- id (bigserial, primary key)
- date (date, unique)
- name (string)
- is_company_holiday (boolean)
- created_at (timestamp)

**leave_balances**
- id (bigserial, primary key)
- user_id (string, foreign key)
- year (integer)
- allowance_days (double precision)
- used_days (double precision)
- created_at, updated_at (timestamp)
- UNIQUE(user_id, year)

**audit_logs**
- id (bigserial, primary key)
- actor_user_id (string) - Kto vykonal zmenu
- entity_type (string) - Názov tabuľky
- entity_id (string) - ID záznamu
- action (string) - CREATE, UPDATE, DELETE, APPROVE, REJECT, atď.
- before_json (jsonb, nullable)
- after_json (jsonb, nullable)
- created_at (timestamp)

**notifications**
- id (bigserial, primary key)
- user_id (string, foreign key)
- type (string) - REQUEST_SUBMITTED, REQUEST_APPROVED, atď.
- payload_json (jsonb)
- sent_at (timestamp, nullable)
- read_at (timestamp, nullable)
- created_at (timestamp)

## Biznis pravidlá

1. **Prevencia prekrytia**: Žiadne prekrytie PENDING alebo APPROVED žiadostí pre toho istého používateľa
2. **Minulé dátumy**: Nemožno vytvárať žiadosti v minulosti (konfigurovateľné)
3. **Víkendy**: Víkendy sa nezapočítavajú do výpočtu dní voľna
4. **Sviatky**: Firemné sviatky sa nezapočítavajú do výpočtu dní voľna
5. **Poldeň**: 0,5 dňa pre AM/PM poldeň
6. **Limity tímu**: Maximálny počet súčasných schválených absencií za tím
7. **Override manažéra**: Manažéri môžu obísť pravidlá s auditovaním
8. **Časové pásmo**: Všetky dátumy používajú časové pásmo Europe/Bratislava
9. **Prechody stavov**:
   - DRAFT → PENDING (odoslanie)
   - PENDING → APPROVED/REJECTED (manažér)
   - PENDING → CANCELLED (zamestnanec/manažér)
   - Akýkoľvek stav → CANCELLED (iba manažér)

## API rozhrania

### Žiadosti o voľno
- `POST /leave-requests` - Vytvoriť žiadosť
- `GET /leave-requests` - Zoznam žiadostí (filtrovanie)
- `GET /leave-requests/:id` - Detaily žiadosti
- `PATCH /leave-requests/:id` - Aktualizovať žiadosť
- `POST /leave-requests/:id/submit` - Odoslať DRAFT → PENDING
- `POST /leave-requests/:id/approve` - Schváliť žiadosť (manažér)
- `POST /leave-requests/:id/reject` - Zamietnuť žiadosť (manažér)
- `POST /leave-requests/:id/cancel` - Zrušiť žiadosť
- `DELETE /leave-requests/:id` - Vymazať žiadosť (manažér)

### Používatelia
- `GET /users` - Zoznam používateľov (manažér)
- `GET /users/:id` - Používateľ (manažér)
- `POST /users` - Vytvoriť používateľa (manažér)
- `PATCH /users/:id` - Aktualizovať používateľa (manažér)
- `DELETE /users/:id` - Deaktivovať používateľa (manažér)
- `GET /users/me` - Aktuálny používateľ

### Tímy
- `GET /teams` - Zoznam tímov
- `GET /teams/:id` - Tím
- `POST /teams` - Vytvoriť tím (manažér)
- `PATCH /teams/:id` - Aktualizovať tím (manažér)
- `DELETE /teams/:id` - Zmazať tím (manažér)

### Sviatky
- `GET /holidays` - Zoznam sviatkov
- `POST /holidays` - Vytvoriť sviatok (manažér)
- `DELETE /holidays/:id` - Zmazať sviatok (manažér)

### Kalendár
- `GET /calendar` - Kalendár (rozsah dátumov, filter tímu)

### Audit
- `GET /audit` - Audit logy (manažér)

### Export
- `GET /export/leave-requests` - Export do CSV (manažér)

## Nastavenie

1. Nainštalujte závislosti (automaticky)
2. Nastavte JWT secret a spustite migrácie/seed podľa [SETUP.md](SETUP.md)
3. Databázové migrácie prebehnú automaticky
4. Seed dáta sa načítajú automaticky

## Demo účty (po nastavení autentifikácie)

- **Manažér**: manager@cellqos.com (plný prístup)
- **Zamestnanci**:
  - anna@cellqos.com
  - peter@cellqos.com
  - lucia@cellqos.com

Predvolené heslo pre demo účty: `Password123!`

## Architektúra

- **Backend služby**: Express API + SQL dotazy na PostgreSQL
- **Frontend**: Komponentová architektúra Reactu s role guardmi
- **Správa stavu**: React Query pre serverový stav
- **Validácia**: Zod schémy na klientovi aj serveri
- **Bezpečnosť**: Server-side RBAC kontroly na všetkých endpointoch
