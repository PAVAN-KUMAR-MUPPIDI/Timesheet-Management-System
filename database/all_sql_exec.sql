-- ================================================================================
-- ALL_SQL_EXEC.SQL
-- Unified Master Database Script for Team Productivity & AI Adoption Tracking Hub
-- Compatible with: Microsoft SQL Server 2017+ / Azure SQL Database
-- Sets up entire schema, indexes, views, stored procedures, and seeds all data
-- ================================================================================

SET NOCOUNT ON;

GO

-- ================================================================================
-- STEP 1: CREATE DATABASE
-- ================================================================================

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'TeamProductivityHub')
BEGIN
    PRINT 'Creating database TeamProductivityHub...';
    CREATE DATABASE TeamProductivityHub;
END
ELSE
BEGIN
    PRINT 'Database TeamProductivityHub already exists.';
END

GO

USE TeamProductivityHub;

GO

-- ================================================================================
-- STEP 2: DROP EXISTING OBJECTS (IN REVERSE DEPENDENCY ORDER FOR CLEAN RE-RUNS)
-- ================================================================================
IF OBJECT_ID('dbo.vw_EmployeeProductivitySummary', 'V') IS NOT NULL DROP VIEW dbo.vw_EmployeeProductivitySummary;
IF OBJECT_ID('dbo.vw_ValidSubmittedEntries', 'V') IS NOT NULL DROP VIEW dbo.vw_ValidSubmittedEntries;
IF OBJECT_ID('dbo.sp_SubmitMonthlyTimesheet', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_SubmitMonthlyTimesheet;
IF OBJECT_ID('dbo.sp_SubmitSelectedTimesheets', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_SubmitSelectedTimesheets;
IF OBJECT_ID('dbo.TimesheetSubmissions', 'U') IS NOT NULL DROP TABLE dbo.TimesheetSubmissions;
IF OBJECT_ID('dbo.TimesheetEntries', 'U') IS NOT NULL DROP TABLE dbo.TimesheetEntries;
IF OBJECT_ID('dbo.ControlledFields', 'U') IS NOT NULL DROP TABLE dbo.ControlledFields;
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
IF OBJECT_ID('dbo.Employees', 'U') IS NOT NULL DROP TABLE dbo.Employees;
IF OBJECT_ID('dbo.AiTools', 'U') IS NOT NULL DROP TABLE dbo.AiTools;
IF OBJECT_ID('dbo.TaskTypes', 'U') IS NOT NULL DROP TABLE dbo.TaskTypes;
IF OBJECT_ID('dbo.Modules', 'U') IS NOT NULL DROP TABLE dbo.Modules;
IF OBJECT_ID('dbo.Projects', 'U') IS NOT NULL DROP TABLE dbo.Projects;
IF OBJECT_ID('dbo.Teams', 'U') IS NOT NULL DROP TABLE dbo.Teams;
IF OBJECT_ID('dbo.Roles', 'U') IS NOT NULL DROP TABLE dbo.Roles;

GO

PRINT 'Previous schema objects cleaned up for fresh deployment.';

GO

-- ================================================================================
-- STEP 3: CREATE TABLES
-- ================================================================================

-- 3.1 Roles Table
CREATE TABLE dbo.Roles (
    RoleId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    RoleName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Roles_RoleName UNIQUE,
    Description NVARCHAR(255) NULL
);

GO

-- 3.2 Teams Table
CREATE TABLE dbo.Teams (
    TeamId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Teams PRIMARY KEY,
    TeamName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Teams_TeamName UNIQUE,
    Description NVARCHAR(255) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Teams_IsActive DEFAULT 1
);

GO

-- 3.3 Employees Table
CREATE TABLE dbo.Employees (
    EmployeeId NVARCHAR(20) NOT NULL CONSTRAINT PK_Employees PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(150) NOT NULL CONSTRAINT UQ_Employees_Email UNIQUE,
    TeamId INT NOT NULL CONSTRAINT FK_Employees_Teams REFERENCES dbo.Teams(TeamId),
    TeamName NVARCHAR(50) NOT NULL,
    Designation NVARCHAR(100) NOT NULL,
    ManagerId NVARCHAR(20) NULL CONSTRAINT FK_Employees_Manager REFERENCES dbo.Employees(EmployeeId),
    IsActive BIT NOT NULL CONSTRAINT DF_Employees_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Employees_CreatedAt DEFAULT SYSDATETIME()
);

GO

-- 3.4 Users Table (Authentication & Access Control)
CREATE TABLE dbo.Users (
    UserId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    Username NVARCHAR(100) NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
    Email NVARCHAR(150) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    PlainPasswordHint NVARCHAR(100) NULL,
    RoleId INT NOT NULL CONSTRAINT FK_Users_Roles REFERENCES dbo.Roles(RoleId),
    Role NVARCHAR(50) NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Designation NVARCHAR(100) NULL,
    EmployeeId NVARCHAR(20) NULL CONSTRAINT FK_Users_Employees REFERENCES dbo.Employees(EmployeeId),
    IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSDATETIME()
);

GO

-- 3.5 Controlled Configuration Fields (Manager Dynamic Master Configuration)
CREATE TABLE dbo.ControlledFields (
    ControlledFieldId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ControlledFields PRIMARY KEY,
    Category NVARCHAR(50) NOT NULL,
    Value NVARCHAR(150) NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_ControlledFields_Status DEFAULT 'Active',
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ControlledFields_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ControlledFields_CatVal UNIQUE (Category, Value)
);

GO

-- 3.6 Projects Master Table
CREATE TABLE dbo.Projects (
    ProjectId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Projects PRIMARY KEY,
    ProjectName NVARCHAR(150) NOT NULL CONSTRAINT UQ_Projects_ProjectName UNIQUE,
    Description NVARCHAR(255) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Projects_IsActive DEFAULT 1
);

GO

-- 3.7 Modules Master Table
CREATE TABLE dbo.Modules (
    ModuleId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Modules PRIMARY KEY,
    ModuleName NVARCHAR(150) NOT NULL CONSTRAINT UQ_Modules_ModuleName UNIQUE,
    ProjectId INT NULL CONSTRAINT FK_Modules_Projects REFERENCES dbo.Projects(ProjectId),
    IsActive BIT NOT NULL CONSTRAINT DF_Modules_IsActive DEFAULT 1
);

GO

-- 3.8 TaskTypes Master Table
CREATE TABLE dbo.TaskTypes (
    TaskTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskTypes PRIMARY KEY,
    TaskTypeName NVARCHAR(100) NOT NULL CONSTRAINT UQ_TaskTypes_TaskTypeName UNIQUE,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_TaskTypes_Status DEFAULT 'Active',
    IsActive BIT NOT NULL CONSTRAINT DF_TaskTypes_IsActive DEFAULT 1
);

GO

-- 3.9 AiTools Master Table
CREATE TABLE dbo.AiTools (
    AiToolId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AiTools PRIMARY KEY,
    ToolName NVARCHAR(100) NOT NULL CONSTRAINT UQ_AiTools_ToolName UNIQUE,
    IsManualWork BIT NOT NULL CONSTRAINT DF_AiTools_IsManualWork DEFAULT 0,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_AiTools_Status DEFAULT 'Active',
    IsActive BIT NOT NULL CONSTRAINT DF_AiTools_IsActive DEFAULT 1
);

GO

-- 3.10 TimesheetEntries Table
CREATE TABLE dbo.TimesheetEntries (
    TimesheetId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TimesheetEntries PRIMARY KEY,
    EntryCode NVARCHAR(50) NOT NULL CONSTRAINT UQ_TimesheetEntries_EntryCode UNIQUE,
    EmployeeId NVARCHAR(20) NOT NULL CONSTRAINT FK_TimesheetEntries_Employees REFERENCES dbo.Employees(EmployeeId),
    WorkDate DATE NOT NULL,
    MonthKey VARCHAR(7) NOT NULL,
    ProjectId INT NULL CONSTRAINT FK_TimesheetEntries_Projects REFERENCES dbo.Projects(ProjectId),
    ProjectName NVARCHAR(150) NOT NULL,
    ModuleId INT NULL CONSTRAINT FK_TimesheetEntries_Modules REFERENCES dbo.Modules(ModuleId),
    ModuleName NVARCHAR(150) NULL,
    TaskTypeId INT NULL CONSTRAINT FK_TimesheetEntries_TaskTypes REFERENCES dbo.TaskTypes(TaskTypeId),
    TaskTypeName NVARCHAR(100) NOT NULL,
    TaskDetails NVARCHAR(MAX) NOT NULL,
    Priority NVARCHAR(30) NOT NULL CONSTRAINT DF_TimesheetEntries_Priority DEFAULT 'Medium',
    TaskStatus NVARCHAR(30) NOT NULL CONSTRAINT DF_TimesheetEntries_TaskStatus DEFAULT 'Completed',
    PlannedHours DECIMAL(5,2) NOT NULL,
    ActualHours DECIMAL(5,2) NOT NULL,
    AiHours DECIMAL(5,2) NOT NULL CONSTRAINT DF_TimesheetEntries_AiHours DEFAULT 0.00,
    ManualHours DECIMAL(5,2) NULL CONSTRAINT DF_TimesheetEntries_ManualHours DEFAULT 0.00,
    AiToolId INT NULL CONSTRAINT FK_TimesheetEntries_AiTools REFERENCES dbo.AiTools(AiToolId),
    AiToolName NVARCHAR(100) NOT NULL CONSTRAINT DF_TimesheetEntries_AiToolName DEFAULT 'N/A',
    Notes NVARCHAR(MAX) NULL,
    EntryState NVARCHAR(30) NOT NULL CONSTRAINT DF_TimesheetEntries_EntryState DEFAULT 'Draft',
    SubmittedAt DATETIME2 NULL,
    IsDuplicate BIT NOT NULL CONSTRAINT DF_TimesheetEntries_IsDuplicate DEFAULT 0,
    IsIncomplete BIT NOT NULL CONSTRAINT DF_TimesheetEntries_IsIncomplete DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_TimesheetEntries_CreatedAt DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 NULL
);

GO

-- 3.11 TimesheetSubmissions Table
CREATE TABLE dbo.TimesheetSubmissions (
    SubmissionId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TimesheetSubmissions PRIMARY KEY,
    EmployeeId NVARCHAR(20) NOT NULL CONSTRAINT FK_TimesheetSubmissions_Employees REFERENCES dbo.Employees(EmployeeId),
    MonthKey VARCHAR(7) NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    WorkingDays INT NOT NULL,
    DaysSubmitted INT NOT NULL,
    DaysMissing INT NOT NULL,
    CoveragePct DECIMAL(5,2) NOT NULL,
    SubmittedAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_TimesheetSubmissions_CreatedAt DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 NULL,
    CONSTRAINT UQ_TimesheetSubmissions_EmpMonth UNIQUE (EmployeeId, MonthKey)
);

GO

-- ================================================================================
-- STEP 4: CREATE BUSINESS CHECK CONSTRAINTS & PERFORMANCE INDEXES
-- ================================================================================
ALTER TABLE dbo.TimesheetEntries ADD CONSTRAINT CK_TimesheetEntries_PlannedHours CHECK (PlannedHours >= 0 AND PlannedHours <= 24);
ALTER TABLE dbo.TimesheetEntries ADD CONSTRAINT CK_TimesheetEntries_ActualHours CHECK (ActualHours >= 0 AND ActualHours <= 24);
ALTER TABLE dbo.TimesheetEntries ADD CONSTRAINT CK_TimesheetEntries_AiHours CHECK (AiHours >= 0 AND AiHours <= ActualHours);

GO

CREATE NONCLUSTERED INDEX IX_TimesheetEntries_EmpMonthState ON dbo.TimesheetEntries (EmployeeId, MonthKey, EntryState)
INCLUDE (WorkDate, PlannedHours, ActualHours, AiHours, TaskStatus, IsDuplicate, IsIncomplete);
CREATE NONCLUSTERED INDEX IX_TimesheetEntries_WorkDate ON dbo.TimesheetEntries (WorkDate);
CREATE NONCLUSTERED INDEX IX_TimesheetEntries_AiTool ON dbo.TimesheetEntries (AiToolId);
CREATE NONCLUSTERED INDEX IX_TimesheetSubmissions_Status ON dbo.TimesheetSubmissions (MonthKey, Status);

GO

-- ================================================================================
-- STEP 5: CREATE REPORTING & AGGREGATION VIEWS
-- ================================================================================
CREATE OR ALTER VIEW dbo.vw_ValidSubmittedEntries AS
SELECT
    t.TimesheetId,
    t.EntryCode,
    t.EmployeeId,
    e.Name AS EmployeeName,
    e.TeamName,
    t.WorkDate,
    t.MonthKey,
    t.ProjectName,
    t.ModuleName,
    t.TaskTypeName,
    t.TaskDetails,
    t.Priority,
    t.TaskStatus,
    t.PlannedHours,
    t.ActualHours,
    t.AiHours,
    CASE WHEN (t.ActualHours - t.AiHours) > 0 THEN (t.ActualHours - t.AiHours) ELSE 0 END AS ManualHours,
    CASE WHEN t.TaskStatus = 'Completed' AND t.PlannedHours > 0 AND t.ActualHours > 0 THEN (t.PlannedHours - t.ActualHours) ELSE 0 END AS EffortSaved,
    CASE WHEN t.TaskStatus = 'Completed' AND t.PlannedHours > 0 AND t.ActualHours > 0 THEN ((t.PlannedHours - t.ActualHours) / t.PlannedHours) * 100.0 ELSE 0.0 END AS SavingsPct,
    t.AiToolName AS AiTool,
    CASE WHEN t.AiToolName = 'N/A' OR t.AiToolName = '' THEN 1 ELSE 0 END AS IsManualWork,
    t.Notes,
    t.EntryState,
    t.SubmittedAt
FROM dbo.TimesheetEntries t
INNER JOIN dbo.Employees e ON t.EmployeeId = e.EmployeeId
WHERE t.EntryState = 'Submitted'
  AND t.IsDuplicate = 0
  AND t.IsIncomplete = 0;

GO

CREATE OR ALTER VIEW dbo.vw_EmployeeProductivitySummary AS
SELECT
    v.EmployeeId,
    v.EmployeeName,
    v.TeamName,
    v.MonthKey,
    COUNT(*) AS TotalTasks,
    SUM(v.PlannedHours) AS TotalPlannedHours,
    SUM(v.ActualHours) AS TotalActualHours,
    SUM(v.AiHours) AS TotalAiHours,
    SUM(v.ManualHours) AS TotalManualHours,
    SUM(v.EffortSaved) AS TotalEffortSaved,
    SUM(CASE WHEN v.TaskStatus = 'Completed' THEN 1 ELSE 0 END) AS CompletedTasks,
    SUM(CASE WHEN v.IsManualWork = 0 THEN 1 ELSE 0 END) AS AiAssistedTasks,
    CASE WHEN SUM(CASE WHEN v.TaskStatus = 'Completed' AND v.PlannedHours > 0 THEN v.PlannedHours ELSE 0 END) > 0
         THEN (SUM(v.EffortSaved) / SUM(CASE WHEN v.TaskStatus = 'Completed' AND v.PlannedHours > 0 THEN v.PlannedHours ELSE 0 END)) * 100.0
         ELSE 0.0 END AS EfficiencyPct,
    CASE WHEN COUNT(*) > 0
         THEN (CAST(SUM(CASE WHEN v.TaskStatus = 'Completed' THEN 1 ELSE 0 END) AS DECIMAL(10,2)) / COUNT(*)) * 100.0
         ELSE 0.0 END AS CompletionRatePct,
    CASE WHEN COUNT(*) > 0
         THEN (CAST(SUM(CASE WHEN v.IsManualWork = 0 THEN 1 ELSE 0 END) AS DECIMAL(10,2)) / COUNT(*)) * 100.0
         ELSE 0.0 END AS AiAdoptionPct
FROM dbo.vw_ValidSubmittedEntries v
GROUP BY v.EmployeeId, v.EmployeeName, v.TeamName, v.MonthKey;

GO

-- ================================================================================
-- STEP 6: CREATE STORED PROCEDURES
-- ================================================================================
CREATE OR ALTER PROCEDURE dbo.sp_SubmitMonthlyTimesheet
    @EmployeeId NVARCHAR(20),
    @MonthKey VARCHAR(7),
    @WorkingDays INT,
    @SubmittedDays INT,
    @MissingDays INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @Now DATETIME2 = SYSDATETIME();
        DECLARE @Status NVARCHAR(30);
        IF @SubmittedDays >= @WorkingDays SET @Status = N'Submitted';
        ELSE IF @SubmittedDays > 0 SET @Status = N'Partially Submitted';
        ELSE SET @Status = N'Not Submitted';

        UPDATE dbo.TimesheetEntries
        SET EntryState = 'Submitted', SubmittedAt = @Now, UpdatedAt = @Now
        WHERE EmployeeId = @EmployeeId AND MonthKey = @MonthKey
          AND EntryState = 'Draft' AND IsDuplicate = 0 AND IsIncomplete = 0;

        IF EXISTS (SELECT 1 FROM dbo.TimesheetSubmissions WHERE EmployeeId = @EmployeeId AND MonthKey = @MonthKey)
        BEGIN
            UPDATE dbo.TimesheetSubmissions
            SET Status = @Status, WorkingDays = @WorkingDays, DaysSubmitted = @SubmittedDays,
                DaysMissing = @MissingDays,
                CoveragePct = CASE WHEN @WorkingDays > 0 THEN (@SubmittedDays * 100.0 / @WorkingDays) ELSE 0 END,
                SubmittedAt = @Now, UpdatedAt = @Now
            WHERE EmployeeId = @EmployeeId AND MonthKey = @MonthKey;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.TimesheetSubmissions (EmployeeId, MonthKey, Status, WorkingDays, DaysSubmitted, DaysMissing, CoveragePct, SubmittedAt, CreatedAt)
            VALUES (@EmployeeId, @MonthKey, @Status, @WorkingDays, @SubmittedDays, @MissingDays,
                    CASE WHEN @WorkingDays > 0 THEN (@SubmittedDays * 100.0 / @WorkingDays) ELSE 0 END, @Now, @Now);
        END
        COMMIT TRANSACTION;
        PRINT 'Monthly timesheet submitted successfully for ' + @EmployeeId + ' (' + @MonthKey + ')';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;

GO

CREATE OR ALTER PROCEDURE dbo.sp_SubmitSelectedTimesheets
    @EntryCodes NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @Now DATETIME2 = SYSDATETIME();
        UPDATE dbo.TimesheetEntries
        SET EntryState = 'Submitted', SubmittedAt = @Now, UpdatedAt = @Now
        WHERE EntryCode IN (SELECT TRIM(value) FROM STRING_SPLIT(@EntryCodes, ','))
          AND EntryState = 'Draft';
        COMMIT TRANSACTION;
        PRINT 'Selected timesheets submitted successfully.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;

GO

-- ================================================================================
-- STEP 7: SEED MASTER REFERENCE DATA
-- ================================================================================
-- ================================================================================
-- STEP 10: SEED INITIAL TIMESHEET SUBMISSIONS ROLLUP
-- ================================================================================
INSERT INTO dbo.TimesheetSubmissions (EmployeeId, MonthKey, Status, WorkingDays, DaysSubmitted, DaysMissing, CoveragePct, SubmittedAt)
SELECT
    e.EmployeeId,
    t.MonthKey,
    CASE WHEN COUNT(DISTINCT t.WorkDate) >= 20 THEN 'Submitted' WHEN COUNT(DISTINCT t.WorkDate) > 0 THEN 'Partially Submitted' ELSE 'Not Submitted' END AS Status,
    20 AS WorkingDays,
    COUNT(DISTINCT t.WorkDate) AS DaysSubmitted,
    CASE WHEN 20 - COUNT(DISTINCT t.WorkDate) > 0 THEN 20 - COUNT(DISTINCT t.WorkDate) ELSE 0 END AS DaysMissing,
    (CAST(COUNT(DISTINCT t.WorkDate) AS DECIMAL(5,2)) / 20.0) * 100.0 AS CoveragePct,
    MAX(t.SubmittedAt) AS SubmittedAt
FROM dbo.Employees e
CROSS JOIN (SELECT DISTINCT MonthKey FROM dbo.TimesheetEntries) m
LEFT JOIN dbo.TimesheetEntries t ON e.EmployeeId = t.EmployeeId AND m.MonthKey = t.MonthKey AND t.EntryState = 'Submitted'
GROUP BY e.EmployeeId, t.MonthKey;

GO

PRINT 'Timesheet submissions summary table populated.';

GO

-- ================================================================================
-- STEP 11: VERIFICATION CHECKS & SUMMARY
-- ================================================================================
PRINT '==================================================';
PRINT '--- TABLE ROW COUNTS ---';
SELECT
    t.name AS TableName,
    p.rows AS TotalRows
FROM sys.tables t
INNER JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
ORDER BY t.name;

GO

PRINT '--- EMPLOYEE TEAM DISTRIBUTION ---';
SELECT TeamName, COUNT(EmployeeId) AS TotalEmployees FROM dbo.Employees GROUP BY TeamName;

GO

PRINT '--- TOP 5 MOST USED AI TOOLS ---';
SELECT TOP 5 AiToolName, COUNT(*) AS TaskCount, SUM(AiHours) AS TotalAiHours
FROM dbo.TimesheetEntries
WHERE EntryState = 'Submitted' AND AiToolName NOT IN ('N/A', '')
GROUP BY AiToolName ORDER BY TaskCount DESC;

GO

PRINT '==================================================';
PRINT 'Team Productivity Hub Database Setup Complete!';
PRINT '==================================================';

GO
