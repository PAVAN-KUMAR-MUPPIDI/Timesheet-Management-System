-- ================================================================================
-- ALL_SQL_EXEC.SQL
-- Master Normalized Database Script for Team Productivity & AI Adoption Tracking Hub
-- Compatible with: Microsoft SQL Server 2017+ / Azure SQL Database
-- Fully Normalized Schema (3NF) - No Redundant Denormalized Columns
-- Dynamic Projects & Modules querying from TimesheetEntries
-- Unified Users table (Manager M01, Employees E01..E10)
-- Dedicated Priorities & TaskStatuses domain tables
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
-- STEP 2: DROP EXISTING OBJECTS (IN REVERSE DEPENDENCY ORDER)
-- ================================================================================
IF OBJECT_ID('dbo.vw_EmployeeProductivitySummary', 'V') IS NOT NULL DROP VIEW dbo.vw_EmployeeProductivitySummary;
IF OBJECT_ID('dbo.vw_ValidSubmittedEntries', 'V') IS NOT NULL DROP VIEW dbo.vw_ValidSubmittedEntries;
IF OBJECT_ID('dbo.vw_TimesheetEntriesFull', 'V') IS NOT NULL DROP VIEW dbo.vw_TimesheetEntriesFull;
IF OBJECT_ID('dbo.sp_SubmitMonthlyTimesheet', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_SubmitMonthlyTimesheet;
IF OBJECT_ID('dbo.sp_SubmitSelectedTimesheets', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_SubmitSelectedTimesheets;
IF OBJECT_ID('dbo.TimesheetSubmissions', 'U') IS NOT NULL DROP TABLE dbo.TimesheetSubmissions;
IF OBJECT_ID('dbo.TimesheetEntries', 'U') IS NOT NULL DROP TABLE dbo.TimesheetEntries;
IF OBJECT_ID('dbo.ControlledFields', 'U') IS NOT NULL DROP TABLE dbo.ControlledFields;
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
IF OBJECT_ID('dbo.Employees', 'U') IS NOT NULL DROP TABLE dbo.Employees;
IF OBJECT_ID('dbo.AiTools', 'U') IS NOT NULL DROP TABLE dbo.AiTools;
IF OBJECT_ID('dbo.TaskTypes', 'U') IS NOT NULL DROP TABLE dbo.TaskTypes;
IF OBJECT_ID('dbo.Priorities', 'U') IS NOT NULL DROP TABLE dbo.Priorities;
IF OBJECT_ID('dbo.TaskStatuses', 'U') IS NOT NULL DROP TABLE dbo.TaskStatuses;
IF OBJECT_ID('dbo.Modules', 'U') IS NOT NULL DROP TABLE dbo.Modules;
IF OBJECT_ID('dbo.Projects', 'U') IS NOT NULL DROP TABLE dbo.Projects;
IF OBJECT_ID('dbo.Teams', 'U') IS NOT NULL DROP TABLE dbo.Teams;
IF OBJECT_ID('dbo.Roles', 'U') IS NOT NULL DROP TABLE dbo.Roles;
GO

-- ================================================================================
-- STEP 3: CREATE TABLES
-- ================================================================================
CREATE TABLE dbo.Roles (
    RoleId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    RoleName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Roles_RoleName UNIQUE,
    Description NVARCHAR(255) NULL
);
GO

CREATE TABLE dbo.Teams (
    TeamId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Teams PRIMARY KEY,
    TeamName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Teams_TeamName UNIQUE,
    Description NVARCHAR(255) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Teams_IsActive DEFAULT 1
);
GO

CREATE TABLE dbo.Users (
    UserId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    EmployeeId NVARCHAR(20) NOT NULL CONSTRAINT UQ_Users_EmployeeId UNIQUE,
    Username NVARCHAR(100) NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
    Email NVARCHAR(150) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    PlainPasswordHint NVARCHAR(100) NULL,
    RoleId INT NOT NULL CONSTRAINT FK_Users_Roles REFERENCES dbo.Roles(RoleId),
    Name NVARCHAR(100) NOT NULL,
    TeamId INT NOT NULL CONSTRAINT FK_Users_Teams REFERENCES dbo.Teams(TeamId),
    Designation NVARCHAR(100) NOT NULL,
    ManagerId NVARCHAR(20) NULL CONSTRAINT FK_Users_Manager REFERENCES dbo.Users(EmployeeId),
    IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSDATETIME()
);
GO

CREATE TABLE dbo.TaskTypes (
    TaskTypeId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskTypes PRIMARY KEY,
    TaskTypeName NVARCHAR(100) NOT NULL CONSTRAINT UQ_TaskTypes_TaskTypeName UNIQUE,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_TaskTypes_Status DEFAULT 'Active',
    IsActive BIT NOT NULL CONSTRAINT DF_TaskTypes_IsActive DEFAULT 1
);
GO

CREATE TABLE dbo.AiTools (
    AiToolId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AiTools PRIMARY KEY,
    ToolName NVARCHAR(100) NOT NULL CONSTRAINT UQ_AiTools_ToolName UNIQUE,
    IsManualWork BIT NOT NULL CONSTRAINT DF_AiTools_IsManualWork DEFAULT 0,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_AiTools_Status DEFAULT 'Active',
    IsActive BIT NOT NULL CONSTRAINT DF_AiTools_IsActive DEFAULT 1
);
GO

CREATE TABLE dbo.Priorities (
    PriorityId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Priorities PRIMARY KEY,
    PriorityName NVARCHAR(50) NOT NULL CONSTRAINT UQ_Priorities_PriorityName UNIQUE,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_Priorities_Status DEFAULT 'Active',
    IsActive BIT NOT NULL CONSTRAINT DF_Priorities_IsActive DEFAULT 1
);
GO

CREATE TABLE dbo.TaskStatuses (
    TaskStatusId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaskStatuses PRIMARY KEY,
    StatusName NVARCHAR(50) NOT NULL CONSTRAINT UQ_TaskStatuses_StatusName UNIQUE,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_TaskStatuses_Status DEFAULT 'Active',
    IsActive BIT NOT NULL CONSTRAINT DF_TaskStatuses_IsActive DEFAULT 1
);
GO

CREATE TABLE dbo.TimesheetEntries (
    TimesheetId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TimesheetEntries PRIMARY KEY,
    EntryCode NVARCHAR(50) NOT NULL CONSTRAINT UQ_TimesheetEntries_EntryCode UNIQUE,
    EmployeeId NVARCHAR(20) NOT NULL CONSTRAINT FK_TimesheetEntries_Users REFERENCES dbo.Users(EmployeeId),
    WorkDate DATE NOT NULL,
    MonthKey VARCHAR(7) NOT NULL,
    ProjectName NVARCHAR(150) NOT NULL,
    ModuleName NVARCHAR(150) NULL,
    TaskTypeId INT NOT NULL CONSTRAINT FK_TimesheetEntries_TaskTypes REFERENCES dbo.TaskTypes(TaskTypeId),
    TaskDetails NVARCHAR(MAX) NOT NULL,
    PriorityId INT NOT NULL CONSTRAINT FK_TimesheetEntries_Priorities REFERENCES dbo.Priorities(PriorityId),
    TaskStatusId INT NOT NULL CONSTRAINT FK_TimesheetEntries_TaskStatuses REFERENCES dbo.TaskStatuses(TaskStatusId),
    PlannedHours DECIMAL(5,2) NOT NULL,
    ActualHours DECIMAL(5,2) NOT NULL,
    AiHours DECIMAL(5,2) NOT NULL CONSTRAINT DF_TimesheetEntries_AiHours DEFAULT 0.00,
    ManualHours DECIMAL(5,2) NULL CONSTRAINT DF_TimesheetEntries_ManualHours DEFAULT 0.00,
    AiToolId INT NULL CONSTRAINT FK_TimesheetEntries_AiTools REFERENCES dbo.AiTools(AiToolId),
    Notes NVARCHAR(MAX) NULL,
    EntryState NVARCHAR(30) NOT NULL CONSTRAINT DF_TimesheetEntries_EntryState DEFAULT 'Draft',
    SubmittedAt DATETIME2 NULL,
    IsDuplicate BIT NOT NULL CONSTRAINT DF_TimesheetEntries_IsDuplicate DEFAULT 0,
    IsIncomplete BIT NOT NULL CONSTRAINT DF_TimesheetEntries_IsIncomplete DEFAULT 0,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_TimesheetEntries_CreatedAt DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2 NULL
);
GO

-- Constraints & Performance Indexes
ALTER TABLE dbo.TimesheetEntries ADD CONSTRAINT CK_TimesheetEntries_PlannedHours CHECK (PlannedHours >= 0 AND PlannedHours <= 24);
ALTER TABLE dbo.TimesheetEntries ADD CONSTRAINT CK_TimesheetEntries_ActualHours CHECK (ActualHours >= 0 AND ActualHours <= 24);
ALTER TABLE dbo.TimesheetEntries ADD CONSTRAINT CK_TimesheetEntries_AiHours CHECK (AiHours >= 0 AND AiHours <= ActualHours);
GO

CREATE NONCLUSTERED INDEX IX_TimesheetEntries_EmpMonthState ON dbo.TimesheetEntries (EmployeeId, MonthKey, EntryState)
INCLUDE (WorkDate, PlannedHours, ActualHours, AiHours, PriorityId, TaskStatusId, IsDuplicate, IsIncomplete);
CREATE NONCLUSTERED INDEX IX_TimesheetEntries_WorkDate ON dbo.TimesheetEntries (WorkDate);
CREATE NONCLUSTERED INDEX IX_TimesheetEntries_AiTool ON dbo.TimesheetEntries (AiToolId);
GO

-- ================================================================================
-- STEP 4: VIEWS
-- ================================================================================
CREATE OR ALTER VIEW dbo.vw_TimesheetEntriesFull AS
SELECT 
    te.TimesheetId,
    te.EntryCode,
    te.EmployeeId,
    u.Name AS EmployeeName,
    u.Email AS EmployeeEmail,
    t.TeamId,
    t.TeamName,
    te.WorkDate,
    te.MonthKey,
    te.ProjectName,
    te.ModuleName,
    te.TaskTypeId,
    tt.TaskTypeName,
    te.TaskDetails,
    te.PriorityId,
    p.PriorityName AS Priority,
    te.TaskStatusId,
    ts.StatusName AS TaskStatus,
    te.PlannedHours,
    te.ActualHours,
    te.AiHours,
    te.ManualHours,
    te.AiToolId,
    COALESCE(at.ToolName, 'None') AS ToolName,
    COALESCE(at.ToolName, 'None') AS AiToolName,
    COALESCE(at.IsManualWork, 1) AS IsManualWork,
    te.Notes,
    te.EntryState,
    te.SubmittedAt,
    te.IsDuplicate,
    te.IsIncomplete,
    te.CreatedAt,
    te.UpdatedAt
FROM dbo.TimesheetEntries te
INNER JOIN dbo.Users u ON te.EmployeeId = u.EmployeeId
LEFT JOIN dbo.Teams t ON u.TeamId = t.TeamId
LEFT JOIN dbo.TaskTypes tt ON te.TaskTypeId = tt.TaskTypeId
LEFT JOIN dbo.Priorities p ON te.PriorityId = p.PriorityId
LEFT JOIN dbo.TaskStatuses ts ON te.TaskStatusId = ts.TaskStatusId
LEFT JOIN dbo.AiTools at ON te.AiToolId = at.AiToolId;
GO

CREATE OR ALTER VIEW dbo.vw_ValidSubmittedEntries AS
SELECT
    f.TimesheetId,
    f.EntryCode,
    f.EmployeeId,
    f.EmployeeName,
    f.TeamName,
    f.WorkDate,
    f.MonthKey,
    f.ProjectName,
    f.ModuleName,
    f.TaskTypeName,
    f.TaskDetails,
    f.Priority,
    f.TaskStatus,
    f.PlannedHours,
    f.ActualHours,
    f.AiHours,
    f.ManualHours,
    CASE WHEN f.TaskStatus = 'Completed' AND f.PlannedHours > 0 AND f.ActualHours > 0 THEN (f.PlannedHours - f.ActualHours) ELSE 0 END AS EffortSaved,
    CASE WHEN f.TaskStatus = 'Completed' AND f.PlannedHours > 0 AND f.ActualHours > 0 THEN ((f.PlannedHours - f.ActualHours) / f.PlannedHours) * 100.0 ELSE 0.0 END AS SavingsPct,
    f.AiToolName AS AiTool,
    CASE WHEN f.AiToolName = 'N/A' OR f.AiToolName = '' OR f.AiToolName = 'None' OR f.IsManualWork = 1 THEN 1 ELSE 0 END AS IsManualWork,
    f.Notes,
    f.EntryState,
    f.SubmittedAt
FROM dbo.vw_TimesheetEntriesFull f
WHERE f.EntryState = 'Submitted'
  AND f.IsDuplicate = 0
  AND f.IsIncomplete = 0;
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
-- STEP 5: STORED PROCEDURES
-- ================================================================================
CREATE OR ALTER PROCEDURE dbo.sp_SubmitMonthlyTimesheet
    @EmployeeId NVARCHAR(20),
    @MonthKey VARCHAR(7),
    @WorkingDays INT = 0,
    @SubmittedDays INT = 0,
    @MissingDays INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @Now DATETIME2 = SYSDATETIME();
        UPDATE dbo.TimesheetEntries
        SET EntryState = 'Submitted', SubmittedAt = @Now, UpdatedAt = @Now
        WHERE EmployeeId = @EmployeeId AND MonthKey = @MonthKey
          AND EntryState = 'Draft' AND IsDuplicate = 0 AND IsIncomplete = 0;
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
-- STEP 6: SEED MASTER REFERENCE DATA
-- ================================================================================
SET IDENTITY_INSERT dbo.Roles ON;
INSERT INTO dbo.Roles (RoleId, RoleName, Description) VALUES
(1, 'Employee', 'Team Member / Individual Contributor'),
(2, 'Manager', 'Engineering Manager / Team Lead');
SET IDENTITY_INSERT dbo.Roles OFF;
GO

SET IDENTITY_INSERT dbo.Teams ON;
INSERT INTO dbo.Teams (TeamId, TeamName, Description, IsActive) VALUES
(1, 'Frontend', 'Frontend Engineering / Operations Team', 1),
(2, 'Backend', 'Backend Engineering / Operations Team', 1),
(3, 'UX Design', 'UX Design Engineering / Operations Team', 1),
(4, 'QA', 'QA Engineering / Operations Team', 1);
SET IDENTITY_INSERT dbo.Teams OFF;
GO

SET IDENTITY_INSERT dbo.TaskTypes ON;
INSERT INTO dbo.TaskTypes (TaskTypeId, TaskTypeName, Status, IsActive) VALUES
(1, 'Design', 'Active', 1),
(2, 'UI Development', 'Active', 1),
(3, 'Front-End Development', 'Active', 1),
(4, 'Back-End Development', 'Active', 1),
(5, 'Deployment', 'Active', 1),
(6, 'Integration', 'Active', 1),
(7, 'Testing', 'Active', 1),
(8, 'Bug Fixing', 'Active', 1),
(9, 'KT', 'Active', 1),
(10, 'Documentation', 'Active', 1),
(11, 'Meeting', 'Active', 1),
(12, 'Training', 'Active', 1),
(13, 'Support', 'Active', 1),
(14, 'Research', 'Active', 1),
(15, 'Learning', 'Active', 1),
(16, 'Other', 'Active', 1);
SET IDENTITY_INSERT dbo.TaskTypes OFF;
GO

SET IDENTITY_INSERT dbo.AiTools ON;
INSERT INTO dbo.AiTools (AiToolId, ToolName, IsManualWork, Status, IsActive) VALUES
(1, 'ChatGPT', 0, 'Active', 1),
(2, 'GitHub Copilot', 0, 'Active', 1),
(3, 'Claude', 0, 'Active', 1),
(4, 'Grok', 0, 'Active', 1),
(5, 'Gens Park', 0, 'Active', 1),
(6, 'Banani AI', 0, 'Active', 1),
(7, 'Figma AI', 0, 'Active', 1),
(8, 'Stitch', 0, 'Active', 1),
(9, 'Perplexity AI', 0, 'Active', 1),
(10, 'Gemini AI', 0, 'Active', 1),
(11, 'Antigravity AI', 0, 'Active', 1),
(12, 'OpenText''s AI', 0, 'Active', 1),
(13, 'Other', 0, 'Active', 1),
(14, 'N/A', 1, 'Active', 1),
(15, 'new', 0, 'Inactive', 1);
SET IDENTITY_INSERT dbo.AiTools OFF;
GO

SET IDENTITY_INSERT dbo.Priorities ON;
INSERT INTO dbo.Priorities (PriorityId, PriorityName, Status, IsActive) VALUES
(1, 'Low', 'Active', 1),
(2, 'Medium', 'Active', 1),
(3, 'High', 'Active', 1),
(4, 'Critical', 'Active', 1);
SET IDENTITY_INSERT dbo.Priorities OFF;
GO

SET IDENTITY_INSERT dbo.TaskStatuses ON;
INSERT INTO dbo.TaskStatuses (TaskStatusId, StatusName, Status, IsActive) VALUES
(1, 'Not Started', 'Active', 1),
(2, 'In Progress', 'Active', 1),
(3, 'Completed', 'Active', 1),
(4, 'On Hold', 'Active', 1),
(5, 'Blocked', 'Active', 1);
SET IDENTITY_INSERT dbo.TaskStatuses OFF;
GO

-- ================================================================================
-- STEP 7: SEED USERS (MANAGERS & EMPLOYEES)
-- ================================================================================
INSERT INTO dbo.Users (EmployeeId, Username, Email, PasswordHash, PlainPasswordHint, RoleId, Name, TeamId, Designation, ManagerId, IsActive) VALUES
('M01', 'mohan', 'mohan@company.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', 'mohan@1234', 2, 'Mohan', 1, 'Engineering Manager', NULL, 1),
GO

-- ================================================================================
-- STEP 8: SEED TIMESHEET ENTRIES (ALL 3776 ENTRIES IN BATCHES OF 800)
-- ================================================================================
-- Batch 1 (Entries 1 to 800)
INSERT INTO dbo.TimesheetEntries (
    EntryCode, EmployeeId, WorkDate, MonthKey, ProjectName, ModuleName,
    TaskTypeId, TaskDetails, PriorityId, TaskStatusId,
    PlannedHours, ActualHours, AiHours, ManualHours, AiToolId,
    Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
) VALUES
('T101', 'E01', '2026-05-01', '2026-05', 'Suntory', 'Meeting', 4, 'Daily standup call with Suntory team', 3, 3, 1.0, 1.0, 0.0, 1.0, 14, '', 'Submitted', '2026-10-30 15:23:00', 0, 0),

GO

-- Batch 2 (Entries 801 to 1600)
INSERT INTO dbo.TimesheetEntries (
    EntryCode, EmployeeId, WorkDate, MonthKey, ProjectName, ModuleName,
    TaskTypeId, TaskDetails, PriorityId, TaskStatusId,
    PlannedHours, ActualHours, AiHours, ManualHours, AiToolId,
    Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
) VALUES
('T901', 'E05', '2026-05-06', '2026-05', 'NE AFE & SCM Project', 'admin screens', 2, 'adding filters and validations', 3, 3, 2.0, 2.0, 1.0, 1.0, 2, '', 'Submitted', '2026-10-29 18:07:00', 1, 0),
GO

-- Batch 3 (Entries 1601 to 2400)
INSERT INTO dbo.TimesheetEntries (
    EntryCode, EmployeeId, WorkDate, MonthKey, ProjectName, ModuleName,
    TaskTypeId, TaskDetails, PriorityId, TaskStatusId,
    PlannedHours, ActualHours, AiHours, ManualHours, AiToolId,
    Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
) VALUES
('T1702', 'E06', '2026-09-10', '2026-09', 'Bajaj BBPS', 'Standup Call', 11, 'Daily Standup Call with Bajaj Team', 3, 3, 2.0, 2.0, 0.0, 2.0, 14, '', 'Submitted', '2026-10-29 18:09:00', 0, 0),
GO

-- Batch 4 (Entries 2401 to 3200)
INSERT INTO dbo.TimesheetEntries (
    EntryCode, EmployeeId, WorkDate, MonthKey, ProjectName, ModuleName,
    TaskTypeId, TaskDetails, PriorityId, TaskStatusId,
    PlannedHours, ActualHours, AiHours, ManualHours, AiToolId,
    Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
) VALUES
('T2510', 'E03', '2026-07-02', '2026-07', 'FAB', 'Meeting', 11, 'KT Session and application flow', 3, 3, 0.5, 0.5, 0.0, 0.5, 14, '', 'Submitted', '2026-10-29 18:39:00', 0, 0),
GO

-- Batch 5 (Entries 3201 to 3776)
INSERT INTO dbo.TimesheetEntries (
    EntryCode, EmployeeId, WorkDate, MonthKey, ProjectName, ModuleName,
    TaskTypeId, TaskDetails, PriorityId, TaskStatusId,
    PlannedHours, ActualHours, AiHours, ManualHours, AiToolId,
    Notes, EntryState, SubmittedAt, IsDuplicate, IsIncomplete
) VALUES
('T3322', 'E08', '2026-10-05', '2026-10', 'Bajaj Finserv', 'DA Portal', 2, 'Reusable components and page integration', 3, 3, 3.0, 1.5, 0.5, 1.0, 11, '', 'Submitted', '2026-10-29 18:54:00', 0, 0),
GO

PRINT 'TeamProductivityHub master database deployed and verified successfully.';
GO
