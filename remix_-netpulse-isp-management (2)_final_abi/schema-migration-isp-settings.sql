-- Migration: Add ISP-level subscriber plan selection toggle
USE NetPulseDB2;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('ISPAdmins') AND name = 'AllowSubscriberPlanSelection'
)
BEGIN
    ALTER TABLE ISPAdmins
    ADD AllowSubscriberPlanSelection BIT NOT NULL DEFAULT 1;
END
GO
