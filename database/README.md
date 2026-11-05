# SQL Server Database Setup Guide

## Execution Order in SQL Server Management Studio (SSMS)
Execute the SQL scripts in numerical order:

1. `00_create_database.sql` - Creates the `TeamProductivityHub` database.
2. `01_create_tables.sql` - Creates base tables and foreign keys.
3. `02_create_constraints_indexes.sql` - Adds performance indexes and check constraints.
4. `03_create_views.sql` - Creates productivity views (`vw_ValidSubmittedEntries`, `vw_EmployeeProductivitySummary`).
5. `04_create_procedures.sql` - Creates submission stored procedures (`sp_SubmitMonthlyTimesheet`).
6. `05_seed_reference_data.sql` - Seeds roles, teams, projects, modules, task types, and AI tools.
7. `06_seed_demo_data.sql` - Seeds demo employees and user accounts.
8. `07_verification_queries.sql` - Runs validation queries.

## ODBC Driver Requirements
To connect FastAPI backend to SQL Server:
- Install **ODBC Driver 17 for SQL Server** or **ODBC Driver 18 for SQL Server**.
- Connection String format in backend `.env`:
  `DATABASE_URL=mssql+pyodbc://sa:YourPassword@localhost:1433/TeamProductivityHub?driver=ODBC+Driver+17+for+SQL+Server`
