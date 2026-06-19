# NetPulse ISP Management - Integration & Logic

## 1. MikroTik RouterOS Integration (API)
The system communicates with MikroTik routers using the API (Port 8728).

**Key Commands:**
- **Add PPPoE User:** `/ppp/secret/add name=SUB001 password=PASS profile=100MBPS remote-address=10.0.5.21`
- **Disconnect User:** `/interface/pppoe-server/remove [find user=SUB001]`
- **Bandwidth Control:** `/queue/simple/add name=SUB001 target=10.0.5.21 max-limit=100M/100M`

## 2. FreeRADIUS Configuration
The platform acts as the management layer for FreeRADIUS.

**Database Tables (MySQL/PostgreSQL):**
- `radcheck`: Stores user credentials.
- `radreply`: Stores attributes returned to NAS (MikroTik), like `Framed-IP-Address`, `Mikrotik-Rate-Limit`.
- `radacct`: Stores accounting logs for session tracking and data usage.

## 3. Billing Engine Workflow
The billing engine runs as a background worker (Hangfire or Quartz.NET).

1. **Daily Check**: Scan `Subscriptions` table for accounts expiring in 3 days.
2. **Notification**: Send SMS/Email alerts.
3. **Expiry Day**: 
   - Generate `Invoice`.
   - Check `Wallet` balance.
   - If balance < Invoice Amount:
     - Call MikroTik API to change user profile to 'EXPIRED' (low speed/walled garden).
     - Update status to 'Suspended'.
   - If balance >= Invoice Amount:
     - Deduct from wallet.
     - Mark invoice as 'Paid'.
     - Extend expiry date.

## 4. NAT Log Collector Service
A high-speed service (Go or Rust recommended, but implemented in .NET/Node for this blueprint) that listens for SYSLOG packets from routers.

**Log Format:**
`[Timestamp] SRC=10.0.5.21 DST=8.8.8.8 SPT=4521 DPT=53 PROTO=UDP NAT_IP=1.2.3.4 NAT_PORT=1025`

**Storage Strategy:**
- Use **TimescaleDB** or **Elasticsearch** for high-volume log storage.
- Partition tables by date for fast cleanup.
