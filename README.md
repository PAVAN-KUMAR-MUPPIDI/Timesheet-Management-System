# Team Productivity Hub & AI Adoption Tracking

An enterprise full-stack platform for engineering and product teams to track timesheets, measure AI tool adoption, analyze developer productivity, and manage team workflows.

---

## Architecture Overview

This repository is structured as an enterprise monorepo containing:
- **`backend/`**: Enterprise REST API built with **FastAPI** (Python 3.13), **SQLAlchemy**, and **pyodbc**, connected directly to **Microsoft SQL Server**.
- **`frontend/`**: Single Page Application built with **Angular 19**, **RxJS**, **Angular Material**, and **Chart.js** / **ng2-charts**.
- **`database/`**: Complete database schema, stored procedures, constraints, indexes, views, and seeding scripts for **Microsoft SQL Server**.

```
Team-Productivity/
├── backend/
│   ├── app/
│   │   ├── core/               # Security, JWT, configuration
│   │   ├── db/                 # SQL Server connection factory
│   │   ├── repositories/       # SQL Server repository & query layer
│   │   ├── routers/            # FastAPI API route controllers
│   │   ├── schemas/            # Pydantic request/response models
│   │   ├── services/           # Calculation & batch import services
│   │   └── main.py             # FastAPI entrypoint & middleware
│   ├── tests/                  # Pytest automated test suite
│   ├── .env.example            # Backend environment template
│   ├── pytest.ini              # Pytest configuration
│   └── requirements.txt        # Backend Python dependencies
├── database/
│   ├── all_sql_exec.sql        # Full database setup script
│   └── README.md               # Database setup documentation
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/           # Auth, API config, models, interceptors
│   │   │   ├── features/       # Manager and Employee role pages
│   │   │   ├── layout/         # App layout, sidebar, topbar
│   │   │   └── shared/         # Reusable UI components & modals
│   │   ├── index.html
│   │   └── main.ts
│   ├── .env.example            # Frontend environment template
│   ├── angular.json            # Angular CLI configuration
│   ├── package.json            # Frontend dependencies and scripts
│   └── tsconfig.json           # TypeScript configuration
├── .gitignore                  # Monorepo gitignore rules
└── README.md                   # Project documentation
```

---

## Prerequisites

- **Python**: Version 3.11 or higher
- **Node.js**: Version 18.x or 20.x LTS (with `npm`)
- **Database**: Microsoft SQL Server 2019+ or SQL Server Express
- **ODBC Driver**: [ODBC Driver 18 for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

---

## Getting Started

### 1. Database Setup

1. Open **SQL Server Management Studio (SSMS)** or Azure Data Studio.
2. Connect to your SQL Server instance (e.g. `localhost\SQLEXPRESS`).
3. Open and execute `database/all_sql_exec.sql`.
   This script creates the `TeamProductivityHub` database, tables, views, stored procedures, and initial reference configuration.

---

### 2. Backend Setup (FastAPI)

1. Open a terminal in the `backend/` directory:
   ```powershell
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   Copy `.env.example` to `.env` and verify your SQL Server connection details:
   ```powershell
   cp .env.example .env
   ```
   Example `.env` settings:
   ```ini
   APP_ENV=development
   DATA_MODE=sqlserver
   DB_SERVER=localhost\SQLEXPRESS
   DB_NAME=TeamProductivityHub
   DB_DRIVER=ODBC Driver 18 for SQL Server
   DB_TRUSTED_CONNECTION=true
   DB_ENCRYPT=true
   DB_TRUST_SERVER_CERTIFICATE=true
   CORS_ORIGINS=["http://localhost:4200","http://127.0.0.1:4200"]
   JWT_SECRET_KEY=your_secret_key_here
   ACCESS_TOKEN_EXPIRE_MINUTES=480
   ```
5. Run automated tests to verify setup:
   ```powershell
   pytest
   ```
6. Start the FastAPI development server:
   ```powershell
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
   - **API Root**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
   - **Interactive API Docs (Swagger)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   - **Health Check**: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

---

### 3. Frontend Setup (Angular)

1. Open a terminal in the `frontend/` directory:
   ```powershell
   cd frontend
   ```
2. Install Node dependencies:
   ```powershell
   npm install
   ```
3. Configure environment variables:
   Ensure `frontend/.env` is configured (copy from `.env.example`):
   ```powershell
   cp .env.example .env
   ```
   The frontend automatically connects to the backend on `http://127.0.0.1:8000/api`.
4. Start the Angular development server:
   ```powershell
   npm start
   ```
5. Open your browser and navigate to:
   **[http://localhost:4200](http://localhost:4200)**

---

## Default User Accounts

All authentication credentials are verified dynamically against `dbo.Users` in SQL Server:

| Role | Email | Password | Primary Dashboard |
| :--- | :--- | :--- | :--- |
| **Engineering Manager** | `mohan@company.com` | `mohan@1234` | `/manager/team-dashboard` |
| **Employee (UX Design)** | `chandrika.t@company.com` | `chandrika@1234` | `/employee/dashboard` |
| **Employee (Backend)** | `pavan.m@company.com` | `pavan@1234` | `/employee/dashboard` |
| **Employee (Frontend)** | `raghu.d@company.com` | `raghu@1234` | `/employee/dashboard` |
| **Employee (QA)** | `sushmitha.k@company.com` | `sushmitha@1234` | `/employee/dashboard` |

---

## Key Features

1. **Role-Based Security & Permissions**:
   - Verification with HttpOnly session cookies, CSRF tokens, and Bearer token fallback.
   - Distinct Manager and Employee views and navigational permissions.
2. **Timesheet Tracking & Submission**:
   - Monthly timesheet entries, planned vs. actual hours, and AI hours breakdown.
   - Automated duplicate entry detection, validation warnings, and state transitions.
3. **AI Adoption & Productivity Tracking**:
   - Tracks AI tools used (GitHub Copilot, ChatGPT, Claude, Cursor, Tabnine, etc.).
   - Computes AI impact percentages, time saved metrics, and adoption trends.
4. **Dynamic Reference & Controlled Fields**:
   - Manage projects, modules, task types, priorities, teams, and AI tools dynamically through SQL Server.
5. **Bulk Timesheet Import**:
   - Ingest CSV and Excel (`.xlsx`) files with live validation, auto-correction, and error reporting.

---

## Testing & Quality Assurance

- **Backend Pytest Suite**:
  ```powershell
  cd backend
  pytest -v
  ```
- **Frontend Production Build**:
  ```powershell
  cd frontend
  npm run build
  ```

---

## License & Security

This project is intended for internal enterprise team productivity tracking. Keep `.env` files and database credentials secure and never commit production credentials to source control.







