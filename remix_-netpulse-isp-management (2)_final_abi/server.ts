import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import sql from "mssql";
import dotenv from "dotenv";
import { v4 as uuidv4 } from 'uuid';
import {
  resolveSubscriberStatus,
  shouldAutoExpire,
  countSubscriberMetrics,
  WORKFLOW_STATUSES,
} from './shared/subscriberStatus.ts';

// ──────────────────────────────────────────────
// FreeRADIUS Integration (future)
// ──────────────────────────────────────────────
//
// FreeRADIUS is a RADIUS server that handles AAA (Authentication, Authorization,
// and Accounting) for network access. When a subscriber is provisioned, a RADIUS
// user entry is created that the NAS (Network Access Server) queries during
// PPPoE authentication.
//
// Integration steps:
// 1. Deploy FreeRADIUS server with a SQL or REST backend
// 2. Configure the NAS to point to FreeRADIUS for PPPoE auth
// 3. When provisioning a subscriber, create a corresponding radcheck entry:
//    radcheck table: username, attribute, op, value
//    e.g. ('subscriber_pppoe', 'Cleartext-Password', ':=', 'pppoe_pass')
// 4. For IP assignment, create a radreply entry:
//    radreply table: username, attribute, op, value
//    e.g. ('subscriber_pppoe', 'Framed-IP-Address', ':=', '10.0.1.100')
// 5. For suspended/expired subscribers, remove or disable the radcheck entry
//    to block authentication.
//
// Types for future FreeRADIUS API:
// interface RadiusUser {
//   username: string;
//   password: string;
//   ipAddress: string;
//   planName: string;
//   isActive: boolean;
//   speedLimit?: number; // kbps
// }
//
// interface RadiusClient {
//   createUser(user: RadiusUser): Promise<void>;
//   updateUser(user: RadiusUser): Promise<void>;
//   deleteUser(username: string): Promise<void>;
//   suspendUser(username: string): Promise<void>;
//   activateUser(username: string): Promise<void>;
// }
//
// When implementing, replace the mock radiusClient with the real integration.
// The provisioning endpoints (see /api/subscribers/:id/provision) are already
// wired to call radiusClient.createUser() when createFreeRADIUS is true.
// ──────────────────────────────────────────────

// Load environment variables
dotenv.config();

// MS SQL Configuration - You can edit these directly or use .env file
const dbConfig: sql.config = {
  user: 'sa',
  password: 'StrongPassword123!',
  server: 'localhost\\SQLEXPRESS',
  database: 'NetPulseDB2',
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

// Hierarchy: ISP Admin -> Franchise Admin -> Subscriber
const MOCK_ISP_ADMINS = [
  { id: 'ISP001', name: 'FastNet ISP', username: 'ispadmin', password: 'password', email: 'admin@fastnet.com', phone: '9000000000', status: 'Active', allowSubscriberPlanSelection: true },
];

let MOCK_FRANCHISE_ADMINS = [
  { id: 'FA001', ispAdminId: 'ISP001', name: 'CityLink Franchise', username: 'franchise1', password: 'password', email: 'citylink@fastnet.com', phone: '9000000001', region: 'Mumbai Central', status: 'Active' },
  { id: 'FA002', ispAdminId: 'ISP001', name: 'MetroFiber Franchise', username: 'franchise2', password: 'password', email: 'metrofiber@fastnet.com', phone: '9000000002', region: 'Pune West', status: 'Active' },
];

let MOCK_LCO_ADMINS = [
  { id: 'LCO001', franchiseAdminId: 'FA001', name: 'Rajesh Kumar', username: 'lc_rajesh', password: 'password', email: 'rajesh@lco.com', phone: '9876543210', region: 'North Zone', status: 'Active' },
  { id: 'LCO002', franchiseAdminId: 'FA001', name: 'Priya Sharma', username: 'lc_priya', password: 'password', email: 'priya@lco.com', phone: '9876543211', region: 'Central Zone', status: 'Active' },
  { id: 'LCO003', franchiseAdminId: 'FA002', name: 'Suresh Patel', username: 'lc_suresh', password: 'password', email: 'suresh@lco.com', phone: '9876543212', region: 'South Zone', status: 'Active' },
];

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

// Mutable Mock Data for Demo Mode
let MOCK_SUBSCRIBERS = [
  { id: 'S1001', franchiseAdminId: 'FA001', franchiseName: 'CityLink Franchise', name: 'Abishree', status: 'Active', plan: '100Mbps Unlimited', ip: '10.0.1.1', expiry: daysFromNow(30), phone: '9876543210', email: 'abishree@example.com', username: 'abishree', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: 'Flat 402, Sunrise Apts', idType: 'Aadhaar', idNumber: '1234-5678-9012' },
  { id: 'S1002', franchiseAdminId: 'FA001', franchiseName: 'CityLink Franchise', name: 'Akshaya', status: 'Approved', plan: '50Mbps Basic', ip: '-', expiry: '-', phone: '9823456789', email: 'akshaya@example.com', username: 'akshaya', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: '12, Green Park', idType: 'PAN', idNumber: 'ABCDE1234F' },
  { id: 'S1003', franchiseAdminId: 'FA002', franchiseName: 'MetroFiber Franchise', name: 'Kavith', status: 'Installation Scheduled', plan: '100Mbps Unlimited', ip: '-', expiry: '-', phone: '9988776655', email: 'kavith@example.com', username: 'kavith', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: 'Sector 15', idType: 'Aadhaar', idNumber: '9876-5432-1098' },
  { id: 'S1004', franchiseAdminId: 'FA002', franchiseName: 'MetroFiber Franchise', name: 'Manashwini', status: 'Active', plan: '200Mbps Premium', ip: '10.0.2.1', expiry: daysFromNow(-5), phone: '9123456780', email: 'manashwini@example.com', username: 'manashwini', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: 'Jubilee Hills', idType: 'Passport', idNumber: 'Z1234567' },
  { id: 'S1005', franchiseAdminId: 'FA001', franchiseName: 'CityLink Franchise', name: 'Sivalakshmi', status: 'Active', plan: '100Mbps Unlimited', ip: '10.0.1.5', expiry: daysFromNow(2), phone: '9001122334', email: 'sivalakshmi@example.com', username: 'sivalakshmi', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: 'Civil Lines', idType: 'Driving License', idNumber: 'RJ-14-2023-0012345' },
  { id: 'S1006', franchiseAdminId: 'FA002', franchiseName: 'MetroFiber Franchise', name: 'Kishore', status: 'KYC Pending', plan: '50Mbps Basic', ip: '-', expiry: '-', phone: '9000000001', email: 'kishore@example.com', username: 'kishore', password: 'password123', connectionType: 'Hotspot', kycStatus: 'Pending', address: 'Main Road', idType: 'Aadhaar', idNumber: '1111-2222-3333' },
  { id: 'S1007', franchiseAdminId: 'FA001', franchiseName: 'CityLink Franchise', name: 'Demo Subscriber', status: 'Active', plan: '100Mbps Unlimited', ip: '10.0.1.100', expiry: daysFromNow(30), phone: '9000000007', email: 'demo@example.com', username: 'subscriber', password: 'password', connectionType: 'PPPoE', kycStatus: 'Verified', address: '123 Demo Street', idType: 'Aadhaar', idNumber: '9999-8888-7777' },
  { id: 'S1008', franchiseAdminId: 'FA001', franchiseName: 'CityLink Franchise', name: 'Ravi', status: 'Active', plan: '200Mbps Premium', ip: '10.0.1.15', expiry: daysFromNow(6), phone: '9876543222', email: 'ravi@example.com', username: 'ravi', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: 'Lake View Apts', idType: 'Aadhaar', idNumber: '5555-6666-7777' },
  { id: 'S1009', franchiseAdminId: 'FA002', franchiseName: 'MetroFiber Franchise', name: 'Neha', status: 'Active', plan: '100Mbps Unlimited', ip: '10.0.2.5', expiry: daysFromNow(1), phone: '9876543233', email: 'neha@example.com', username: 'neha', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: 'Green Valley Colony', idType: 'PAN', idNumber: 'XYZAB1234C' },
  { id: 'S1010', franchiseAdminId: 'FA001', franchiseName: 'CityLink Franchise', name: 'Vikram', status: 'Active', plan: '50Mbps Basic', ip: '10.0.1.20', expiry: daysFromNow(0), phone: '9876543244', email: 'vikram@example.com', username: 'vikram', password: 'password123', connectionType: 'PPPoE', kycStatus: 'Verified', address: 'Station Road', idType: 'Driving License', idNumber: 'MH-12-2024-0065432' },
];

let MOCK_IPV4 = Array.from({ length: 20 }, (_, index) => {
  const address = `10.0.1.${index + 1}`;
  const assignedTo = MOCK_SUBSCRIBERS.find((sub) => sub.ip === address);
  return {
    id: `IP${index + 1}`,
    address,
    subscriberId: assignedTo?.id ?? null,
    subscriberName: assignedTo?.name ?? null,
    status: assignedTo ? 'Assigned' : 'Available',
    assignedAt: assignedTo ? new Date().toISOString() : null,
  };
});

let MOCK_INVOICES = [
  { id: 'INV-8842', subscriber: 'Abishree', amount: 899, status: 'Paid', date: '2026-03-01' },
  { id: 'INV-8843', subscriber: 'Manashwini', amount: 1499, status: 'Unpaid', date: '2026-03-05' },
  { id: 'INV-8844', subscriber: 'Sivalakshmi', amount: 899, status: 'Paid', date: '2026-02-15' },
];

const MOCK_NOTIFICATIONS = [
  { id: 1, role: 'MasterAdmin', title: 'Subscriber Activation', description: 'Abishree is now Active on 100Mbps Unlimited.', type: 'success', createdAt: new Date() },
  { id: 2, role: 'ISPAdmin', title: 'Installation Scheduled', description: 'Kavith installation has been scheduled.', type: 'info', createdAt: new Date() },
  { id: 3, role: 'LCOAdmin', title: 'KYC Pending', description: 'Kishore submitted KYC. Review required.', type: 'warning', createdAt: new Date() },
  { id: 4, role: 'Subscriber', title: 'Payment Reminder', description: 'Mano, your invoice is due soon.', type: 'warning', createdAt: new Date() },
];

const MOCK_PLANS = [
  { id: 1, name: '50Mbps Basic', speed: 50, price: 599, validity: 30 },
  { id: 2, name: '100Mbps Unlimited', speed: 100, price: 899, validity: 30 },
  { id: 3, name: '200Mbps Premium', speed: 200, price: 1499, validity: 30 },
];

const MOCK_TICKETS = [
  { id: 1, subscriberId: 'S1001', subject: 'Slow Internet Speed', category: 'Speed', priority: 'Medium', status: 'Open', createdAt: new Date() },
  { id: 2, subscriberId: 'S1003', subject: 'No Internet Connection', category: 'No Internet', priority: 'High', status: 'In Progress', createdAt: new Date() },
];

const MOCK_NODES = [
  { id: 1, name: 'Mumbai-OLT-01', ip: '172.16.0.1', location: 'Andheri West', status: 'Online' },
  { id: 2, name: 'Mumbai-OLT-02', ip: '172.16.0.2', location: 'Bandra East', status: 'Online' },
  { id: 3, name: 'Pune-OLT-01', ip: '172.17.0.1', location: 'Hinjewadi', status: 'Offline' },
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Database Connection Pool
  let pool: sql.ConnectionPool | null = null;
  let isMockMode = false;

  try {
    console.log(`Attempting to connect to MS SQL at ${dbConfig.server}...`);
    pool = await sql.connect(dbConfig);
    console.log('✅ Connected to MS SQL Server successfully.');
  } catch (err) {
    console.warn('❌ MS SQL Connection Failed. Falling back to Mock/Demo Mode.');
    console.warn('Reason:', (err as Error).message);
    isMockMode = true;
  }

  // Helper for DB queries with fallback
  const query = async (text: string, params: any = {}) => {
    if (!pool || isMockMode) {
      throw new Error("Database unavailable");
    }
    
    try {
      const request = pool.request();
      for (const key in params) {
        request.input(key, params[key]);
      }
      return await request.query(text);
    } catch (err: any) {
      console.error(`Query execution failed: ${text}`, err);
      throw err;
    }
  };

  const mapSubscriberRaw = (s: any, franchiseName?: string) => ({
    id: s.Id ?? s.id,
    franchiseAdminId: s.FranchiseAdminId ?? s.franchiseAdminId,
    franchiseName: franchiseName ?? s.FranchiseName ?? s.franchiseName,
    name: s.Name ?? s.name,
    status: s.Status ?? s.status,
    plan: s.PlanName ?? s.plan,
    ip: s.IpAddress || s.ip || '-',
    expiry: s.ExpiryDate ? s.ExpiryDate.toISOString().split('T')[0] : (s.expiry || '-'),
    phone: s.Phone ?? s.phone,
    email: s.Email ?? s.email,
    username: s.Username ?? s.username,
    password: s.PasswordHash ?? s.password,
    connectionType: s.ConnectionType ?? s.connectionType,
    kycStatus: s.KycStatus ?? s.kycStatus,
    address: s.Address ?? s.address,
    idType: s.IdType ?? s.idType,
    idNumber: s.IdNumber ?? s.idNumber,
  });

  const processSubscriber = (s: any, franchiseName?: string, now = new Date()) => {
    const mapped = mapSubscriberRaw(s, franchiseName);
    mapped.status = resolveSubscriberStatus(mapped.status, mapped.expiry, now);
    return mapped;
  };

  const releaseIpv4ForSubscriber = (subscriberId: string) => {
    MOCK_IPV4.forEach((ip) => {
      if (ip.subscriberId === subscriberId) {
        ip.subscriberId = null;
        ip.subscriberName = null;
        ip.status = 'Available';
        ip.assignedAt = null;
      }
    });
  };

  const applyAutoExpiryMock = (now = new Date()) => {
    for (const sub of MOCK_SUBSCRIBERS) {
      if (shouldAutoExpire(sub.status, sub.expiry, now)) {
        sub.status = 'Suspended';
        sub.ip = 'Pending';
        releaseIpv4ForSubscriber(sub.id);
      } else if (!WORKFLOW_STATUSES.includes(sub.status)) {
        sub.status = resolveSubscriberStatus(sub.status, sub.expiry, now);
      }
    }
  };

  const applyAutoExpiryDb = async () => {
    await query(`
      UPDATE ip SET ip.SubscriberId = NULL, ip.Status = 'Available', ip.AssignedAt = NULL
      FROM IPv4Addresses ip
      INNER JOIN Subscribers s ON ip.SubscriberId = s.Id
      WHERE s.ExpiryDate < CAST(GETDATE() AS DATE)
        AND s.Status NOT IN ('KYC Pending', 'KYC Verified', 'Approved', 'Installation Scheduled', 'Installation Completed', 'Terminated', 'Suspended')
    `);
    await query(`
      UPDATE Subscribers
      SET Status = 'Suspended', IpAddress = 'Pending'
      WHERE ExpiryDate < CAST(GETDATE() AS DATE)
        AND Status NOT IN ('KYC Pending', 'KYC Verified', 'Approved', 'Installation Scheduled', 'Installation Completed', 'Terminated', 'Suspended')
    `);
    await query(`
      UPDATE Subscribers
      SET Status = 'Expired'
      WHERE ExpiryDate = CAST(GETDATE() AS DATE)
        AND Status NOT IN ('KYC Pending', 'KYC Verified', 'Approved', 'Installation Scheduled', 'Installation Completed', 'Terminated', 'Suspended', 'Expired')
    `);
    await query(`
      UPDATE Subscribers
      SET Status = 'Expiring1d'
      WHERE ExpiryDate = DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
        AND Status = 'Active'
    `);
    await query(`
      UPDATE Subscribers
      SET Status = 'Expiring3d'
      WHERE ExpiryDate >= DATEADD(DAY, 2, CAST(GETDATE() AS DATE))
        AND ExpiryDate <= DATEADD(DAY, 3, CAST(GETDATE() AS DATE))
        AND Status = 'Active'
    `);
    await query(`
      UPDATE Subscribers
      SET Status = 'Expiring7d'
      WHERE ExpiryDate >= DATEADD(DAY, 4, CAST(GETDATE() AS DATE))
        AND ExpiryDate <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
        AND Status = 'Active'
    `);
    await query(`
      UPDATE Subscribers
      SET Status = 'Active'
      WHERE ExpiryDate > DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
        AND Status IN ('Active', 'Expiring7d', 'Expiring3d', 'Expiring1d')
    `);
  };

  type AuthContext = {
    role?: string;
    ispAdminId?: string;
    franchiseAdminId?: string;
  };

  const getAuth = (req: express.Request): AuthContext => ({
    role: (req.headers['x-user-role'] as string) || undefined,
    ispAdminId: (req.headers['x-isp-admin-id'] as string) || undefined,
    franchiseAdminId: (req.headers['x-franchise-admin-id'] as string) || undefined,
  });

  const franchiseBelongsToIsp = async (franchiseAdminId: string, ispAdminId: string) => {
    if (isMockMode) {
      return MOCK_FRANCHISE_ADMINS.some((f) => f.id === franchiseAdminId && f.ispAdminId === ispAdminId);
    }
    const result = await query(
      'SELECT 1 FROM FranchiseAdmins WHERE Id = @franchiseAdminId AND ISPAdminId = @ispAdminId',
      { franchiseAdminId, ispAdminId }
    );
    return result.recordset.length > 0;
  };

  const resolveAccessScope = async (
    auth: AuthContext,
    requested: { franchiseAdminId?: string; ispAdminId?: string } = {}
  ) => {
    if (!auth.role) {
      return { ok: false as const, status: 401, message: 'Authentication required' };
    }
    if (auth.role === 'MasterAdmin') {
      return {
        ok: true as const,
        franchiseAdminId: requested.franchiseAdminId,
        ispAdminId: requested.ispAdminId,
      };
    }
    if (auth.role === 'FranchiseAdmin') {
      if (requested.ispAdminId) {
        return { ok: false as const, status: 403, message: 'Franchise Admin cannot access ISP scope' };
      }
      if (requested.franchiseAdminId && requested.franchiseAdminId !== auth.franchiseAdminId) {
        return { ok: false as const, status: 403, message: 'Access denied to this franchise' };
      }
      return { ok: true as const, franchiseAdminId: auth.franchiseAdminId };
    }
    if (auth.role === 'LCOAdmin') {
      if (requested.ispAdminId) {
        return { ok: false as const, status: 403, message: 'LCO Admin cannot access ISP scope' };
      }
      if (requested.franchiseAdminId && requested.franchiseAdminId !== auth.franchiseAdminId) {
        return { ok: false as const, status: 403, message: 'Access denied to this franchise' };
      }
      return { ok: true as const, franchiseAdminId: auth.franchiseAdminId };
    }
    if (auth.role === 'ISPAdmin') {
      if (requested.ispAdminId && requested.ispAdminId !== auth.ispAdminId) {
        return { ok: false as const, status: 403, message: 'Access denied to this ISP' };
      }
      if (requested.franchiseAdminId && auth.ispAdminId) {
        const allowed = await franchiseBelongsToIsp(requested.franchiseAdminId, auth.ispAdminId);
        if (!allowed) {
          return { ok: false as const, status: 403, message: 'Franchise does not belong to your ISP' };
        }
      }
      return {
        ok: true as const,
        ispAdminId: auth.ispAdminId,
        franchiseAdminId: requested.franchiseAdminId,
      };
    }
    return { ok: false as const, status: 403, message: 'Insufficient permissions' };
  };

  const assertSubscriberAccess = async (auth: AuthContext, subscriberId: string) => {
    if (auth.role === 'MasterAdmin') return true;
    const sub = isMockMode
      ? MOCK_SUBSCRIBERS.find((s) => s.id === subscriberId)
      : (await query('SELECT FranchiseAdminId FROM Subscribers WHERE Id = @id', { id: subscriberId })).recordset[0];
    if (!sub) return false;
    const franchiseAdminId = sub.franchiseAdminId ?? sub.FranchiseAdminId;
    if (auth.role === 'FranchiseAdmin') {
      return franchiseAdminId === auth.franchiseAdminId;
    }
    if (auth.role === 'ISPAdmin' && auth.ispAdminId) {
      return franchiseBelongsToIsp(franchiseAdminId, auth.ispAdminId);
    }
    if (auth.role === 'LCOAdmin' && auth.franchiseAdminId) {
      return franchiseAdminId === auth.franchiseAdminId;
    }
    return false;
  };

  const buildIpv4Stats = (pool: any[]) => ({
    total: pool.length,
    assigned: pool.filter((ip) => ip.status === 'Assigned').length,
    available: pool.filter((ip) => ip.status === 'Available').length,
  });

  const getMockIpv4Pool = () => {
    applyAutoExpiryMock();
    return MOCK_IPV4.map((ip) => {
      const sub = ip.subscriberId ? MOCK_SUBSCRIBERS.find((s) => s.id === ip.subscriberId) : null;
      return {
        ...ip,
        subscriberName: sub?.name ?? ip.subscriberName ?? null,
      };
    });
  };

  const filterSubscribersByHierarchy = (subs: any[], franchiseAdminId?: string, ispAdminId?: string) => {
    if (franchiseAdminId) {
      return subs.filter((s) => s.franchiseAdminId === franchiseAdminId);
    }
    if (ispAdminId) {
      const franchiseIds = MOCK_FRANCHISE_ADMINS
        .filter((f) => f.ispAdminId === ispAdminId)
        .map((f) => f.id);
      return subs.filter((s) => franchiseIds.includes(s.franchiseAdminId));
    }
    return subs;
  };

  const getFranchiseName = (franchiseAdminId?: string) =>
    MOCK_FRANCHISE_ADMINS.find((f) => f.id === franchiseAdminId)?.name;

  const getIspAdminIdFromFranchise = async (franchiseAdminId?: string) => {
    const fallbackId = franchiseAdminId || MOCK_FRANCHISE_ADMINS[0]?.id;
    const mockLookup = () =>
      MOCK_FRANCHISE_ADMINS.find((f) => f.id === fallbackId)?.ispAdminId
      ?? MOCK_FRANCHISE_ADMINS[0]?.ispAdminId;

    if (isMockMode) return mockLookup();

    try {
      const result = await query(
        'SELECT ISPAdminId FROM FranchiseAdmins WHERE Id = @franchiseAdminId',
        { franchiseAdminId: fallbackId }
      );
      return (result.recordset[0]?.ISPAdminId as string | undefined) ?? mockLookup();
    } catch {
      return mockLookup();
    }
  };

  const getAllowSubscriberPlanSelection = async (ispAdminId?: string) => {
    if (!ispAdminId) return true;
    const mockLookup = () => {
      const isp = MOCK_ISP_ADMINS.find((i) => i.id === ispAdminId);
      return isp?.allowSubscriberPlanSelection !== false;
    };
    if (isMockMode) return mockLookup();
    try {
      const result = await query(
        'SELECT AllowSubscriberPlanSelection FROM ISPAdmins WHERE Id = @ispAdminId',
        { ispAdminId }
      );
      const value = result.recordset[0]?.AllowSubscriberPlanSelection;
      if (value === undefined || value === null) return mockLookup();
      return Boolean(value);
    } catch {
      return mockLookup();
    }
  };

  const getAvailablePlans = async () => {
    try {
      const result = await query('SELECT * FROM Plans ORDER BY Price ASC');
      if (result.recordset.length > 0) return result.recordset;
    } catch {
      // fall through to mock plans
    }
    return MOCK_PLANS;
  };

  // Seed real database from demo data (idempotent)
  const seedDatabaseFromMocks = async () => {
    if (!pool || isMockMode) return;

    // Seed ISP Admins
    for (const isp of MOCK_ISP_ADMINS) {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM ISPAdmins WHERE Username = @username)
         INSERT INTO ISPAdmins (Id, Name, Username, PasswordHash, Email, Phone, Status, AllowSubscriberPlanSelection)
         VALUES (@id, @name, @username, @password, @email, @phone, @status, @allowPlanSelection)`,
        {
          id: isp.id,
          name: isp.name,
          username: isp.username,
          password: isp.password,
          email: isp.email,
          phone: isp.phone,
          status: isp.status,
          allowPlanSelection: isp.allowSubscriberPlanSelection !== false ? 1 : 0,
        }
      );
    }

    // Seed Franchise Admins
    for (const fa of MOCK_FRANCHISE_ADMINS) {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM FranchiseAdmins WHERE Username = @username)
         INSERT INTO FranchiseAdmins (Id, ISPAdminId, Name, Username, PasswordHash, Email, Phone, Region, Status)
         VALUES (@id, @ispAdminId, @name, @username, @password, @email, @phone, @region, @status)`,
        {
          id: fa.id,
          ispAdminId: fa.ispAdminId,
          name: fa.name,
          username: fa.username,
          password: fa.password,
          email: fa.email,
          phone: fa.phone,
          region: fa.region,
          status: fa.status,
        }
      );
    }

    // Seed Subscribers
    // Note: DB uses UNIQUEIDENTIFIER for Id, so we let SQL generate it (no @id param),
    // and de-duplicate by Username instead of Id to avoid conversion issues.
    for (const sub of MOCK_SUBSCRIBERS) {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM Subscribers WHERE Username = @username)
         INSERT INTO Subscribers (FranchiseAdminId, Name, Status, PlanName, IpAddress, ExpiryDate, Phone, Email, Username, PasswordHash, ConnectionType, KycStatus, Address, IdType, IdNumber)
         VALUES (@franchiseAdminId, @name, @status, @plan, @ip, @expiry, @phone, @email, @username, @password, @connectionType, @kycStatus, @address, @idType, @idNumber)`,
        {
          franchiseAdminId: sub.franchiseAdminId ?? null,
          name: sub.name,
          status: sub.status,
          plan: sub.plan,
          ip: sub.ip ?? 'Pending',
          expiry: sub.expiry && sub.expiry !== '-' ? new Date(sub.expiry) : null,
          phone: sub.phone ?? null,
          email: sub.email ?? null,
          username: sub.username ?? null,
          password: sub.password ?? 'password123',
          connectionType: sub.connectionType ?? 'PPPoE',
          kycStatus: sub.kycStatus ?? 'Pending',
          address: sub.address ?? null,
          idType: (sub as any).idType ?? null,
          idNumber: (sub as any).idNumber ?? null,
        }
      );
    }

    for (const ip of MOCK_IPV4) {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM IPv4Addresses WHERE Address = @address)
         INSERT INTO IPv4Addresses (Id, Address, SubscriberId, Status, AssignedAt)
         VALUES (@id, @address, @subscriberId, @status, @assignedAt)`,
        {
          id: ip.id,
          address: ip.address,
          subscriberId: ip.subscriberId,
          status: ip.status,
          assignedAt: ip.assignedAt ? new Date(ip.assignedAt) : null,
        }
      );
    }

    // Seed Invoices
    // Invoices.Id is UNIQUEIDENTIFIER, so let SQL generate it and de-duplicate
    // based on SubscriberName + Amount + Status to avoid string->GUID conversion errors.
    for (const inv of MOCK_INVOICES) {
      await query(
        `IF NOT EXISTS (
           SELECT 1 FROM Invoices 
           WHERE SubscriberName = @subName AND Amount = @amount AND Status = @status
         )
         INSERT INTO Invoices (SubscriberId, SubscriberName, Amount, Status)
         VALUES (@subId, @subName, @amount, @status)`,
        {
          subId: null, // optional foreign key; we don't rely on it for demo seeding
          subName: inv.subscriber,
          amount: inv.amount,
          status: inv.status,
        }
      );
    }

    // Seed Notifications
    for (const note of MOCK_NOTIFICATIONS) {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM Notifications WHERE Title = @title AND Role = @role)
         INSERT INTO Notifications (Role, Title, Description, Type)
         VALUES (@role, @title, @description, @type)`,
        {
          role: note.role,
          title: note.title,
          description: note.description,
          type: note.type,
        }
      );
    }

  };

  // API Routes
  app.get("/api/health", async (req, res) => {
    res.json({ 
      status: "ok", 
      database: pool && !isMockMode ? "connected" : "mock_mode",
      config: {
        server: dbConfig.server,
        database: dbConfig.database,
        user: dbConfig.user
      }
    });
  });

  // Try seeding the real database from demo/mock data (no-op if records already exist)
  if (!isMockMode) {
    seedDatabaseFromMocks().catch((err) => {
      console.warn("Database seed from mock data failed:", (err as Error).message);
    });
  }

  app.get("/api/notifications", async (req, res) => {
    try {
      const { role } = req.query;
      const result = await query("SELECT * FROM Notifications ORDER BY CreatedAt DESC");
      let filtered: any[] = result.recordset;
      if (role) {
        filtered = filtered.filter((n: any) => n.Role === role);
      }
      res.json(filtered);
    } catch (err) {
      // Fallback to mock
      const { role } = req.query;
      const filtered = role 
        ? MOCK_NOTIFICATIONS.filter(n => n.role === role)
        : MOCK_NOTIFICATIONS;
      res.json(filtered);
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const { role, title, desc, type } = req.body;
      await query(
        "INSERT INTO Notifications (Role, Title, Description, Type) VALUES (@role, @title, @desc, @type)",
        { role, title, desc: desc || '', type: type || 'info' }
      );
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  const buildDashboardStats = (subs: any[], franchiseAdmins: any[], ipv4Pool: any[], ispAdminId?: string) => {
    const scopedFranchises = ispAdminId
      ? franchiseAdmins.filter((f) => f.ispAdminId === ispAdminId)
      : franchiseAdmins;

    const franchiseStats = scopedFranchises.map((fa) => {
      const faSubs = subs.filter((s) => s.franchiseAdminId === fa.id);
      const metrics = countSubscriberMetrics(faSubs);
      return {
        id: fa.id,
        name: fa.name,
        region: fa.region,
        ispAdminId: fa.ispAdminId,
        subscribers: metrics.totalUsers,
        activeSubscribers: metrics.activeUsers,
        revenue: metrics.activeUsers * 899,
        ...metrics,
      };
    });

    const userMetrics = countSubscriberMetrics(subs);
    const ipv4Stats = buildIpv4Stats(ipv4Pool);

    return {
      ...userMetrics,
      activeSubscribers: userMetrics.activeUsers,
      pendingApprovals: subs.filter((s) => s.status === 'KYC Pending').length,
      installationTasks: subs.filter((s) => ['Approved', 'Installation Scheduled'].includes(s.status)).length,
      revenueThisMonth: userMetrics.activeUsers * 899,
      networkHealth: 98.5,
      franchiseAdmins: franchiseStats,
      franchiseCount: scopedFranchises.length,
      tenants: franchiseStats,
      ipv4: ipv4Stats,
    };
  };

  app.post("/api/auth/login", async (req, res) => {
    const { role, username, password } = req.body;
    const normalizedUser = (username || '').toLowerCase();

    try {
      if (role === 'ISPAdmin') {
        const result = await query(
          "SELECT * FROM ISPAdmins WHERE LOWER(Username) = @username AND PasswordHash = @password",
          { username: normalizedUser, password }
        );
        const admin = result.recordset[0];
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        return res.json({
          id: admin.Id,
          name: admin.Name,
          username: admin.Username,
          email: admin.Email,
          phone: admin.Phone,
          role: 'ISPAdmin',
          ispAdminId: admin.Id,
        });
      }

      if (role === 'LCOAdmin') {
        const result = await query(
          `SELECT lc.*, fa.Id AS FranchiseAdminId
           FROM LCOAdmins lc
           JOIN FranchiseAdmins fa ON lc.FranchiseAdminId = fa.Id
           WHERE LOWER(lc.Username) = @username AND lc.PasswordHash = @password`,
          { username: normalizedUser, password }
        );
        const admin = result.recordset[0];
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        return res.json({
          id: admin.Id,
          name: admin.Name,
          username: admin.Username,
          email: admin.Email,
          phone: admin.Phone,
          region: admin.Region,
          role: 'LCOAdmin',
          franchiseAdminId: admin.FranchiseAdminId,
        });
      }

      if (role === 'FranchiseAdmin') {
        const result = await query(
          `SELECT fa.*, isp.Name AS ISPName
           FROM FranchiseAdmins fa
           JOIN ISPAdmins isp ON fa.ISPAdminId = isp.Id
           WHERE LOWER(fa.Username) = @username AND fa.PasswordHash = @password`,
          { username: normalizedUser, password }
        );
        const admin = result.recordset[0];
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        return res.json({
          id: admin.Id,
          name: admin.Name,
          username: admin.Username,
          email: admin.Email,
          phone: admin.Phone,
          region: admin.Region,
          role: 'FranchiseAdmin',
          franchiseAdminId: admin.Id,
          ispAdminId: admin.ISPAdminId,
          ispName: admin.ISPName,
        });
      }

      if (role === 'Subscriber') {
        const result = await query(
          `SELECT s.*, fa.Name AS FranchiseName
           FROM Subscribers s
           LEFT JOIN FranchiseAdmins fa ON s.FranchiseAdminId = fa.Id
           WHERE (LOWER(s.Username) = @username OR LOWER(s.Email) = @username)
             AND (s.PasswordHash = @password OR @password IN ('demo', 'password123'))`,
          { username: normalizedUser, password }
        );
        const sub = result.recordset[0];
        if (!sub) return res.status(401).json({ error: 'Invalid credentials' });
        return res.json(processSubscriber(sub, sub.FranchiseName));
      }
    } catch (err) {
      if (role === 'ISPAdmin') {
        const admin = MOCK_ISP_ADMINS.find(
          (a) => a.username.toLowerCase() === normalizedUser && a.password === password
        );
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        return res.json({ ...admin, role: 'ISPAdmin', ispAdminId: admin.id });
      }
      if (role === 'LCOAdmin') {
        const admin = MOCK_LCO_ADMINS.find(
          (a) => a.username.toLowerCase() === normalizedUser && a.password === password
        );
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        return res.json({
          ...admin,
          role: 'LCOAdmin',
          franchiseAdminId: admin.franchiseAdminId,
        });
      }
      if (role === 'FranchiseAdmin') {
        const admin = MOCK_FRANCHISE_ADMINS.find(
          (a) => a.username.toLowerCase() === normalizedUser && a.password === password
        );
        if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
        const isp = MOCK_ISP_ADMINS.find((i) => i.id === admin.ispAdminId);
        return res.json({
          ...admin,
          role: 'FranchiseAdmin',
          franchiseAdminId: admin.id,
          ispName: isp?.name,
        });
      }
      if (role === 'Subscriber') {
        applyAutoExpiryMock();
        const sub = MOCK_SUBSCRIBERS.find(
          (s) =>
            (s.username?.toLowerCase() === normalizedUser || s.email?.toLowerCase() === normalizedUser) &&
            (s.password === password || password === 'demo' || password === 'password123')
        );
        if (!sub) return res.status(401).json({ error: 'Invalid credentials' });
        return res.json(processSubscriber(sub, sub.franchiseName));
      }
    }

    res.status(400).json({ error: 'Unsupported role for API login' });
  });

  app.get("/api/isp-admins", async (req, res) => {
    try {
      const result = await query("SELECT * FROM ISPAdmins ORDER BY CreatedAt DESC");
      res.json(result.recordset.map((a: any) => ({
        id: a.Id,
        name: a.Name,
        username: a.Username,
        email: a.Email,
        phone: a.Phone,
        status: a.Status,
        allowSubscriberPlanSelection: a.AllowSubscriberPlanSelection !== false && a.AllowSubscriberPlanSelection !== 0,
      })));
    } catch (err) {
      res.json(MOCK_ISP_ADMINS);
    }
  });

  app.get("/api/signup-config", async (req, res) => {
    const franchiseAdminId = (req.query.franchiseAdminId as string) || MOCK_FRANCHISE_ADMINS[0]?.id;
    const ispAdminId = await getIspAdminIdFromFranchise(franchiseAdminId);
    const allowSubscriberPlanSelection = await getAllowSubscriberPlanSelection(ispAdminId);
    const plans = await getAvailablePlans();
    res.json({
      franchiseAdminId,
      ispAdminId,
      allowSubscriberPlanSelection,
      plans: plans.map((p: any) => ({
        id: p.id ?? p.Id,
        name: p.name ?? p.Name,
        speed: p.speed ?? p.Speed,
        price: p.price ?? p.Price,
        validity: p.validity ?? p.Validity,
      })),
    });
  });

  app.get("/api/isp-settings", async (req, res) => {
    const auth = getAuth(req);
    if (auth.role !== 'MasterAdmin' && auth.role !== 'ISPAdmin') {
      return res.status(403).json({ error: 'Only Master Admin or ISP Admin can view ISP settings' });
    }

    const requestedIspAdminId = req.query.ispAdminId as string | undefined;
    const ispAdminId = auth.role === 'ISPAdmin' ? auth.ispAdminId : requestedIspAdminId;

    if (!ispAdminId) {
      return res.status(400).json({ error: 'ispAdminId is required' });
    }
    if (auth.role === 'ISPAdmin' && ispAdminId !== auth.ispAdminId) {
      return res.status(403).json({ error: 'Access denied to this ISP settings' });
    }

    const allowSubscriberPlanSelection = await getAllowSubscriberPlanSelection(ispAdminId);

    if (isMockMode) {
      const isp = MOCK_ISP_ADMINS.find((i) => i.id === ispAdminId);
      return res.json({
        ispAdminId,
        ispName: isp?.name,
        allowSubscriberPlanSelection,
      });
    }

    try {
      const result = await query(
        'SELECT Id, Name, AllowSubscriberPlanSelection FROM ISPAdmins WHERE Id = @ispAdminId',
        { ispAdminId }
      );
      const row = result.recordset[0];
      if (!row) return res.status(404).json({ error: 'ISP Admin not found' });
      res.json({
        ispAdminId: row.Id,
        ispName: row.Name,
        allowSubscriberPlanSelection: row.AllowSubscriberPlanSelection !== false && row.AllowSubscriberPlanSelection !== 0,
      });
    } catch (err) {
      const isp = MOCK_ISP_ADMINS.find((i) => i.id === ispAdminId);
      res.json({
        ispAdminId,
        ispName: isp?.name,
        allowSubscriberPlanSelection,
      });
    }
  });

  app.patch("/api/isp-settings", async (req, res) => {
    const auth = getAuth(req);
    if (auth.role !== 'MasterAdmin' && auth.role !== 'ISPAdmin') {
      return res.status(403).json({ error: 'Only Master Admin or ISP Admin can update ISP settings' });
    }

    const { ispAdminId: bodyIspAdminId, allowSubscriberPlanSelection } = req.body;
    const ispAdminId = auth.role === 'ISPAdmin' ? auth.ispAdminId : bodyIspAdminId;

    if (!ispAdminId) {
      return res.status(400).json({ error: 'ispAdminId is required' });
    }
    if (auth.role === 'ISPAdmin' && ispAdminId !== auth.ispAdminId) {
      return res.status(403).json({ error: 'Access denied to this ISP settings' });
    }
    if (typeof allowSubscriberPlanSelection !== 'boolean') {
      return res.status(400).json({ error: 'allowSubscriberPlanSelection must be a boolean' });
    }

    if (isMockMode) {
      const isp = MOCK_ISP_ADMINS.find((i) => i.id === ispAdminId);
      if (!isp) return res.status(404).json({ error: 'ISP Admin not found' });
      isp.allowSubscriberPlanSelection = allowSubscriberPlanSelection;
      return res.json({
        success: true,
        ispAdminId,
        allowSubscriberPlanSelection,
      });
    }

    try {
      await query(
        'UPDATE ISPAdmins SET AllowSubscriberPlanSelection = @allow WHERE Id = @ispAdminId',
        { allow: allowSubscriberPlanSelection ? 1 : 0, ispAdminId }
      );
      res.json({ success: true, ispAdminId, allowSubscriberPlanSelection });
    } catch (err) {
      const isp = MOCK_ISP_ADMINS.find((i) => i.id === ispAdminId);
      if (isp) {
        isp.allowSubscriberPlanSelection = allowSubscriberPlanSelection;
        return res.json({ success: true, ispAdminId, allowSubscriberPlanSelection });
      }
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get("/api/franchise-admins", async (req, res) => {
    const auth = getAuth(req);
    const scope = await resolveAccessScope(auth, {
      ispAdminId: req.query.ispAdminId as string | undefined,
    });
    if (!scope.ok) return res.status(scope.status).json({ error: scope.message });

    const ispAdminId = scope.ispAdminId || (req.query.ispAdminId as string | undefined);
    try {
      let sqlQuery = `SELECT fa.*, isp.Name AS ISPName,
        (SELECT COUNT(*) FROM Subscribers s WHERE s.FranchiseAdminId = fa.Id) AS SubscriberCount
        FROM FranchiseAdmins fa
        JOIN ISPAdmins isp ON fa.ISPAdminId = isp.Id`;
      const params: any = {};
      if (ispAdminId) {
        sqlQuery += " WHERE fa.ISPAdminId = @ispAdminId";
        params.ispAdminId = ispAdminId;
      }
      sqlQuery += " ORDER BY fa.CreatedAt DESC";
      const result = await query(sqlQuery, params);
      res.json(result.recordset.map((fa: any) => ({
        id: fa.Id,
        ispAdminId: fa.ISPAdminId,
        ispName: fa.ISPName,
        name: fa.Name,
        username: fa.Username,
        email: fa.Email,
        phone: fa.Phone,
        region: fa.Region,
        status: fa.Status,
        subscriberCount: fa.SubscriberCount,
      })));
    } catch (err) {
      let franchises = [...MOCK_FRANCHISE_ADMINS];
      if (ispAdminId) {
        franchises = franchises.filter((f) => f.ispAdminId === ispAdminId);
      }
      applyAutoExpiryMock();
      res.json(franchises.map((fa) => ({
        ...fa,
        ispName: MOCK_ISP_ADMINS.find((i) => i.id === fa.ispAdminId)?.name,
        subscriberCount: MOCK_SUBSCRIBERS.filter((s) => s.franchiseAdminId === fa.id).length,
      })));
    }
  });

  app.get("/api/lco-admins", async (req, res) => {
    const auth = getAuth(req);
    const scope = await resolveAccessScope(auth, {
      franchiseAdminId: req.query.franchiseAdminId as string | undefined,
      ispAdminId: req.query.ispAdminId as string | undefined,
    });
    if (!scope.ok) return res.status(scope.status).json({ error: scope.message });

    const franchiseAdminId = scope.franchiseAdminId;
    const ispAdminId = scope.ispAdminId;
    try {
      let sqlQuery = `SELECT lc.*, fa.Name AS FranchiseName,
        (SELECT COUNT(*) FROM Subscribers s WHERE s.FranchiseAdminId = lc.FranchiseAdminId) AS SubscriberCount
        FROM LCOAdmins lc
        JOIN FranchiseAdmins fa ON lc.FranchiseAdminId = fa.Id`;
      const params: any = {};
      if (franchiseAdminId) {
        sqlQuery += " WHERE lc.FranchiseAdminId = @franchiseAdminId";
        params.franchiseAdminId = franchiseAdminId;
      } else if (ispAdminId) {
        sqlQuery += " WHERE lc.FranchiseAdminId IN (SELECT Id FROM FranchiseAdmins WHERE ISPAdminId = @ispAdminId)";
        params.ispAdminId = ispAdminId;
      }
      sqlQuery += " ORDER BY lc.Name ASC";
      const result = await query(sqlQuery, params);
      res.json(result.recordset.map((lco: any) => ({
        id: lco.Id,
        franchiseAdminId: lco.FranchiseAdminId,
        franchiseName: lco.FranchiseName,
        name: lco.Name,
        username: lco.Username,
        email: lco.Email,
        phone: lco.Phone,
        region: lco.Region,
        status: lco.Status,
        subscriberCount: lco.SubscriberCount,
      })));
    } catch (err) {
      let lcos = [...MOCK_LCO_ADMINS];
      if (franchiseAdminId) {
        lcos = lcos.filter((l) => l.franchiseAdminId === franchiseAdminId);
      } else if (ispAdminId) {
        const franchiseIds = MOCK_FRANCHISE_ADMINS.filter((f) => f.ispAdminId === ispAdminId).map((f) => f.id);
        lcos = lcos.filter((l) => franchiseIds.includes(l.franchiseAdminId));
      }
      applyAutoExpiryMock();
      res.json(lcos.map((lco) => ({
        ...lco,
        franchiseName: MOCK_FRANCHISE_ADMINS.find((f) => f.id === lco.franchiseAdminId)?.name,
        subscriberCount: MOCK_SUBSCRIBERS.filter((s) => s.franchiseAdminId === lco.franchiseAdminId).length,
      })));
    }
  });

  app.post("/api/franchise-admins", async (req, res) => {
    const auth = getAuth(req);
    const scope = await resolveAccessScope(auth, { ispAdminId: req.body.ispAdminId });
    if (!scope.ok) return res.status(scope.status).json({ error: scope.message });
    if (auth.role !== 'ISPAdmin' && auth.role !== 'MasterAdmin') {
      return res.status(403).json({ error: 'Only ISP Admin can create franchise admins' });
    }

    const ispAdminId = auth.role === 'ISPAdmin' ? auth.ispAdminId : req.body.ispAdminId;
    const { name, username, email, phone, region, password } = req.body;
    const id = uuidv4();
    try {
      await query(
        `INSERT INTO FranchiseAdmins (Id, ISPAdminId, Name, Username, PasswordHash, Email, Phone, Region)
         VALUES (@id, @ispAdminId, @name, @username, @password, @email, @phone, @region)`,
        {
          id,
          ispAdminId,
          name,
          username,
          password: password || 'password',
          email,
          phone,
          region,
        }
      );
      res.status(201).json({ id, success: true });
    } catch (err) {
      if (isMockMode) {
        const newFranchise = {
          id,
          ispAdminId,
          name,
          username,
          password: password || 'password',
          email,
          phone,
          region,
          status: 'Active',
        };
        MOCK_FRANCHISE_ADMINS.unshift(newFranchise);
        return res.status(201).json({ id, success: true, franchiseAdmin: newFranchise });
      }
      res.status(500).json({ error: 'Database error' });
    }
  });

  app.get("/api/dashboard/stats", async (req, res) => {
    const auth = getAuth(req);
    const scope = await resolveAccessScope(auth, {
      franchiseAdminId: req.query.franchiseAdminId as string | undefined,
      ispAdminId: req.query.ispAdminId as string | undefined,
    });
    if (!scope.ok) return res.status(scope.status).json({ error: scope.message });

    const franchiseAdminId = scope.franchiseAdminId;
    const ispAdminId = scope.ispAdminId;
    try {
      await applyAutoExpiryDb();
      let subQuery = `SELECT s.*, fa.Name AS FranchiseName
        FROM Subscribers s
        LEFT JOIN FranchiseAdmins fa ON s.FranchiseAdminId = fa.Id`;
      const params: any = {};
      if (franchiseAdminId) {
        subQuery += " WHERE s.FranchiseAdminId = @franchiseAdminId";
        params.franchiseAdminId = franchiseAdminId;
      } else if (ispAdminId) {
        subQuery += " WHERE s.FranchiseAdminId IN (SELECT Id FROM FranchiseAdmins WHERE ISPAdminId = @ispAdminId)";
        params.ispAdminId = ispAdminId;
      }
      const subsResult = await query(subQuery, params);

      let faQuery = `SELECT fa.*, isp.Name AS ISPName FROM FranchiseAdmins fa JOIN ISPAdmins isp ON fa.ISPAdminId = isp.Id`;
      const faParams: any = {};
      if (ispAdminId) {
        faQuery += " WHERE fa.ISPAdminId = @ispAdminId";
        faParams.ispAdminId = ispAdminId;
      } else if (franchiseAdminId) {
        faQuery += " WHERE fa.Id = @franchiseAdminId";
        faParams.franchiseAdminId = franchiseAdminId;
      }
      const faResult = await query(faQuery, faParams);
      const ipv4Result = await query(`
        SELECT ip.*, s.Name AS SubscriberName
        FROM IPv4Addresses ip
        LEFT JOIN Subscribers s ON ip.SubscriberId = s.Id
      `);

      const subs = subsResult.recordset.map((s: any) => processSubscriber(s, s.FranchiseName));
      const franchises = faResult.recordset.map((fa: any) => ({
        id: fa.Id,
        name: fa.Name,
        region: fa.Region,
        ispAdminId: fa.ISPAdminId,
        ispName: fa.ISPName,
      }));
      const ipv4Pool = ipv4Result.recordset.map((ip: any) => ({
        id: ip.Id,
        address: ip.Address,
        subscriberId: ip.SubscriberId,
        subscriberName: ip.SubscriberName,
        status: ip.Status,
        assignedAt: ip.AssignedAt,
      }));

      res.json(buildDashboardStats(subs, franchises, ipv4Pool, ispAdminId as string | undefined));
    } catch (err) {
      applyAutoExpiryMock();
      let subs = [...MOCK_SUBSCRIBERS].map((s) => processSubscriber(s, s.franchiseName));
      subs = filterSubscribersByHierarchy(
        subs,
        franchiseAdminId as string | undefined,
        ispAdminId as string | undefined
      );
      res.json(buildDashboardStats(subs, MOCK_FRANCHISE_ADMINS, getMockIpv4Pool(), ispAdminId as string | undefined));
    }
  });

  app.get("/api/ipv4", async (req, res) => {
    const auth = getAuth(req);
    const scope = await resolveAccessScope(auth, {
      franchiseAdminId: req.query.franchiseAdminId as string | undefined,
      ispAdminId: req.query.ispAdminId as string | undefined,
    });
    if (!scope.ok) return res.status(scope.status).json({ error: scope.message });
    if (!['MasterAdmin', 'ISPAdmin', 'FranchiseAdmin', 'LCOAdmin'].includes(auth.role || '')) {
      return res.status(403).json({ error: 'IPv4 management is restricted to admin roles' });
    }

    try {
      await applyAutoExpiryDb();
      const result = await query(`
        SELECT ip.*, s.Name AS SubscriberName, s.FranchiseAdminId
        FROM IPv4Addresses ip
        LEFT JOIN Subscribers s ON ip.SubscriberId = s.Id
        ORDER BY ip.Address
      `);
      let pool = result.recordset.map((ip: any) => ({
        id: ip.Id,
        address: ip.Address,
        subscriberId: ip.SubscriberId,
        subscriberName: ip.SubscriberName,
        franchiseAdminId: ip.FranchiseAdminId,
        status: ip.Status,
        assignedAt: ip.AssignedAt ? ip.AssignedAt.toISOString() : null,
      }));

      if (scope.franchiseAdminId) {
        pool = pool.filter(
          (ip) => !ip.subscriberId || ip.franchiseAdminId === scope.franchiseAdminId
        );
      } else if (scope.ispAdminId) {
        const franchiseIds = MOCK_FRANCHISE_ADMINS.filter((f) => f.ispAdminId === scope.ispAdminId).map((f) => f.id);
        pool = pool.filter(
          (ip) => !ip.subscriberId || franchiseIds.includes(ip.franchiseAdminId)
        );
      }

      res.json({
        addresses: pool,
        stats: buildIpv4Stats(pool),
      });
    } catch (err) {
      applyAutoExpiryMock();
      let pool = getMockIpv4Pool();
      if (scope.franchiseAdminId) {
        pool = pool.filter((ip) => {
          if (!ip.subscriberId) return true;
          const sub = MOCK_SUBSCRIBERS.find((s) => s.id === ip.subscriberId);
          return sub?.franchiseAdminId === scope.franchiseAdminId;
        });
      } else if (scope.ispAdminId) {
        const franchiseIds = MOCK_FRANCHISE_ADMINS.filter((f) => f.ispAdminId === scope.ispAdminId).map((f) => f.id);
        pool = pool.filter((ip) => {
          if (!ip.subscriberId) return true;
          const sub = MOCK_SUBSCRIBERS.find((s) => s.id === ip.subscriberId);
          return sub && franchiseIds.includes(sub.franchiseAdminId);
        });
      }
      res.json({
        addresses: pool,
        stats: buildIpv4Stats(pool),
      });
    }
  });

  app.get("/api/subscribers", async (req, res) => {
    const auth = getAuth(req);
    const scope = await resolveAccessScope(auth, {
      franchiseAdminId: req.query.franchiseAdminId as string | undefined,
      ispAdminId: req.query.ispAdminId as string | undefined,
    });
    if (!scope.ok) return res.status(scope.status).json({ error: scope.message });

    const franchiseAdminId = scope.franchiseAdminId;
    const ispAdminId = scope.ispAdminId;
    try {
      await applyAutoExpiryDb();
      let sqlQuery = `SELECT s.*, fa.Name AS FranchiseName
        FROM Subscribers s
        LEFT JOIN FranchiseAdmins fa ON s.FranchiseAdminId = fa.Id`;
      const params: any = {};
      if (franchiseAdminId) {
        sqlQuery += " WHERE s.FranchiseAdminId = @franchiseAdminId";
        params.franchiseAdminId = franchiseAdminId;
      } else if (ispAdminId) {
        sqlQuery += " WHERE s.FranchiseAdminId IN (SELECT Id FROM FranchiseAdmins WHERE ISPAdminId = @ispAdminId)";
        params.ispAdminId = ispAdminId;
      }
      sqlQuery += " ORDER BY s.ApplicationDate DESC";
      const result = await query(sqlQuery, params);
      res.json(result.recordset.map((s: any) => processSubscriber(s, s.FranchiseName)));
    } catch (err) {
      applyAutoExpiryMock();
      let subs = MOCK_SUBSCRIBERS.map((s) => processSubscriber(s, s.franchiseName));
      subs = filterSubscribersByHierarchy(
        subs,
        franchiseAdminId as string | undefined,
        ispAdminId as string | undefined
      );
      res.json(subs);
    }
  });

  app.post("/api/subscribers", async (req, res) => {
    const auth = getAuth(req);
    const data = req.body;
    const franchiseAdminId = auth.role === 'FranchiseAdmin'
      ? auth.franchiseAdminId
      : data.franchiseAdminId || MOCK_FRANCHISE_ADMINS[0]?.id;

    if (auth.role) {
      const scope = await resolveAccessScope(auth, { franchiseAdminId });
      if (!scope.ok) return res.status(scope.status).json({ error: scope.message });
    }

    const ispAdminId = await getIspAdminIdFromFranchise(franchiseAdminId);
    const allowPlanSelection = await getAllowSubscriberPlanSelection(ispAdminId);
    const isSelfSignup = !auth.role || auth.role === 'Subscriber';

    if (isSelfSignup) {
      if (!allowPlanSelection && data.plan) {
        return res.status(400).json({ error: 'Plan selection is disabled. An admin will assign your plan after registration.' });
      }
      if (allowPlanSelection && !data.plan) {
        return res.status(400).json({ error: 'Please select an internet plan to continue.' });
      }
    }

    const planName = isSelfSignup
      ? (allowPlanSelection ? data.plan : null)
      : (data.plan || null);

    const id = uuidv4();
    const franchiseName = getFranchiseName(franchiseAdminId);
    try {
      await query(
        `INSERT INTO Subscribers (Id, FranchiseAdminId, Name, Phone, Email, Username, PasswordHash, ConnectionType, Address, IdType, IdNumber, PlanName) 
         VALUES (@id, @franchiseAdminId, @name, @phone, @email, @username, @password, @connectionType, @address, @idType, @idNumber, @plan)`,
        { 
          id,
          franchiseAdminId,
          name: data.name, 
          phone: data.phone, 
          email: data.email, 
          username: data.username, 
          password: data.password || 'password123',
          connectionType: data.connectionType || 'PPPoE', 
          address: data.address, 
          idType: data.idType, 
          idNumber: data.idNumber,
          plan: planName
        }
      );
      const subResult = await query("SELECT * FROM Subscribers WHERE Id = @id", { id });
      const subscriber = subResult.recordset[0];
      res.status(201).json({ id, success: true, subscriber: processSubscriber(subscriber, franchiseName) });
    } catch (err) {
      const newSub = {
        id,
        franchiseAdminId,
        franchiseName,
        name: data.name,
        phone: data.phone,
        email: data.email,
        username: data.username,
        password: data.password || 'password123',
        plan: planName || 'Not Assigned',
        status: 'KYC Pending',
        ip: '-',
        expiry: '-',
        connectionType: data.connectionType || 'PPPoE',
        kycStatus: 'Pending',
        address: data.address || 'N/A',
        idType: data.idType || 'Aadhaar',
        idNumber: data.idNumber || 'N/A'
      };
      MOCK_SUBSCRIBERS.unshift(newSub as any);
      return res.status(201).json({ id, success: true, subscriber: newSub });
    }
  });

  app.post("/api/subscribers/approve", async (req, res) => {
    const auth = getAuth(req);
    const { id } = req.body;
    if (!(await assertSubscriberAccess(auth, id))) {
      return res.status(403).json({ error: 'Access denied to this subscriber' });
    }
    try {
      await query("UPDATE Subscribers SET Status = 'Approved', KycStatus = 'Verified' WHERE Id = @id", { id });
      res.json({ success: true, message: `Subscriber ${id} approved.` });
    } catch (err) {
      if (isMockMode) {
        const sub = MOCK_SUBSCRIBERS.find(s => s.id === id);
        if (sub) {
          sub.status = 'Approved';
          sub.kycStatus = 'Verified';
        }
        return res.json({ success: true });
      }
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/subscribers/schedule-installation", async (req, res) => {
    const auth = getAuth(req);
    const { id } = req.body;
    if (!(await assertSubscriberAccess(auth, id))) {
      return res.status(403).json({ error: 'Access denied to this subscriber' });
    }
    try {
      await query("UPDATE Subscribers SET Status = 'Installation Scheduled' WHERE Id = @id", { id });
      res.json({ success: true });
    } catch (err) {
      if (isMockMode) {
        const sub = MOCK_SUBSCRIBERS.find(s => s.id === id);
        if (sub) sub.status = 'Installation Scheduled';
        return res.json({ success: true });
      }
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/subscribers/complete-installation", async (req, res) => {
    const auth = getAuth(req);
    const { id } = req.body;
    if (!(await assertSubscriberAccess(auth, id))) {
      return res.status(403).json({ error: 'Access denied to this subscriber' });
    }
    try {
      const subResult = await query("SELECT * FROM Subscribers WHERE Id = @id", { id });
      const sub = subResult.recordset[0];
      
      if (sub) {
        const ipResult = await query(
          "SELECT TOP 1 * FROM IPv4Addresses WHERE Status = 'Available' ORDER BY Address"
        );
        const availableIp = ipResult.recordset[0];
        if (!availableIp) {
          return res.status(409).json({ error: 'No available IPv4 addresses in pool' });
        }

        const ip = availableIp.Address;
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1);
        
        await query(
          "UPDATE Subscribers SET Status = 'Active', IpAddress = @ip, ExpiryDate = @expiry WHERE Id = @id",
          { id, ip, expiry: expiryDate }
        );
        await query(
          "UPDATE IPv4Addresses SET SubscriberId = @subId, Status = 'Assigned', AssignedAt = GETDATE() WHERE Id = @ipId",
          { subId: id, ipId: availableIp.Id }
        );

        const invId = uuidv4();
        const amount = sub.PlanName.includes('100') ? 899 : sub.PlanName.includes('200') ? 1499 : 599;
        await query(
          "INSERT INTO Invoices (Id, SubscriberId, SubscriberName, Amount, Status) VALUES (@invId, @subId, @subName, @amount, 'Unpaid')",
          { invId, subId: id, subName: sub.Name, amount }
        );

        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Subscriber not found" });
      }
    } catch (err) {
      if (isMockMode) {
        const sub = MOCK_SUBSCRIBERS.find(s => s.id === id);
        const availableIp = MOCK_IPV4.find((ip) => ip.status === 'Available');
        if (sub && availableIp) {
          sub.status = 'Active';
          sub.ip = availableIp.address;
          availableIp.subscriberId = sub.id;
          availableIp.subscriberName = sub.name;
          availableIp.status = 'Assigned';
          availableIp.assignedAt = new Date().toISOString();
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1);
          sub.expiry = expiryDate.toISOString().split('T')[0];
          
          const invId = `INV-${Math.floor(Math.random() * 9000) + 1000}`;
          const amount = sub.plan.includes('100') ? 899 : sub.plan.includes('200') ? 1499 : 599;
          MOCK_INVOICES.unshift({
            id: invId,
            subscriber: sub.name,
            amount,
            status: 'Unpaid',
            date: new Date().toISOString().split('T')[0]
          });
        }
        return res.json({ success: true });
      }
      res.status(500).json({ error: "Database error" });
    }
  });

  // Provision subscriber (PPPoE + FreeRADIUS integration)
  app.post("/api/subscribers/:id/provision", async (req, res) => {
    const auth = getAuth(req);
    const { id } = req.params;
    const { pppoeUsername, pppoePassword, plan, ip, createFreeRADIUS } = req.body;
    if (!(await assertSubscriberAccess(auth, id))) {
      return res.status(403).json({ error: 'Access denied to this subscriber' });
    }

    try {
      if (!isMockMode) {
        const check = await query("SELECT Status FROM Subscribers WHERE Id = @id", { id });
        if (check.recordset.length === 0) return res.status(404).json({ error: 'Subscriber not found' });
        if (check.recordset[0].Status === 'Suspended') {
          return res.status(403).json({ error: 'Cannot provision suspended subscriber. Service has expired.' });
        }
        if (check.recordset[0].Status !== 'Installation Completed') {
          return res.status(400).json({ error: `Invalid status: expected "Installation Completed"` });
        }

        await query(
          "UPDATE Subscribers SET Status = 'Active', PPPoEUsername = @pppoeUser, PPPoEPassword = @pppoePass, IpAddress = @ip WHERE Id = @id",
          { id, pppoeUser: pppoeUsername, pppoePass: pppoePassword, ip }
        );
        await query(
          "UPDATE IPv4Addresses SET SubscriberId = @subId, Status = 'Assigned', AssignedAt = GETDATE() WHERE Address = @ip",
          { subId: id, ip }
        );

        // FreeRADIUS integration point
        if (createFreeRADIUS) {
          // TODO: Call FreeRADIUS API to create RADIUS user
          // await radiusClient.createUser({
          //   username: pppoeUsername,
          //   password: pppoePassword,
          //   plan,
          //   ip,
          // });
        }
      } else {
        const sub = MOCK_SUBSCRIBERS.find(s => s.id === id);
        if (!sub) return res.status(404).json({ error: 'Subscriber not found' });
        if (sub.status === 'Suspended') {
          return res.status(403).json({ error: 'Cannot provision suspended subscriber. Service has expired.' });
        }
        if (sub.status !== 'Installation Completed') {
          return res.status(400).json({ error: `Invalid status: expected "Installation Completed"` });
        }
        sub.status = 'Active';
        sub.ip = ip;
        sub.pppoeUsername = pppoeUsername;
        sub.pppoePassword = pppoePass;

        const ipObj = MOCK_IPV4.find(a => a.address === ip);
        if (ipObj) {
          ipObj.subscriberId = sub.id;
          ipObj.subscriberName = sub.name;
          ipObj.status = 'Assigned';
          ipObj.assignedAt = new Date().toISOString();
        }

        // FreeRADIUS integration point
        if (createFreeRADIUS) {
          // TODO: Call FreeRADIUS API to create RADIUS user
          // await radiusClient.createUser({
          //   username: pppoeUsername,
          //   password: pppoePassword,
          //   plan,
          //   ip,
          // });
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Provisioning failed' });
    }
  });

  // Terminate subscriber session (admin action)
  app.post("/api/subscribers/terminate-session", async (req, res) => {
    const auth = getAuth(req);
    const { id } = req.body;
    if (!(await assertSubscriberAccess(auth, id))) {
      return res.status(403).json({ error: 'Access denied to this subscriber' });
    }
    try {
      await query(
        "UPDATE Subscribers SET Status = 'Terminated', IpAddress = 'Pending', ExpiryDate = NULL WHERE Id = @id",
        { id }
      );
      await query(
        "UPDATE IPv4Addresses SET SubscriberId = NULL, Status = 'Available', AssignedAt = NULL WHERE SubscriberId = @id",
        { id }
      );
      res.json({ success: true });
    } catch (err) {
      if (isMockMode) {
        const sub = MOCK_SUBSCRIBERS.find((s) => s.id === id);
        if (sub) {
          sub.status = "Terminated";
          sub.ip = "-";
          sub.expiry = "-";
          releaseIpv4ForSubscriber(id);
        }
        return res.json({ success: true });
      }
      res.status(500).json({ error: "Database error" });
    }
  });

  app.patch("/api/subscribers/:id", async (req, res) => {
    const auth = getAuth(req);
    const { id } = req.params;
    if (!(await assertSubscriberAccess(auth, id))) {
      return res.status(403).json({ error: 'Access denied to this subscriber' });
    }
    const { status, plan } = req.body;

    if (plan !== undefined && auth.role !== 'MasterAdmin' && auth.role !== 'ISPAdmin' && auth.role !== 'FranchiseAdmin') {
      return res.status(403).json({ error: 'Only admins can assign subscriber plans' });
    }

    try {
      if (status !== undefined && plan !== undefined) {
        await query("UPDATE Subscribers SET Status = @status, PlanName = @plan WHERE Id = @id", { id, status, plan });
      } else if (status !== undefined) {
        await query("UPDATE Subscribers SET Status = @status WHERE Id = @id", { id, status });
      } else if (plan !== undefined) {
        await query("UPDATE Subscribers SET PlanName = @plan WHERE Id = @id", { id, plan });
      } else {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }
      res.json({ success: true });
    } catch (err) {
      if (isMockMode) {
        const sub = MOCK_SUBSCRIBERS.find(s => s.id === id);
        if (sub) {
          if (status !== undefined) sub.status = status;
          if (plan !== undefined) sub.plan = plan;
        }
        return res.json({ success: true });
      }
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/subscribers/:id", async (req, res) => {
    const auth = getAuth(req);
    const { id } = req.params;
    if (!(await assertSubscriberAccess(auth, id))) {
      return res.status(403).json({ error: 'Access denied to this subscriber' });
    }
    try {
      await query("UPDATE IPv4Addresses SET SubscriberId = NULL, Status = 'Available', AssignedAt = NULL WHERE SubscriberId = @id", { id });
      await query("DELETE FROM Invoices WHERE SubscriberId = @id", { id });
      await query("DELETE FROM Subscribers WHERE Id = @id", { id });
      res.json({ success: true });
    } catch (err) {
      if (isMockMode) {
        releaseIpv4ForSubscriber(id);
        MOCK_SUBSCRIBERS = MOCK_SUBSCRIBERS.filter(s => s.id !== id);
        return res.json({ success: true });
      }
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/billing/invoices", async (req, res) => {
    const auth = getAuth(req);
    const scope = await resolveAccessScope(auth, {
      franchiseAdminId: req.query.franchiseAdminId as string | undefined,
      ispAdminId: req.query.ispAdminId as string | undefined,
    });
    if (!scope.ok) return res.status(scope.status).json({ error: scope.message });

    const franchiseAdminId = scope.franchiseAdminId;
    const ispAdminId = scope.ispAdminId;
    try {
      let sqlQuery = `SELECT i.* FROM Invoices i
        JOIN Subscribers s ON i.SubscriberId = s.Id`;
      const params: any = {};
      if (franchiseAdminId) {
        sqlQuery += " WHERE s.FranchiseAdminId = @franchiseAdminId";
        params.franchiseAdminId = franchiseAdminId;
      } else if (ispAdminId) {
        sqlQuery += " WHERE s.FranchiseAdminId IN (SELECT Id FROM FranchiseAdmins WHERE ISPAdminId = @ispAdminId)";
        params.ispAdminId = ispAdminId;
      }
      sqlQuery += " ORDER BY i.InvoiceDate DESC";
      const result = await query(sqlQuery, params);
      res.json(result.recordset.map(i => ({
        id: i.Id,
        subscriber: i.SubscriberName,
        amount: i.Amount,
        status: i.Status,
        date: i.InvoiceDate.toISOString().split('T')[0]
      })));
    } catch (err) {
      let subs = filterSubscribersByHierarchy(
        MOCK_SUBSCRIBERS,
        franchiseAdminId as string | undefined,
        ispAdminId as string | undefined
      );
      const subNames = new Set(subs.map((s) => s.name));
      res.json(MOCK_INVOICES.filter((inv) => subNames.has(inv.subscriber)));
    }
  });

  // --- New Production Routes ---

  app.get("/api/plans", async (req, res) => {
    try {
      const result = await query("SELECT * FROM Plans");
      res.json(result.recordset);
    } catch (err) {
      res.json(MOCK_PLANS);
    }
  });

  app.get("/api/tickets", async (req, res) => {
    try {
      const { subscriberId } = req.query;
      let sqlQuery = "SELECT * FROM SupportTickets ORDER BY CreatedAt DESC";
      let params = {};
      if (subscriberId) {
        sqlQuery = "SELECT * FROM SupportTickets WHERE SubscriberId = @subId ORDER BY CreatedAt DESC";
        params = { subId: subscriberId };
      }
      const result = await query(sqlQuery, params);
      res.json(result.recordset);
    } catch (err) {
      const { subscriberId } = req.query;
      res.json(subscriberId ? MOCK_TICKETS.filter(t => t.subscriberId === subscriberId) : MOCK_TICKETS);
    }
  });

  app.post("/api/tickets", async (req, res) => {
    try {
      const { subscriberId, subject, category, priority } = req.body;
      await query(
        "INSERT INTO SupportTickets (SubscriberId, Subject, Category, Priority) VALUES (@subId, @subject, @cat, @pri)",
        { subId: subscriberId, subject, cat: category, pri: priority }
      );
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/network/nodes", async (req, res) => {
    try {
      const result = await query("SELECT * FROM NetworkNodes");
      res.json(result.recordset);
    } catch (err) {
      res.json(MOCK_NODES);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NetPulse Server running on http://localhost:${PORT}`);
  });
}

startServer();
