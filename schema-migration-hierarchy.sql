-- Migration: status classification, IPv4 pool, remove IpType
USE NetPulseDB2;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'IPv4Addresses')
BEGIN
    CREATE TABLE IPv4Addresses (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        Address NVARCHAR(15) NOT NULL UNIQUE,
        SubscriberId UNIQUEIDENTIFIER NULL,
        Status NVARCHAR(20) DEFAULT 'Available',
        AssignedAt DATETIME NULL
    );
END
GO

IF COL_LENGTH('Subscribers', 'IpType') IS NOT NULL
BEGIN
    ALTER TABLE Subscribers DROP COLUMN IpType;
END
GO

DECLARE @i INT = 1;
WHILE @i <= 20
BEGIN
    IF NOT EXISTS (SELECT 1 FROM IPv4Addresses WHERE Address = '10.0.1.' + CAST(@i AS NVARCHAR(3)))
        INSERT INTO IPv4Addresses (Address, Status) VALUES ('10.0.1.' + CAST(@i AS NVARCHAR(3)), 'Available');
    SET @i = @i + 1;
END
GO

UPDATE Subscribers
SET Status = 'Expired', IpAddress = 'Pending'
WHERE ExpiryDate < CAST(GETDATE() AS DATE)
  AND Status NOT IN ('KYC Pending', 'Approved', 'Installation Scheduled', 'Terminated', 'Expired');
GO
