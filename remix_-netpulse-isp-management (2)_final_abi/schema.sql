-- NetPulse Database Schema for MS SQL Server with GUIDs

CREATE DATABASE NetPulseDB2;
GO

USE NetPulseDB2;
GO

-- ISP Admins Table (top of hierarchy)
CREATE TABLE ISPAdmins (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(255) NOT NULL,
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(MAX),
    Email NVARCHAR(255),
    Phone NVARCHAR(20),
    Status NVARCHAR(50) DEFAULT 'Active',
    AllowSubscriberPlanSelection BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- Franchise Admins Table (managed by ISP Admin)
CREATE TABLE FranchiseAdmins (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ISPAdminId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES ISPAdmins(Id) ON DELETE CASCADE,
    Name NVARCHAR(255) NOT NULL,
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(MAX),
    Email NVARCHAR(255),
    Phone NVARCHAR(20),
    Region NVARCHAR(255),
    Status NVARCHAR(50) DEFAULT 'Active',
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- IPv4 Address Pool
CREATE TABLE IPv4Addresses (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Address NVARCHAR(15) NOT NULL UNIQUE,
    SubscriberId UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) DEFAULT 'Available',
    AssignedAt DATETIME NULL
);

-- Subscribers Table (managed by Franchise Admin)
CREATE TABLE Subscribers (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    FranchiseAdminId UNIQUEIDENTIFIER FOREIGN KEY REFERENCES FranchiseAdmins(Id),
    Name NVARCHAR(255) NOT NULL,
    Status NVARCHAR(50) DEFAULT 'KYC Pending',
    PlanName NVARCHAR(100),
    IpAddress NVARCHAR(50) DEFAULT 'Pending',
    ExpiryDate DATE,
    Phone NVARCHAR(20),
    Email NVARCHAR(255),
    Username NVARCHAR(100),
    PasswordHash NVARCHAR(MAX),
    ConnectionType NVARCHAR(50),
    KycStatus NVARCHAR(50) DEFAULT 'Pending',
    Address NVARCHAR(MAX),
    IdType NVARCHAR(50),
    IdNumber NVARCHAR(100),
    ApplicationDate DATE DEFAULT GETDATE()
);

-- Invoices Table
CREATE TABLE Invoices (
    Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SubscriberId UNIQUEIDENTIFIER FOREIGN KEY REFERENCES Subscribers(Id),
    SubscriberName NVARCHAR(255),
    Amount DECIMAL(18, 2),
    Status NVARCHAR(50) DEFAULT 'Unpaid',
    InvoiceDate DATE DEFAULT GETDATE()
);

-- Notifications Table
CREATE TABLE Notifications (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Role NVARCHAR(50) NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    CreatedAt DATETIME DEFAULT GETDATE(),
    Type NVARCHAR(20) DEFAULT 'info'
);

-- Initial Hierarchy Data
DECLARE @ISPAdminId UNIQUEIDENTIFIER = NEWID();
DECLARE @Franchise1Id UNIQUEIDENTIFIER = NEWID();
DECLARE @Franchise2Id UNIQUEIDENTIFIER = NEWID();

INSERT INTO ISPAdmins (Id, Name, Username, PasswordHash, Email, Phone)
VALUES (@ISPAdminId, 'FastNet ISP', 'ispadmin', 'password', 'admin@fastnet.com', '9000000000');

INSERT INTO FranchiseAdmins (Id, ISPAdminId, Name, Username, PasswordHash, Email, Phone, Region)
VALUES
(@Franchise1Id, @ISPAdminId, 'CityLink Franchise', 'franchise1', 'password', 'citylink@fastnet.com', '9000000001', 'Mumbai Central'),
(@Franchise2Id, @ISPAdminId, 'MetroFiber Franchise', 'franchise2', 'password', 'metrofiber@fastnet.com', '9000000002', 'Pune West');

-- IPv4 pool (10.0.1.1 - 10.0.1.20)
DECLARE @i INT = 1;
WHILE @i <= 20
BEGIN
    INSERT INTO IPv4Addresses (Address, Status)
    VALUES ('10.0.1.' + CAST(@i AS NVARCHAR(3)), 'Available');
    SET @i = @i + 1;
END

INSERT INTO Subscribers (FranchiseAdminId, Name, Status, PlanName, IpAddress, ExpiryDate, Phone, Email, Username, ConnectionType, KycStatus, Address)
VALUES
(@Franchise1Id, 'Abi Shree', 'Active', '100Mbps Unlimited', '10.0.1.1', DATEADD(DAY, 30, GETDATE()), '9876543210', 'abi@example.com', 'johndoe', 'PPPoE', 'Verified', '123 Main St, City, State, 123456'),
(@Franchise1Id, 'Akshaya', 'KYC Pending', '50Mbps Basic', 'Pending', NULL, '9876543211', 'akshaya@example.com', 'janesmith', 'Hotspot', 'Pending', '456 Oak Ave, Town, State, 654321'),
(@Franchise2Id, 'Kavith', 'Installation Scheduled', '100Mbps Unlimited', 'Pending', NULL, '9988776655', 'kavith@example.com', 'kavith', 'PPPoE', 'Verified', 'Sector 15'),
(@Franchise2Id, 'Manashwini', 'Expired', '200Mbps Premium', 'Pending', DATEADD(DAY, -5, GETDATE()), '9123456780', 'manashwini@example.com', 'manashwini', 'PPPoE', 'Verified', 'Jubilee Hills');

UPDATE IPv4Addresses SET SubscriberId = (SELECT TOP 1 Id FROM Subscribers WHERE Username = 'johndoe'), Status = 'Assigned', AssignedAt = GETDATE() WHERE Address = '10.0.1.1';

INSERT INTO Notifications (Role, Title, Description, Type)
VALUES
('MasterAdmin', 'New ISP Registered', 'FastNet ISP joined the platform', 'info'),
('ISPAdmin', 'Franchise Onboarded', 'CityLink Franchise added under FastNet ISP', 'success'),
('FranchiseAdmin', 'New Subscriber', 'Akshaya registered for 50Mbps plan', 'success');
