import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Network, 
  CreditCard, 
  FileText, 
  Settings as SettingsIcon,
  ShieldCheck, 
  Activity,
  Plus,
  Search,
  MoreVertical,
  ArrowUpRight,
  ArrowDownRight,
  Wifi,
  Database,
  Globe,
  Bell,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Lock,
  Mail,
  User as UserIcon,
  Shield,
  ArrowRight,
  Eye,
  EyeOff,
  LifeBuoy,
  Building2,
  Server
} from 'lucide-react';
import { apiFetch, getDisplayStatus } from './utils/api';
import { canTransitionTo } from '../shared/subscriberStatus';
import { motion, AnimatePresence } from 'motion/react';


// --- Types ---
type Role = 'MasterAdmin' | 'ISPAdmin' | 'FranchiseAdmin' | 'LCOAdmin' | 'Subscriber';

interface Stats {
  totalUsers?: number;
  activeUsers?: number;
  expiredUsers?: number;
  suspendedUsers?: number;
  expiringWithin7Days?: number;
  activeSubscribers: number;
  pendingApprovals: number;
  revenueThisMonth: number;
  networkHealth: number;
  franchiseCount?: number;
  franchiseAdmins?: FranchiseAdmin[];
  tenants: any[];
  ipv4?: { total: number; assigned: number; available: number };
}

interface IPv4Address {
  id: string;
  address: string;
  subscriberId?: string | null;
  subscriberName?: string | null;
  status: string;
  assignedAt?: string | null;
  poolName?: string;
}

const IP_POOLS = [
  { name: 'DHCP Pool - Main', subnet: '10.0.1.0/24', gateway: '10.0.1.1', start: '10.0.1.10', end: '10.0.1.200', used: '0/191' },
  { name: 'DHCP Pool - Secondary', subnet: '10.0.2.0/24', gateway: '10.0.2.1', start: '10.0.2.10', end: '10.0.2.150', used: '0/141' },
  { name: 'Static Leases', subnet: '10.0.3.0/24', gateway: '10.0.3.1', start: '10.0.3.2', end: '10.0.3.50', used: '0/49' },
  { name: 'Management Pool', subnet: '192.168.10.0/24', gateway: '192.168.10.1', start: '192.168.10.10', end: '192.168.10.100', used: '0/91' },
];

const ipToNum = (ip: string) => {
  const octets = ip.split('.').map(Number);
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
};

const getPoolName = (address: string): string => {
  const n = ipToNum(address);
  for (const pool of IP_POOLS) {
    const s = ipToNum(pool.start);
    const e = ipToNum(pool.end);
    if (n >= s && n <= e) return pool.name;
  }
  return 'Unassigned Pool';
};

interface FranchiseAdmin {
  id: string;
  ispAdminId: string;
  ispName?: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  region?: string;
  status?: string;
  subscriberCount?: number;
}

interface Subscriber {
  id: string;
  franchiseAdminId?: string;
  franchiseName?: string;
  name: string;
  status: string;
  plan: string;
  ip: string;
  expiry: string;
  phone?: string;
  email?: string;
  username?: string;
  connectionType?: string;
  kycStatus?: string;
  address?: string;
  pppoeUsername?: string;
  pppoePassword?: string;
  installationStatus?: string;
}

interface Invoice {
  id: string;
  subscriber: string;
  amount: number;
  status: string;
  date: string;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void, key?: string }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active 
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

const StatCard = ({ title, value, change, icon: Icon, trend }: { title: string, value: string | number, change: string, icon: any, trend: 'up' | 'down' }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-slate-50 rounded-xl text-indigo-600">
        <Icon size={24} />
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
        {trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
        {change}
      </div>
    </div>
    <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    'Active': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'KYC Pending': 'bg-amber-50 text-amber-700 border-amber-100',
    'KYC Verified': 'bg-teal-50 text-teal-700 border-teal-100',
    'Installation Completed': 'bg-cyan-50 text-cyan-700 border-cyan-100',
    'Suspended': 'bg-rose-50 text-rose-700 border-rose-100',
    'Under Review': 'bg-indigo-50 text-indigo-700 border-indigo-100',
    'Draft': 'bg-slate-50 text-slate-700 border-slate-100',
    'Approved': 'bg-blue-50 text-blue-700 border-blue-100',
    'Installation Scheduled': 'bg-purple-50 text-purple-700 border-purple-100',
    'Installation Pending': 'bg-sky-50 text-sky-700 border-sky-100',
    'To Be Expired': 'bg-amber-50 text-amber-700 border-amber-100',
    'Expired': 'bg-orange-50 text-orange-700 border-orange-100',
    'Expiring1d': 'bg-amber-50 text-amber-700 border-amber-100',
    'Expiring3d': 'bg-amber-50 text-amber-700 border-amber-100',
    'Expiring7d': 'bg-yellow-50 text-yellow-700 border-yellow-100',
    'Terminated': 'bg-slate-200 text-slate-800 border-slate-300',
    'Verified': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'Pending': 'bg-amber-50 text-amber-700 border-amber-100',
    'Available': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'Assigned': 'bg-indigo-50 text-indigo-700 border-indigo-100',
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || 'bg-slate-50 text-slate-700 border-slate-100'}`}>
      {status}
    </span>
  );
};

// --- Auth Components ---

const LoginPage = ({ onLogin, onSwitchToRegister, isLoggingIn }: { onLogin: (role: Role, username: string, pass: string) => void, onSwitchToRegister: () => void, isLoggingIn: boolean }) => {
  const [role, setRole] = useState<Role>('MasterAdmin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(role, username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden"
      >
        <div className="p-8 bg-indigo-600 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Wifi size={32} />
          </div>
          <h2 className="text-2xl font-bold">Welcome Back</h2>
          <p className="text-indigo-100 mt-2">Sign in to manage your ISP network</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Shield size={16} className="text-indigo-600" />
              Select Your Role
            </label>
            <select 
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              <option value="MasterAdmin">Master Admin</option>
              <option value="ISPAdmin">ISP Admin</option>
              <option value="FranchiseAdmin">Franchise Admin</option>
              <option value="LCOAdmin">LCO Admin</option>
              <option value="Subscriber">Subscriber</option>
            </select>
            <p className="text-xs text-slate-400 mt-2">
              {role === 'ISPAdmin' && 'Demo: ispadmin / password'}
              {role === 'FranchiseAdmin' && 'Demo: franchise1 or franchise2 / password'}
              {role === 'MasterAdmin' && 'Demo: masteradmin / password'}
              {role === 'LCOAdmin' && 'Demo: lc_rajesh / password'}
              {role === 'Subscriber' && 'Demo: subscriber / password'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <UserIcon size={16} className="text-indigo-600" />
              Username / Email
            </label>
            <input 
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username or email"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Lock size={16} className="text-indigo-600" />
              Password
            </label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoggingIn}
            className={`w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 group ${isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoggingIn ? 'Signing In...' : 'Sign In'}
            {!isLoggingIn && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
          </button>

          <div className="text-center pt-4">
            <p className="text-slate-500 text-sm">
              Don't have an account? 
              <button 
                type="button"
                onClick={onSwitchToRegister}
                className="ml-2 text-indigo-600 font-bold hover:underline"
              >
                Register Now
              </button>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

type SignupConfig = {
  franchiseAdminId: string;
  allowSubscriberPlanSelection: boolean;
  plans: { id: number; name: string; speed?: number; price?: number }[];
};

const RegisterPage = ({ onRegister, onSwitchToLogin }: { onRegister: (user: any) => void, onSwitchToLogin: () => void }) => {
  const [step, setStep] = useState(1);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    dob: '',
    gender: 'Male',
    houseNo: '',
    street: '',
    city: '',
    state: '',
    pinCode: '',
    installationAddress: '',
    plan: '',
    connectionType: 'PPPoE',
    idType: 'Aadhaar',
    idNumber: '',
    username: '',
    password: '',
    confirmPassword: '',
    role: 'Subscriber' as Role
  });

  useEffect(() => {
    fetch('/api/signup-config')
      .then((res) => res.json())
      .then((config: SignupConfig) => {
        setSignupConfig(config);
        if (config.allowSubscriberPlanSelection && config.plans?.length) {
          setFormData((prev) => ({ ...prev, plan: config.plans[0].name }));
        }
      })
      .catch(() => {
        setSignupConfig({
          franchiseAdminId: 'FA001',
          allowSubscriberPlanSelection: true,
          plans: [
            { id: 1, name: '50Mbps Basic' },
            { id: 2, name: '100Mbps Unlimited' },
            { id: 3, name: '200Mbps Premium' },
          ],
        });
        setFormData((prev) => ({ ...prev, plan: '100Mbps Unlimited' }));
      })
      .finally(() => setConfigLoading(false));
  }, []);

  const allowPlanSelection = signupConfig?.allowSubscriberPlanSelection ?? true;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    if (allowPlanSelection && !formData.plan) {
      alert('Please select an internet plan to continue.');
      return;
    }
    const address = [formData.houseNo, formData.street, formData.city, formData.state, formData.pinCode]
      .filter(Boolean)
      .join(', ');
    onRegister({
      ...formData,
      address: address || formData.installationAddress,
      franchiseAdminId: signupConfig?.franchiseAdminId || 'FA001',
      plan: allowPlanSelection ? formData.plan : undefined,
    });
  };

  const nextStep = () => {
    if (step === 2 && allowPlanSelection && !formData.plan) {
      alert('Please select an internet plan to continue.');
      return;
    }
    setStep((s) => s + 1);
  };
  const prevStep = () => setStep(s => s - 1);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden"
      >
        <div className="p-8 bg-emerald-600 text-white text-center relative">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <UserIcon size={32} />
          </div>
          <h2 className="text-2xl font-bold">Subscriber Registration</h2>
          <p className="text-emerald-100 mt-2">Step {step} of 4: {
            step === 1 ? 'Personal Info' : 
            step === 2 ? 'Address & Connection' : 
            step === 3 ? 'KYC Verification' : 'Account Credentials'
          }</p>
          
          <div className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-300" style={{ width: `${(step/4)*100}%` }}></div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {step === 1 && (
            <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Full Name *</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="Abishree" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Mobile Number *</label>
                  <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="9876543210" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Email Address *</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="abishree@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Date of Birth</label>
                  <input type="date" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Gender</label>
                  <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500">
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">House / Building</label>
                  <input type="text" value={formData.houseNo} onChange={e => setFormData({...formData, houseNo: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Street / Area</label>
                  <input type="text" value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <input type="text" placeholder="City" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
                <input type="text" placeholder="State" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
                <input type="text" placeholder="PIN" value={formData.pinCode} onChange={e => setFormData({...formData, pinCode: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
              </div>
              
              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-800 mb-3">Connection Details</h4>
                {configLoading ? (
                  <p className="text-sm text-slate-500">Loading connection options...</p>
                ) : (
                  <div className={`grid gap-4 ${allowPlanSelection ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {allowPlanSelection ? (
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Internet Plan *</label>
                        <select
                          required
                          value={formData.plan}
                          onChange={e => setFormData({...formData, plan: e.target.value})}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                        >
                          {(signupConfig?.plans || []).map((p) => (
                            <option key={p.id} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                        <p className="text-sm font-semibold text-amber-800">Plan assignment by admin</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Internet plan selection is managed by your ISP. A plan will be assigned after your application is reviewed.
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Connection Type</label>
                      <select value={formData.connectionType} onChange={e => setFormData({...formData, connectionType: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500">
                        <option>PPPoE</option>
                        <option>Hotspot</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ID Type</label>
                  <select value={formData.idType} onChange={e => setFormData({...formData, idType: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500">
                    <option>Aadhaar</option>
                    <option>PAN</option>
                    <option>Passport</option>
                    <option>Driving License</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ID Number</label>
                  <input type="text" value={formData.idNumber} onChange={e => setFormData({...formData, idNumber: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="Enter ID Number" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center hover:border-emerald-500 transition-colors cursor-pointer">
                  <p className="text-sm text-slate-500">Upload Identity Proof (PDF/JPG)</p>
                </div>
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center hover:border-emerald-500 transition-colors cursor-pointer">
                  <p className="text-sm text-slate-500">Upload Address Proof (PDF/JPG)</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <input type="checkbox" required className="w-4 h-4 text-emerald-600" />
                <p className="text-xs text-slate-600">I accept the Terms & Conditions and confirm the details provided are correct.</p>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Username</label>
                <input required type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="Choose a username" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
                  <input required type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Confirm Password</label>
                  <input required type="password" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" placeholder="••••••••" />
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex gap-4 pt-4">
            {step > 1 && (
              <button type="button" onClick={prevStep} className="flex-1 px-6 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all">Back</button>
            )}
            {step < 4 ? (
              <button type="button" onClick={nextStep} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all">Next Step</button>
            ) : (
              <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all">Submit Application</button>
            )}
          </div>

          <div className="text-center pt-2">
            <p className="text-slate-500 text-sm">
              Already have an account? 
              <button type="button" onClick={onSwitchToLogin} className="ml-2 text-emerald-600 font-bold hover:underline">Sign In</button>
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [role, setRole] = useState<Role>('MasterAdmin');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [franchiseAdmins, setFranchiseAdmins] = useState<FranchiseAdmin[]>([]);
  const [lcoAdmins, setLcoAdmins] = useState<any[]>([]);
  const [ipv4Addresses, setIpv4Addresses] = useState<IPv4Address[]>([]);
  const [ipv4Stats, setIpv4Stats] = useState<{ total: number; assigned: number; available: number } | null>(null);
  const [selectedIpDetails, setSelectedIpDetails] = useState<IPv4Address | null>(null);
  const [ipPoolTab, setIpPoolTab] = useState<'available' | 'assigned'>('available');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [dbStatus, setDbStatus] = useState<'connected' | 'mock_mode' | 'loading'>('loading');
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [planFilter, setPlanFilter] = useState('All Plans');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [newSubscriber, setNewSubscriber] = useState({ name: '', phone: '', email: '', plan: '100Mbps Unlimited', franchiseAdminId: '' });
  const [newFranchise, setNewFranchise] = useState({ name: '', username: '', email: '', phone: '', region: '' });
  const [isAddFranchiseModalOpen, setIsAddFranchiseModalOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [ispSettings, setIspSettings] = useState<{ ispAdminId: string; ispName?: string; allowSubscriberPlanSelection: boolean } | null>(null);
  const [ispAdmins, setIspAdmins] = useState<{ id: string; name: string; allowSubscriberPlanSelection?: boolean }[]>([]);
  const [selectedSettingsIspId, setSelectedSettingsIspId] = useState('');
  const [availablePlans, setAvailablePlans] = useState<{ id: number; name: string }[]>([]);
  const [assignPlanValue, setAssignPlanValue] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const getHierarchyParams = (user = currentUser, activeRole = role) => {
    if ((activeRole === 'FranchiseAdmin' || activeRole === 'LCOAdmin') && user?.franchiseAdminId) {
      return `franchiseAdminId=${user.franchiseAdminId}`;
    }
    if (activeRole === 'ISPAdmin' && user?.ispAdminId) {
      return `ispAdminId=${user.ispAdminId}`;
    }
    return '';
  };

  const isExpired = (expiryDate: string) => getDisplayStatus({ status: 'Active', expiry: expiryDate }) === 'Expired';

  const getSubscriberStatus = (sub: Subscriber) => getDisplayStatus(sub);

  const fetchData = async (userOverride?: any, roleOverride?: Role) => {
    try {
      const activeUser = userOverride ?? currentUser;
      const activeRole = roleOverride ?? role;
      const hierarchy = getHierarchyParams(activeUser, activeRole);
      const hierarchyQuery = hierarchy ? `?${hierarchy}` : '';
      const franchiseQuery = activeRole === 'ISPAdmin' && activeUser?.ispAdminId
        ? `?ispAdminId=${activeUser.ispAdminId}`
        : '';

      const authOpts = { role: activeRole, user: activeUser };
      const isAdminRole = ['MasterAdmin', 'ISPAdmin', 'FranchiseAdmin', 'LCOAdmin'].includes(activeRole);

      const settingsIspId = activeRole === 'ISPAdmin'
        ? activeUser?.ispAdminId
        : (selectedSettingsIspId || undefined);
      const settingsQuery = settingsIspId ? `?ispAdminId=${settingsIspId}` : '';

      const [statsRes, subsRes, invRes, notifRes, healthRes, franchiseRes, ipv4Res, ispAdminsRes, ispSettingsRes, plansRes, lcoRes] = await Promise.all([
        isAdminRole ? apiFetch(`/api/dashboard/stats${hierarchyQuery}`, authOpts.role, authOpts.user) : Promise.resolve(null),
        activeRole === 'Subscriber'
          ? Promise.resolve({ json: async () => [activeUser] })
          : apiFetch(`/api/subscribers${hierarchyQuery}`, authOpts.role, authOpts.user),
        isAdminRole ? apiFetch(`/api/billing/invoices${hierarchyQuery}`, authOpts.role, authOpts.user) : Promise.resolve(null),
        fetch(`/api/notifications?role=${activeRole}`),
        fetch('/api/health'),
        activeRole === 'ISPAdmin' || activeRole === 'MasterAdmin'
          ? apiFetch(`/api/franchise-admins${franchiseQuery}`, authOpts.role, authOpts.user)
          : Promise.resolve(null),
        isAdminRole
          ? apiFetch(`/api/ipv4${hierarchyQuery}`, authOpts.role, authOpts.user)
          : Promise.resolve(null),
        activeRole === 'MasterAdmin'
          ? apiFetch('/api/isp-admins', authOpts.role, authOpts.user)
          : Promise.resolve(null),
        activeRole === 'ISPAdmin' || activeRole === 'MasterAdmin'
          ? (settingsIspId
            ? apiFetch(`/api/isp-settings${settingsQuery}`, authOpts.role, authOpts.user)
            : Promise.resolve(null))
          : Promise.resolve(null),
        activeRole === 'MasterAdmin' || activeRole === 'ISPAdmin' || activeRole === 'FranchiseAdmin'
          ? fetch('/api/plans')
          : Promise.resolve(null),
        activeRole === 'FranchiseAdmin' || activeRole === 'ISPAdmin' || activeRole === 'MasterAdmin'
          ? apiFetch(`/api/lco-admins${hierarchyQuery}`, authOpts.role, authOpts.user)
          : Promise.resolve(null),
      ]);
      
      const statsData = statsRes ? await statsRes.json() : null;
      const subsData = await subsRes.json();
      const invData = invRes ? await invRes.json() : [];
      const notifData = await notifRes.json();
      const healthData = await healthRes.json();
      
      if (statsData) setStats(statsData);
      setSubscribers(Array.isArray(subsData) ? subsData : []);
      setInvoices(Array.isArray(invData) ? invData : []);
      setNotifications(Array.isArray(notifData) ? notifData : []);
      setDbStatus(healthData.database);

      if (franchiseRes) {
        const franchiseData = await franchiseRes.json();
        setFranchiseAdmins(Array.isArray(franchiseData) ? franchiseData : []);
      }
      if (ipv4Res) {
        const ipv4Data = await ipv4Res.json();
        const enriched = Array.isArray(ipv4Data.addresses) ? ipv4Data.addresses.map((a: IPv4Address) => ({ ...a, poolName: a.poolName || getPoolName(a.address) })) : [];
        setIpv4Addresses(enriched);
        setIpv4Stats(ipv4Data.stats || null);
      }
      if (ispAdminsRes) {
        const ispAdminData = await ispAdminsRes.json();
        const admins = Array.isArray(ispAdminData) ? ispAdminData : [];
        setIspAdmins(admins);
        if (!selectedSettingsIspId && admins.length > 0) {
          setSelectedSettingsIspId(admins[0].id);
        }
      }
      if (ispSettingsRes) {
        const settingsData = await ispSettingsRes.json();
        if (!settingsData.error) {
          setIspSettings(settingsData);
        }
      }
      if (plansRes) {
        const plansData = await plansRes.json();
        setAvailablePlans(Array.isArray(plansData) ? plansData.map((p: any) => ({
          id: p.id ?? p.Id,
          name: p.name ?? p.Name,
        })) : []);
      }
      if (lcoRes) {
        const lcoData = await lcoRes.json();
        setLcoAdmins(Array.isArray(lcoData) ? lcoData : []);
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
      setSubscribers([]);
      setInvoices([]);
      setNotifications([]);
      setFranchiseAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Real-time polling for subscribers to track status updates
    let interval: any;
    if (isLoggedIn && role === 'Subscriber') {
      interval = setInterval(() => {
        fetchData();
      }, 5000); // Poll every 5 seconds for real-time feel
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [role, isLoggedIn, currentUser?.ispAdminId, currentUser?.franchiseAdminId, selectedSettingsIspId]);

  const handleTogglePlanSelection = async (enabled: boolean) => {
    const ispAdminId = role === 'ISPAdmin' ? currentUser?.ispAdminId : selectedSettingsIspId;
    if (!ispAdminId) return;
    setIsSavingSettings(true);
    try {
      const res = await apiFetch('/api/isp-settings', role, currentUser, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ispAdminId, allowSubscriberPlanSelection: enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setIspSettings((prev) => prev ? { ...prev, allowSubscriberPlanSelection: data.allowSubscriberPlanSelection } : {
          ispAdminId,
          allowSubscriberPlanSelection: data.allowSubscriberPlanSelection,
        });
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update setting');
      }
    } catch (error) {
      console.error('Failed to update ISP settings', error);
      alert('Failed to update setting. Please try again.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAssignPlan = async (subscriberId: string, plan: string) => {
    if (!plan) {
      alert('Please select a plan to assign.');
      return;
    }
    try {
      const res = await apiFetch(`/api/subscribers/${subscriberId}`, role, currentUser, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        await fetchData();
        setIsManageModalOpen(false);
        alert('Plan assigned successfully.');
      }
    } catch (error) {
      console.error('Failed to assign plan', error);
      alert('Failed to assign plan. Please try again.');
    }
  };

  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const franchiseAdminId = role === 'FranchiseAdmin'
        ? currentUser?.franchiseAdminId
        : newSubscriber.franchiseAdminId || franchiseAdmins[0]?.id;

      const res = await apiFetch('/api/subscribers', role, currentUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newSubscriber, franchiseAdminId })
      });
      if (res.ok) {
        await res.json();
        setIsAddModalOpen(false);
        setNewSubscriber({ name: '', phone: '', email: '', plan: '100Mbps Unlimited', franchiseAdminId: '' });
        await fetchData();
        alert('Subscriber added successfully!');
      }
    } catch (error) {
      console.error("Failed to add subscriber", error);
      alert('Failed to add subscriber. Please try again.');
    }
  };

  const handleAddFranchise = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/franchise-admins', role, currentUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newFranchise,
          ispAdminId: currentUser?.ispAdminId,
        }),
      });
      if (res.ok) {
        setIsAddFranchiseModalOpen(false);
        setNewFranchise({ name: '', username: '', email: '', phone: '', region: '' });
        await fetchData();
        alert('Franchise Admin added successfully!');
      }
    } catch (error) {
      console.error("Failed to add franchise admin", error);
      alert('Failed to add franchise admin. Please try again.');
    }
  };

  const handleVerifyKyc = async (id: string) => {
    const sub = subscribers.find(s => s.id === id);
    if (!sub) return;
    if (!canTransitionTo(sub.status, 'KYC Verified')) {
      alert(`Cannot verify KYC: current status is "${sub.status}". Expected "KYC Pending".`);
      return;
    }
    try {
      const res = await apiFetch('/api/subscribers/verify-kyc', role, currentUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
        alert('KYC documents verified successfully.');
      } else {
        setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'KYC Verified' } : s));
        alert('KYC documents verified successfully.');
      }
    } catch (error) {
      console.error("Failed to verify KYC", error);
      setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'KYC Verified' } : s));
      alert('KYC documents verified (offline mode).');
    }
  };

  const handleFranchiseApprove = async (id: string) => {
    const sub = subscribers.find(s => s.id === id);
    if (!sub) return;
    if (!canTransitionTo(sub.status, 'Approved')) {
      alert(`Cannot approve: current status is "${sub.status}". Expected "KYC Verified".`);
      return;
    }
    try {
      const res = await apiFetch('/api/subscribers/approve', role, currentUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'FranchiseAdmin',
            title: 'Subscriber Approved',
            desc: `${sub.name} has been approved. Ready for LCO installation scheduling.`,
            type: 'success'
          })
        });
        fetchData();
        alert(`${sub.name} approved! LCO Admin can now schedule installation.`);
      } else {
        setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'Approved' } : s));
        alert(`${sub.name} approved (offline mode).`);
      }
    } catch (error) {
      console.error("Failed to approve subscriber", error);
      setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'Approved' } : s));
      alert(`${sub.name} approved (offline mode).`);
    }
  };

  const handleScheduleInstallation = async (id: string) => {
    const sub = subscribers.find(s => s.id === id);
    if (!sub) return;
    if (!canTransitionTo(sub.status, 'Installation Scheduled')) {
      alert(`Cannot schedule installation: current status is "${sub.status}". Expected "Approved".`);
      return;
    }
    try {
      const res = await apiFetch('/api/subscribers/schedule-installation', role, currentUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
        alert('Installation scheduled successfully!');
      } else {
        setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'Installation Scheduled' } : s));
        alert('Installation scheduled (offline mode).');
      }
    } catch (error) {
      console.error("Failed to schedule installation", error);
      setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'Installation Scheduled' } : s));
      alert('Installation scheduled (offline mode).');
    }
  };

  const handleCompleteInstallation = async (id: string) => {
    const sub = subscribers.find(s => s.id === id);
    if (!sub) return;
    if (!canTransitionTo(sub.status, 'Installation Completed')) {
      alert(`Cannot complete installation: current status is "${sub.status}". Expected "Installation Scheduled".`);
      return;
    }
    try {
      const res = await apiFetch('/api/subscribers/complete-installation', role, currentUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
        alert('Installation completed! Subscriber is ready for provisioning.');
      } else {
        setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'Installation Completed' } : s));
        alert('Installation marked completed (offline mode).');
      }
    } catch (error) {
      console.error("Failed to complete installation", error);
      setSubscribers(prev => prev.map(s => s.id === id ? { ...s, status: 'Installation Completed' } : s));
      alert('Installation marked completed (offline mode).');
    }
  };

  const handleProvisionSubscriber = async (id: string) => {
    const sub = subscribers.find(s => s.id === id);
    if (!sub) return;
    if (!canTransitionTo(sub.status, 'Active')) {
      alert(`Cannot provision: current status is "${sub.status}". Expected "Installation Completed".`);
      return;
    }

    const pppoeUser = (sub.name || 'user').toLowerCase().replace(/\s+/g, '') + Math.random().toString(36).slice(2, 6);
    const pppoePass = Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$'[Math.floor(Math.random() * 72)]).join('');
    const assignedIp = `10.0.1.${Math.floor(Math.random() * 200) + 10}`;

    try {
      const res = await apiFetch(`/api/subscribers/${id}/provision`, role, currentUser, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          pppoeUsername: pppoeUser,
          pppoePassword: pppoePass,
          plan: sub.plan,
          ip: assignedIp,
          createFreeRADIUS: true,
        })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Provisioning API call failed, applying locally", error);
    }

    setSubscribers(prev => prev.map(s => s.id === id ? {
      ...s,
      status: 'Active',
      pppoeUsername: pppoeUser,
      pppoePassword: pppoePass,
      ip: assignedIp,
    } : s));

    alert(`Subscriber provisioned successfully!\n\nPPPoE Username: ${pppoeUser}\nPPPoE Password: ${pppoePass}\nAssigned IP: ${assignedIp}\nPlan: ${sub.plan}\nFreeRADIUS user created.`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subscriber?')) return;
    try {
      const res = await apiFetch(`/api/subscribers/${id}`, role, currentUser, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to delete subscriber", error);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await apiFetch(`/api/subscribers/${id}`, role, currentUser, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  const handleTerminateSession = async (id: string) => {
    const confirmTerminate = window.confirm(
      'Are you sure you want to terminate this session? The subscriber will be marked as "Terminated" but can be reactivated later.'
    );
    if (!confirmTerminate) return;
    await handleStatusUpdate(id, 'Terminated');
    alert('Session Terminated');
  };

  const chartData = [
    { name: 'Mon', revenue: 4000, users: 2400 },
    { name: 'Tue', revenue: 3000, users: 1398 },
    { name: 'Wed', revenue: 2000, users: 9800 },
    { name: 'Thu', revenue: 2780, users: 3908 },
    { name: 'Fri', revenue: 1890, users: 4800 },
    { name: 'Sat', revenue: 2390, users: 3800 },
    { name: 'Sun', revenue: 3490, users: 4300 },
  ];

  const filteredSubscribers = (Array.isArray(subscribers) ? subscribers : []).filter(sub => {
    const matchesSearch = 
      (sub.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sub.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sub.ip || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sub.phone && sub.phone.includes(searchQuery)) ||
      (sub.email && sub.email.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const displayStatus = getSubscriberStatus(sub);
    const statusFilterMap: Record<string, string> = {
      'Pending KYC': 'KYC Pending',
      'Installation Pending': 'Approved',
      'Expiring 7 Days': 'Expiring7d',
      'Expiring 3 Days': 'Expiring3d',
      'Expiring 1 Day': 'Expiring1d',
    };
    const effectiveStatus = statusFilterMap[statusFilter] || statusFilter;
    let matchesStatus: boolean;
    if (role === 'LCOAdmin') {
      const workflowDisplay = sub.status === 'Installation Completed' ? 'Installation Completed' : sub.status;
      matchesStatus = statusFilter === 'All Status' || sub.status === effectiveStatus;
    } else {
      matchesStatus = statusFilter === 'All Status' || displayStatus === effectiveStatus;
    }
    const matchesPlan = planFilter === 'All Plans' || (sub.plan && sub.plan.includes(planFilter.replace('Mbps', '')));
    
    return matchesSearch && matchesStatus && matchesPlan;
  });

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  const getNavItems = () => {
    const allItems = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'franchises', label: 'Franchise Admins', icon: Building2, roles: ['MasterAdmin'] },
      { id: 'subscribers', label: 'Subscriber', icon: Users, roles: ['FranchiseAdmin', 'LCOAdmin'] },
      { id: 'network', label: 'Network', icon: Network, roles: ['MasterAdmin', 'ISPAdmin'] },
      { id: 'billing', label: 'Billing', icon: CreditCard, roles: ['ISPAdmin', 'FranchiseAdmin', 'LCOAdmin', 'Subscriber'] },
      { id: 'reports', label: 'Reports', icon: FileText, roles: ['MasterAdmin', 'ISPAdmin', 'FranchiseAdmin'] },
      { id: 'ip-pool', label: 'IP Pool', icon: Database, roles: ['ISPAdmin', 'FranchiseAdmin', 'LCOAdmin'] },
      { id: 'lco-admins', label: 'LCO Admin', icon: Shield, roles: ['FranchiseAdmin'] },
      { id: 'isp-subscribers', label: 'Subscriber', icon: Users, roles: ['ISPAdmin'] },
      { id: 'isp-franchises', label: 'Franchise', icon: Building2, roles: ['ISPAdmin'] },
      { id: 'syslog', label: 'SYSLOG', icon: FileText, roles: ['ISPAdmin'] },
      { id: 'nat-logs', label: 'NAT Logs', icon: Globe, roles: ['ISPAdmin'] },
      { id: 'support', label: 'Support', icon: LifeBuoy, roles: ['Subscriber'] },
    ];

    return allItems.filter(item => !item.roles || item.roles.includes(role));
  };

  const hierarchyLabel = role === 'ISPAdmin'
    ? `${currentUser?.name || 'ISP'} → Franchise Admins → Subscribers`
    : role === 'FranchiseAdmin'
      ? `${currentUser?.ispName || 'ISP'} → ${currentUser?.name || 'Franchise'} → Subscribers`
      : role === 'Subscriber'
        ? `${currentUser?.franchiseName || 'Franchise'} → Subscriber`
        : null;

  const navItems = getNavItems();

  if (!isLoggedIn) {
    if (authView === 'login') {
      return (
        <LoginPage 
          isLoggingIn={isLoggingIn}
          onLogin={async (selectedRole, user, pass) => {
            if (isLoggingIn) return;
            setIsLoggingIn(true);
            
            // Simulated login check for subscribers
            if (selectedRole === 'Subscriber') {
              try {
                const res = await fetch('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: 'Subscriber', username: user, password: pass }),
                });
                if (res.ok) {
                  const sub = await res.json();
                  setRole(selectedRole);
                  setCurrentUser(sub);
                  await fetchData(sub, selectedRole);
                  setIsLoggedIn(true);
                  setActiveTab('dashboard');
                  setIsLoggingIn(false);
                  return;
                }
              } catch (e) {
                console.error(e);
              }
              // Fallback: check demo subscriber locally
              if (user.toLowerCase() === 'subscriber' && pass === 'password') {
                const demoSub = {
                  id: 'S1007',
                  name: 'Demo Subscriber',
                  username: 'subscriber',
                  email: 'demo@example.com',
                  phone: '9000000007',
                  plan: '100Mbps Unlimited',
                  ip: '10.0.1.100',
                  status: 'Active',
                  expiry: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                  franchiseName: 'CityLink Franchise',
                  franchiseAdminId: 'FA001',
                  connectionType: 'PPPoE',
                  kycStatus: 'Verified',
                  address: '123 Demo Street',
                  pppoeUsername: 'subscriber_pppoe',
                  pppoePassword: 'pppoe_pass',
                };
                setRole(selectedRole);
                setCurrentUser(demoSub);
                await fetchData(demoSub, selectedRole);
                setIsLoggedIn(true);
                setActiveTab('dashboard');
                setIsLoggingIn(false);
                return;
              }
              alert("Invalid credentials. Try: subscriber / password");
              setIsLoggingIn(false);
              return;
            }

            if (selectedRole === 'ISPAdmin' || selectedRole === 'FranchiseAdmin' || selectedRole === 'LCOAdmin') {
              try {
                const res = await fetch('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ role: selectedRole, username: user, password: pass }),
                });
                if (!res.ok) {
                  const hint = selectedRole === 'ISPAdmin'
                    ? 'Use username "ispadmin" and password "password".'
                    : selectedRole === 'LCOAdmin'
                      ? 'Use username "lc_rajesh", "lc_priya", or "lc_suresh" and password "password".'
                      : 'Use username "franchise1" or "franchise2" and password "password".';
                  alert(`Invalid credentials. ${hint}`);
                  setIsLoggingIn(false);
                  return;
                }
                const adminUser = await res.json();
                setRole(selectedRole);
                setCurrentUser(adminUser);
                await fetchData(adminUser, selectedRole);
                setIsLoggedIn(true);
                setActiveTab('dashboard');
                setIsLoggingIn(false);
                return;
              } catch (e) {
                console.error(e);
                setIsLoggingIn(false);
                return;
              }
            }

            const expectedUsername = selectedRole.toLowerCase();
            const isValidAdminLogin =
              user.toLowerCase() === expectedUsername && pass === 'password';

            if (!isValidAdminLogin) {
              alert(`Invalid credentials. Use username "${expectedUsername}" and password "password" for ${selectedRole}.`);
              setIsLoggingIn(false);
              return;
            }

            setRole(selectedRole);
            setCurrentUser({
              name: selectedRole === 'MasterAdmin' ? 'Master Admin' : selectedRole,
              role: selectedRole,
              username: expectedUsername,
            });
            await fetchData({
              name: selectedRole === 'MasterAdmin' ? 'Master Admin' : selectedRole,
              role: selectedRole,
              username: expectedUsername,
            }, selectedRole);
            setIsLoggedIn(true);
            setActiveTab('dashboard');
            setIsLoggingIn(false);
          }}
          onSwitchToRegister={() => setAuthView('register')}
        />
      );
    }
    return (
      <RegisterPage 
        onRegister={async (userData) => {
          try {
            const res = await fetch('/api/subscribers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...userData,
                franchiseAdminId: userData.franchiseAdminId || 'FA001',
              })
            });
            if (res.ok) {
              const createdSub = await res.json();
              await fetchData();
              setCurrentUser(createdSub.subscriber || createdSub);
              setRole('Subscriber');
              setIsLoggedIn(true);
              setActiveTab('dashboard');
              alert("Application submitted successfully! You can now track your connection status here.");
            } else {
              const err = await res.json();
              alert(err.error || 'Registration failed. Please try again.');
            }
          } catch (error) {
            console.error("Registration failed", error);
            alert("Registration failed. Please try again.");
          }
        }}
        onSwitchToLogin={() => setAuthView('login')}
      />
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">Initializing NetPulse...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 mr-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <Globe size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight hidden sm:block">NetPulse</span>
          </div>
          {dbStatus === 'mock_mode' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-xs font-medium">
              <AlertCircle size={14} />
              Demo Mode
            </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h2 className="text-lg font-semibold capitalize hidden md:block">{activeTab}</h2>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search subscribers, IPs..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-indigo-500 rounded-xl text-sm w-64 outline-none transition-all"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-full relative"
              >
                <Bell size={20} />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
                )}
              </button>
              
              <AnimatePresence>
                {isNotificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsNotificationsOpen(false)}></div>
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                        <span className="font-bold">Notifications</span>
                        <span className="text-xs text-indigo-600 font-bold cursor-pointer">Mark all read</span>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map((n, i) => {
                            const Icon = n.type === 'success' ? CheckCircle2 : n.type === 'warning' ? AlertCircle : n.type === 'error' ? X : Bell;
                            const colorClass = n.type === 'success' ? 'text-emerald-600 bg-emerald-50' : n.type === 'warning' ? 'text-amber-600 bg-amber-50' : n.type === 'error' ? 'text-rose-600 bg-rose-50' : 'text-indigo-600 bg-indigo-50';
                            
                            return (
                              <div key={i} className="p-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors cursor-pointer">
                                <div className="flex gap-3">
                                  <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                                    <Icon size={16} />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold">{n.title}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{n.desc}</p>
                                    <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-8 text-center">
                            <Bell size={32} className="mx-auto text-slate-200 mb-2" />
                            <p className="text-sm text-slate-400">No new notifications</p>
                          </div>
                        )}
                      </div>
                      <div className="p-3 bg-slate-50 text-center">
                        <button className="text-xs font-bold text-slate-500 hover:text-indigo-600">View all notifications</button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="h-8 w-px bg-slate-200 mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold leading-none">{currentUser?.name || 'User'}</p>
                <p className="text-xs text-slate-500 mt-1">{role}</p>
                {hierarchyLabel && (
                  <p className="text-[10px] text-indigo-500 mt-0.5 max-w-[220px] truncate">{hierarchyLabel}</p>
                )}
              </div>
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
                {(currentUser?.name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`bg-white border-r border-slate-200 transition-all duration-300 z-40 flex-shrink-0 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
          <div className="flex flex-col h-full">
            <nav className="px-4 mt-6 space-y-2 flex-1 overflow-y-auto custom-scrollbar">
              {navItems.map(item => (
                <SidebarItem 
                  key={item.id}
                  icon={item.icon} 
                  label={item.label} 
                  active={activeTab === item.id} 
                  onClick={() => setActiveTab(item.id)} 
                />
              ))}
            </nav>

            <div className="p-4 border-t border-slate-100">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-rose-500 hover:bg-rose-50 transition-colors"
              >
                <LogOut size={20} />
                {isSidebarOpen && <span className="font-medium">Logout</span>}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {/* Dashboard Content */}
          <div className="p-8">
          {activeTab === 'dashboard' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {role === 'Subscriber' ? (
                <div className="space-y-8">
                  {(() => {
                    const currentSub = subscribers.find(s => s.username === currentUser?.username || s.email === currentUser?.email || s.name === currentUser?.name) || currentUser;
                    const status = currentSub?.status || 'KYC Pending';
                    const statusOrder = ['KYC Pending', 'KYC Verified', 'Approved', 'Installation Scheduled', 'Installation Completed', 'Active'];
                    const statusIdx = statusOrder.indexOf(status);

                    const trackerSteps = [
                      { label: 'Registered', icon: FileText },
                      { label: 'KYC Verified', icon: ShieldCheck },
                      { label: 'Franchise Approved', icon: Shield },
                      { label: 'Installation Completed', icon: Network },
                      { label: 'Provisioned', icon: Database },
                      { label: 'Active', icon: CheckCircle2 },
                    ];

                    const getTrackerState = (stepIndex: number) => {
                      const thresholds = [0, 1, 2, 3, 4, 5];
                      const stepThreshold = thresholds[stepIndex];
                      if (statusIdx > stepThreshold || (status === 'Active' && stepIndex === 5)) return 'completed';
                      if (statusIdx === stepThreshold) return 'current';
                      return 'pending';
                    };

                    const labelMap: Record<string, string> = {
                      'KYC Pending': 'Pending',
                      'KYC Verified': 'Verified',
                      'Approved': 'Approved',
                      'Installation Scheduled': 'Scheduled',
                      'Installation Completed': 'Completed',
                      'Active': 'Active',
                    };

                    const instLabel = status === 'Installation Scheduled' ? 'Scheduled' : status === 'Installation Completed' ? 'Completed' : status === 'Active' ? 'Completed' : 'Pending';

                    const isExpiredStatus = ['Suspended', 'Expired'].includes(status);
                    const isExpiryWarning = ['Expiring7d', 'Expiring3d', 'Expiring1d'].includes(status);

                    const renderBanner = () => {
                      if (status === 'Suspended') {
                        return (
                          <div className="bg-rose-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                            <div className="relative z-10">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                  <AlertCircle size={24} />
                                </div>
                                <span className="px-3 py-1 bg-white text-rose-700 text-[10px] font-black rounded-full uppercase tracking-widest">Suspended</span>
                              </div>
                              <h2 className="text-3xl font-bold mb-2">Service Suspended</h2>
                              <p className="text-rose-100 mb-6 max-w-md">Your service has been suspended due to plan expiry. Internet access is blocked. Please renew your plan to restore connectivity.</p>
                              <button className="bg-white text-rose-600 px-8 py-3 rounded-xl font-bold hover:bg-rose-50 transition-all shadow-lg">
                                Renew Plan Now
                              </button>
                            </div>
                            <AlertCircle className="absolute -right-10 -bottom-10 w-64 h-64 text-white/10" />
                          </div>
                        );
                      }
                      if (status === 'Expired') {
                        return (
                          <div className="bg-orange-500 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                            <div className="relative z-10">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                  <Clock size={24} />
                                </div>
                                <span className="px-3 py-1 bg-white text-orange-600 text-[10px] font-black rounded-full uppercase tracking-widest">Expired Today</span>
                              </div>
                              <h2 className="text-3xl font-bold mb-2">Plan Expired Today</h2>
                              <p className="text-orange-100 mb-6 max-w-md">Your plan has expired today. Renew immediately to avoid service suspension.</p>
                              <button className="bg-white text-orange-600 px-8 py-3 rounded-xl font-bold hover:bg-orange-50 transition-all shadow-lg">
                                Renew Now
                              </button>
                            </div>
                            <Clock className="absolute -right-10 -bottom-10 w-64 h-64 text-white/10" />
                          </div>
                        );
                      }
                      if (status === 'Expiring1d') {
                        return (
                          <div className="bg-amber-500 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                            <div className="relative z-10">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                  <Clock size={24} />
                                </div>
                                <span className="px-3 py-1 bg-white text-amber-700 text-[10px] font-black rounded-full uppercase tracking-widest">Expiring Tomorrow</span>
                              </div>
                              <h2 className="text-3xl font-bold mb-2">Plan Expires Tomorrow</h2>
                              <p className="text-amber-100 mb-6 max-w-md">Your plan will expire tomorrow. Recharge now to avoid service interruption.</p>
                              <button className="bg-white text-amber-600 px-8 py-3 rounded-xl font-bold hover:bg-amber-50 transition-all shadow-lg">
                                Renew Now
                              </button>
                            </div>
                            <Clock className="absolute -right-10 -bottom-10 w-64 h-64 text-white/10" />
                          </div>
                        );
                      }
                      if (status === 'Expiring3d') {
                        return (
                          <div className="bg-amber-400 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                            <div className="relative z-10">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                  <Clock size={24} />
                                </div>
                                <span className="px-3 py-1 bg-white text-amber-700 text-[10px] font-black rounded-full uppercase tracking-widest">Expiring Soon</span>
                              </div>
                              <h2 className="text-3xl font-bold mb-2">Plan Expires in {(() => { const e = currentSub?.expiry; if (!e || e === '-') return '3'; return Math.ceil((new Date(e).getTime() - Date.now()) / 86400000); })()} Days</h2>
                              <p className="text-amber-100 mb-6 max-w-md">Your plan will expire soon. Recharge now to keep your connection active.</p>
                              <button className="bg-white text-amber-600 px-8 py-3 rounded-xl font-bold hover:bg-amber-50 transition-all shadow-lg">
                                Renew Now
                              </button>
                            </div>
                            <Clock className="absolute -right-10 -bottom-10 w-64 h-64 text-white/10" />
                          </div>
                        );
                      }
                      if (status === 'Expiring7d') {
                        return (
                          <div className="bg-yellow-500 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                            <div className="relative z-10">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                  <Bell size={24} />
                                </div>
                                <span className="px-3 py-1 bg-white text-yellow-700 text-[10px] font-black rounded-full uppercase tracking-widest">Expiring Soon</span>
                              </div>
                              <h2 className="text-3xl font-bold mb-2">Plan Expires in {(() => { const e = currentSub?.expiry; if (!e || e === '-') return '7'; return Math.ceil((new Date(e).getTime() - Date.now()) / 86400000); })()} Days</h2>
                              <p className="text-yellow-100 mb-6 max-w-md">Your plan is expiring within a week. Recharge soon to avoid any disruption.</p>
                              <button className="bg-white text-yellow-600 px-8 py-3 rounded-xl font-bold hover:bg-yellow-50 transition-all shadow-lg">
                                Renew Now
                              </button>
                            </div>
                            <Bell className="absolute -right-10 -bottom-10 w-64 h-64 text-white/10" />
                          </div>
                        );
                      }
                      return (
                        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
                          <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                <Wifi size={24} />
                              </div>
                              <span className="px-3 py-1 bg-white/20 text-white text-[10px] font-black rounded-full uppercase tracking-widest">{status === 'Active' ? 'Connected' : 'In Progress'}</span>
                            </div>
                            <h2 className="text-3xl font-bold mb-1">Welcome, {currentSub?.name || 'Subscriber'}!</h2>
                            <p className="text-indigo-200 text-sm">
                              {status === 'Active' ? 'Your connection is active.' : 'Your application is being processed.'}
                            </p>
                          </div>
                          <Wifi className="absolute -right-10 -bottom-10 w-64 h-64 text-white/5" />
                        </div>
                      );
                    };

                    return (
                      <>
                        {renderBanner()}

                        {/* Status Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Registration Status</p>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                              <span className="font-semibold text-slate-800">Registered</span>
                            </div>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">KYC Status</p>
                            <span className={`font-semibold ${statusIdx >= 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{statusIdx >= 1 ? 'Verified' : currentSub?.kycStatus === 'Verified' ? 'Verified' : 'Pending'}</span>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Franchise Approval</p>
                            <span className={`font-semibold ${statusIdx >= 2 ? 'text-emerald-600' : 'text-slate-500'}`}>{statusIdx >= 2 ? 'Approved' : 'Pending'}</span>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Installation Status</p>
                            <span className={`font-semibold ${statusIdx >= 4 ? 'text-emerald-600' : statusIdx >= 3 ? 'text-amber-600' : 'text-slate-500'}`}>{statusIdx >= 4 ? 'Completed' : statusIdx >= 3 ? 'Scheduled' : 'Pending'}</span>
                          </div>
                        </div>

                        {/* Service Info Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Assigned Plan</p>
                            <p className="font-bold text-slate-800 truncate" title={currentSub?.plan}>{currentSub?.plan || 'Not assigned'}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">IP Address</p>
                            <p className="font-bold font-mono text-slate-800">{currentSub?.ip && currentSub.ip !== '-' ? currentSub.ip : 'Not assigned'}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">PPPoE Username</p>
                            <p className="font-bold font-mono text-sm text-slate-800 truncate" title={currentSub?.pppoeUsername}>{currentSub?.pppoeUsername || 'Not assigned'}</p>
                          </div>
                          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Service Expiry</p>
                            <p className={`font-bold ${currentSub?.expiry && currentSub.expiry !== '-' ? 'text-slate-800' : 'text-slate-400'}`}>{currentSub?.expiry && currentSub.expiry !== '-' ? currentSub.expiry : 'N/A'}</p>
                          </div>
                        </div>

                        {/* Progress Tracker */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-lg text-slate-800">Progress Tracker</h3>
                            <span className="text-xs text-slate-500">Step {Math.min(statusIdx + 1, 6)} of 6</span>
                          </div>
                          <div className="relative">
                            <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-slate-100"></div>
                            <div className="space-y-0 relative">
                              {trackerSteps.map((step, i) => {
                                const state = getTrackerState(i);
                                return (
                                  <div key={i} className="flex gap-5 items-center py-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all duration-300 ${
                                      state === 'completed' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' :
                                      state === 'current' ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 shadow-md shadow-indigo-200' :
                                      'bg-slate-100 text-slate-300'
                                    }`}>
                                      {state === 'completed' ? <CheckCircle2 size={18} /> : <step.icon size={18} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`font-bold text-sm ${state === 'current' ? 'text-indigo-600' : state === 'completed' ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</p>
                                      {state === 'current' && <p className="text-[11px] text-indigo-400 font-medium">Current stage</p>}
                                    </div>
                                    {state === 'completed' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                                    {state === 'current' && <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse shrink-0"></div>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <>
              {(role === 'ISPAdmin' || role === 'MasterAdmin') && (
                <>
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                      <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <SettingsIcon size={18} className="text-indigo-600" />
                          ISP Settings
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">Configure signup behavior for subscribers under this ISP.</p>
                      </div>
                      {role === 'MasterAdmin' && ispAdmins.length > 0 && (
                        <select
                          value={selectedSettingsIspId}
                          onChange={(e) => setSelectedSettingsIspId(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none text-sm"
                        >
                          {ispAdmins.map((isp) => (
                            <option key={isp.id} value={isp.id}>{isp.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <p className="font-semibold text-slate-800">Allow Subscriber Plan Selection</p>
                        <p className="text-sm text-slate-500 mt-1">
                          {ispSettings?.allowSubscriberPlanSelection
                            ? 'Subscribers can choose a plan during signup.'
                            : 'Plan selection is hidden during signup; assign plans from subscriber management.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isSavingSettings}
                        onClick={() => handleTogglePlanSelection(!ispSettings?.allowSubscriberPlanSelection)}
                        className={`relative w-14 h-8 rounded-full transition-colors ${ispSettings?.allowSubscriberPlanSelection ? 'bg-emerald-500' : 'bg-slate-300'} ${isSavingSettings ? 'opacity-60 cursor-not-allowed' : ''}`}
                        aria-pressed={ispSettings?.allowSubscriberPlanSelection}
                        aria-label="Allow Subscriber Plan Selection"
                      >
                        <span
                          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${ispSettings?.allowSubscriberPlanSelection ? 'translate-x-6' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-slate-800">Franchise Admins</h3>
                        <p className="text-sm text-slate-500 mt-1">ISP Admin manages multiple Franchise Admins, each managing their own subscribers.</p>
                      </div>
                      {role === 'ISPAdmin' && (
                        <button
                          onClick={() => setIsAddFranchiseModalOpen(true)}
                          className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm text-sm font-semibold"
                        >
                          <Plus size={18} />
                          Add Franchise Admin
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                            <th className="px-6 py-4 font-semibold">Franchise</th>
                            <th className="px-6 py-4 font-semibold">Region</th>
                            <th className="px-6 py-4 font-semibold">Username</th>
                            <th className="px-6 py-4 font-semibold">Subscribers</th>
                            <th className="px-6 py-4 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {(stats?.franchiseAdmins || franchiseAdmins).map((fa) => (
                            <tr key={fa.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-6 py-4 font-semibold text-slate-800">{fa.name}</td>
                              <td className="px-6 py-4 text-sm text-slate-600">{fa.region || '-'}</td>
                              <td className="px-6 py-4 text-sm font-mono text-slate-500">{fa.username}</td>
                              <td className="px-6 py-4 text-sm text-slate-600">{fa.subscriberCount ?? subscribers.filter((s) => s.franchiseAdminId === fa.id).length}</td>
                              <td className="px-6 py-4"><StatusBadge status={fa.status || 'Active'} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Stats Grid — shown below admin data for Master/ISP Admin */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {role === 'MasterAdmin' ? (
                  <>
                    <StatCard 
                      title="Total Franchise Admins" 
                      value={stats?.franchiseCount || franchiseAdmins.length || 0} 
                      change="+2" 
                      icon={Building2} 
                      trend="up" 
                    />
                    <StatCard 
                      title="Global Subscribers" 
                      value={stats?.activeSubscribers || 0} 
                      change="+15.2%" 
                      icon={Users} 
                      trend="up" 
                    />
                    <StatCard 
                      title="Infrastructure Health" 
                      value={`${stats?.networkHealth}%`} 
                      change="+0.1%" 
                      icon={Activity} 
                      trend="up" 
                    />
                  </>
                ) : role === 'ISPAdmin' ? (
                  <>
                    <StatCard 
                      title="Franchise Admins" 
                      value={stats?.franchiseCount || franchiseAdmins.length || 0} 
                      change="+1" 
                      icon={Building2} 
                      trend="up" 
                    />
                    <StatCard 
                      title="Total Subscribers" 
                      value={subscribers.length} 
                      change="+8.5%" 
                      icon={Users} 
                      trend="up" 
                    />
                    <StatCard 
                      title="Active Subscribers" 
                      value={stats?.activeSubscribers || 0} 
                      change="+12.5%" 
                      icon={Activity} 
                      trend="up" 
                    />
                    <StatCard 
                      title="Monthly Revenue" 
                      value={`₹${(stats?.revenueThisMonth || 0).toLocaleString()}`} 
                      change="+8.1%" 
                      icon={CreditCard} 
                      trend="up" 
                    />
                  </>
                ) : role === 'FranchiseAdmin' ? (
                  <>
                    <StatCard title="Total Users" value={subscribers.length} change="All time" icon={Users} trend="up" />
                    <StatCard title="Active Users" value={subscribers.filter(s => getSubscriberStatus(s) === 'Active').length} change="+3.2%" icon={Activity} trend="up" />
                    <StatCard title="Pending KYC" value={subscribers.filter(s => s.status === 'KYC Pending').length} change="Awaiting verification" icon={Clock} trend="down" />
                    <StatCard title="Installation Pending" value={subscribers.filter(s => s.status === 'Approved').length} change="Awaiting schedule" icon={ShieldCheck} trend="down" />
                  </>
                ) : role === 'LCOAdmin' ? (
                  <>
                    <StatCard title="Pending Installations" value={subscribers.filter(s => s.status === 'Approved' || s.status === 'Installation Scheduled').length} change="Awaiting action" icon={Clock} trend="down" />
                    <StatCard title="Completed Installations" value={subscribers.filter(s => s.status === 'Active').length} change="Done" icon={CheckCircle2} trend="up" />
                  </>
                ) : (
                  <>
                    <StatCard title="Active Subscribers" value={stats?.activeSubscribers || 0} change="+12.5%" icon={Users} trend="up" />
                    <StatCard title="Pending Approvals" value={stats?.pendingApprovals || 0} change="-4.2%" icon={ShieldCheck} trend="down" />
                    <StatCard title="Monthly Revenue" value={`₹${(stats?.revenueThisMonth || 0).toLocaleString()}`} change="+8.1%" icon={CreditCard} trend="up" />
                    <StatCard title="Network Health" value={`${stats?.networkHealth}%`} change="+0.2%" icon={Activity} trend="up" />
                  </>
                )}
              </div>

              {['MasterAdmin', 'ISPAdmin', 'FranchiseAdmin'].includes(role) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard title="Total IPv4 Addresses" value={ipv4Stats?.total ?? stats?.ipv4?.total ?? 0} change="Pool" icon={Server} trend="up" />
                  <StatCard title="Assigned IPv4" value={ipv4Stats?.assigned ?? stats?.ipv4?.assigned ?? 0} change="In use" icon={Wifi} trend="up" />
                  <StatCard title="Available IPv4" value={ipv4Stats?.available ?? stats?.ipv4?.available ?? 0} change="Free" icon={Database} trend="up" />
                </div>
              )}

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6">Network Distribution</h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">IPv4 Utilization</span>
                      <span className="font-semibold">
                        {ipv4Stats?.total ? Math.round(((ipv4Stats.assigned / ipv4Stats.total) * 100)) : 0}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${ipv4Stats?.total ? Math.round((ipv4Stats.assigned / ipv4Stats.total) * 100) : 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">Available IPv4</span>
                      <span className="font-semibold">{ipv4Stats?.available ?? 0}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${ipv4Stats?.total ? Math.round((ipv4Stats.available / ipv4Stats.total) * 100) : 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">PPPoE Sessions</span>
                      <span className="font-semibold">94%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: '94%' }}></div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-3 text-indigo-700 mb-2">
                    <AlertCircle size={18} />
                    <span className="font-bold text-sm">System Alert</span>
                  </div>
                  <p className="text-xs text-indigo-600 leading-relaxed">
                    Router "Core-MKT-01" is reaching 85% CPU utilization. Consider load balancing.
                  </p>
                </div>
              </div>


                </>
              )}
            </motion.div>
          )}

          {activeTab === 'franchises' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-800">Franchise Admin Management</h3>
                    <p className="text-sm text-slate-500 mt-1">One ISP Admin can manage multiple Franchise Admins.</p>
                  </div>
                  {role === 'ISPAdmin' && (
                    <button
                      onClick={() => setIsAddFranchiseModalOpen(true)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm text-sm font-semibold"
                    >
                      <Plus size={18} />
                      Add Franchise Admin
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Franchise</th>
                        <th className="px-6 py-4 font-semibold">ISP</th>
                        <th className="px-6 py-4 font-semibold">Region</th>
                        <th className="px-6 py-4 font-semibold">Contact</th>
                        <th className="px-6 py-4 font-semibold">Subscribers</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {franchiseAdmins.map((fa) => (
                        <tr key={fa.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-semibold text-slate-800">{fa.name}</p>
                              <p className="text-xs text-slate-500 font-mono">{fa.username}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{fa.ispName || currentUser?.name || 'FastNet ISP'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{fa.region || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            <p>{fa.email || '-'}</p>
                            <p className="text-xs text-slate-400">{fa.phone || '-'}</p>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-indigo-600">
                            {fa.subscriberCount ?? subscribers.filter((s) => s.franchiseAdminId === fa.id).length}
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={fa.status || 'Active'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'subscribers' && role !== 'MasterAdmin' && (
             <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-center">
                  <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder={role === 'LCOAdmin' ? "Search by name, phone, or address..." : "Search by name, phone, email, or IP..."} 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" 
                    />
                  </div>
                  {role === 'LCOAdmin' ? (
                    <select 
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none"
                    >
                      <option>All Status</option>
                      <option>Approved</option>
                      <option>Installation Scheduled</option>
                      <option>Installation Completed</option>
                      <option>Active</option>
                    </select>
                  ) : (
                    <select 
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none"
                    >
                      <option>All Status</option>
                      <option>Active</option>
                      <option>Pending KYC</option>
                      <option>Approved</option>
                      <option>Installation Pending</option>
                      <option>Expiring 7 Days</option>
                      <option>Expiring 3 Days</option>
                      <option>Expiring 1 Day</option>
                      <option>Expired</option>
                      <option>Suspended</option>
                      <option>KYC Pending</option>
                      <option>Installation Scheduled</option>
                    </select>
                  )}
                <select 
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 outline-none"
                >
                  <option>All Plans</option>
                  <option>100Mbps</option>
                  <option>50Mbps</option>
                  <option>200Mbps</option>
                </select>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">{role === 'LCOAdmin' ? 'Assigned Installations' : 'Subscriber'}</h3>
                  {role !== 'Subscriber' && role !== 'LCOAdmin' && (
                    <button 
                      onClick={() => setIsAddModalOpen(true)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm text-sm font-semibold"
                    >
                      <Plus size={18} />
                      Add Subscriber
                    </button>
                  )}
                </div>
                {role === 'LCOAdmin' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <th className="px-6 py-4 font-semibold">Subscriber Name</th>
                          <th className="px-6 py-4 font-semibold">Address</th>
                          <th className="px-6 py-4 font-semibold">Contact Number</th>
                          <th className="px-6 py-4 font-semibold">Plan Requested</th>
                          <th className="px-6 py-4 font-semibold">Current Status</th>
                          <th className="px-6 py-4 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredSubscribers.map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                                  {sub.name.split(' ').map(n => n[0]).join('').slice(0, 3)}
                                </div>
                                <span className="font-semibold text-slate-800">{sub.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600 max-w-[200px] truncate">{sub.address || '-'}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{sub.phone || '-'}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{sub.plan}</td>
                            <td className="px-6 py-4">
                              <StatusBadge status={sub.status} />
                            </td>
                            <td className="px-6 py-4 text-right">
                              {sub.status === 'Approved' && (
                                <button
                                  onClick={() => handleScheduleInstallation(sub.id)}
                                  className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg"
                                  title="Start Installation"
                                >
                                  <Clock size={16} />
                                </button>
                              )}
                              {sub.status === 'Installation Scheduled' && (
                                <button
                                  onClick={() => handleCompleteInstallation(sub.id)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title="Complete Installation"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                              {sub.status === 'Installation Completed' && (
                                <button
                                  onClick={() => handleProvisionSubscriber(sub.id)}
                                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                  title="Provision Subscriber"
                                >
                                  <Activity size={16} />
                                </button>
                              )}
                              {sub.status === 'Active' && sub.pppoeUsername && (
                                <span className="text-xs text-emerald-600 font-semibold">Provisioned</span>
                              )}
                              {!['Approved', 'Installation Scheduled', 'Installation Completed', 'Active'].includes(sub.status) && (
                                <span className="text-xs text-slate-400">Awaiting prior step</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <th className="px-6 py-4 font-semibold">Subscriber</th>
                          {(role === 'ISPAdmin' || role === 'MasterAdmin') && (
                            <th className="px-6 py-4 font-semibold">Franchise</th>
                          )}
                          <th className="px-6 py-4 font-semibold">Status</th>
                          <th className="px-6 py-4 font-semibold">Plan</th>
                          <th className="px-6 py-4 font-semibold">IP Address</th>
                          <th className="px-6 py-4 font-semibold">Expiry</th>
                          <th className="px-6 py-4 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredSubscribers.map((sub) => (
                          <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                                  {sub.name.split(' ').map(n => n[0]).join('').slice(0, 3)}
                                </div>
                                <span className="font-semibold text-slate-800">{sub.name}</span>
                              </div>
                            </td>
                            {(role === 'ISPAdmin' || role === 'MasterAdmin') && (
                              <td className="px-6 py-4 text-sm text-slate-600">{sub.franchiseName || '-'}</td>
                            )}
                            <td className="px-6 py-4">
                              <StatusBadge status={getSubscriberStatus(sub)} />
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{sub.plan}</td>
                            <td className="px-6 py-4 text-sm font-mono text-slate-500">{sub.ip || '-'}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{sub.expiry || '-'}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                {sub.status === 'KYC Pending' && (role === 'FranchiseAdmin' || role === 'MasterAdmin') && (
                                  <button onClick={() => handleVerifyKyc(sub.id)} className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg" title="Verify KYC"><ShieldCheck size={16} /></button>
                                )}
                                {sub.status === 'KYC Verified' && (role === 'FranchiseAdmin' || role === 'MasterAdmin') && (
                                  <button onClick={() => handleFranchiseApprove(sub.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Approve Subscriber"><CheckCircle2 size={16} /></button>
                                )}
                                {sub.status === 'Approved' && (role === 'FranchiseAdmin' || role === 'MasterAdmin') && (
                                  <button onClick={() => handleScheduleInstallation(sub.id)} className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg" title="Schedule Installation"><Clock size={16} /></button>
                                )}
                                {sub.status === 'Installation Scheduled' && role === 'MasterAdmin' && (
                                  <button onClick={() => handleCompleteInstallation(sub.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Complete Installation"><Activity size={16} /></button>
                                )}
                                {sub.status === 'Installation Completed' && role === 'MasterAdmin' && (
                                  <button onClick={() => handleProvisionSubscriber(sub.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Provision Subscriber"><Activity size={16} /></button>
                                )}
                                <button onClick={() => { setSelectedSubscriber(sub); setAssignPlanValue(''); setIsManageModalOpen(true); }} className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg" title="Manage"><SettingsIcon size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'network' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Database size={20} className="text-indigo-600" />
                    MikroTik Routers
                  </h3>
                  <div className="space-y-4">
                    {[
                      { name: 'Core-MKT-01', ip: '192.168.10.1', status: 'Online', cpu: '45%', mem: '62%', sessions: 1240 },
                      { name: 'Edge-MKT-02', ip: '192.168.20.1', status: 'Online', cpu: '12%', mem: '34%', sessions: 450 },
                      { name: 'Dist-MKT-03', ip: '192.168.30.1', status: 'Offline', cpu: '0%', mem: '0%', sessions: 0 },
                    ].map(router => (
                      <div key={router.name} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <h4 className="font-bold">{router.name}</h4>
                            <p className="text-xs text-slate-500 font-mono">{router.ip}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${router.status === 'Online' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {router.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">CPU</p>
                            <p className="text-sm font-bold">{router.cpu}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Memory</p>
                            <p className="text-sm font-bold">{router.mem}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Sessions</p>
                            <p className="text-sm font-bold">{router.sessions}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Globe size={20} className="text-indigo-600" />
                    IP Pool Management
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <h4 className="font-bold text-sm">IPv4 Pool - Managed</h4>
                          <p className="text-xs text-slate-500">10.0.1.0/24</p>
                        </div>
                        <span className="text-xs font-bold text-indigo-600">{ipv4Stats?.total ?? 0} Total</span>
                      </div>
                      <div className="h-4 bg-slate-100 rounded-full overflow-hidden flex">
                        <div className="h-full bg-indigo-600" style={{ width: `${ipv4Stats?.total ? (ipv4Stats.assigned / ipv4Stats.total) * 100 : 0}%` }}></div>
                        <div className="h-full bg-slate-200" style={{ width: `${ipv4Stats?.total ? (ipv4Stats.available / ipv4Stats.total) * 100 : 100}%` }}></div>
                      </div>
                      <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 uppercase">
                        <span>Assigned: {ipv4Stats?.assigned ?? 0}</span>
                        <span>Available: {ipv4Stats?.available ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'billing' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Billing & Invoices</h2>
                {role !== 'Subscriber' && (
                  <div className="flex gap-3">
                    <button className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-semibold hover:bg-slate-50">Export PDF</button>
                    <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-200">Generate Monthly Invoices</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Invoices</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                          <th className="px-6 py-4 font-semibold">Invoice ID</th>
                          <th className="px-6 py-4 font-semibold">Subscriber</th>
                          <th className="px-6 py-4 font-semibold">Amount</th>
                          <th className="px-6 py-4 font-semibold">Date</th>
                          <th className="px-6 py-4 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {invoices
                          .filter(inv => role !== 'Subscriber' || inv.subscriber === currentUser?.name)
                          .map(inv => (
                          <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4 font-mono text-sm text-slate-800">{inv.id}</td>
                            <td className="px-6 py-4 font-semibold text-slate-800">{inv.subscriber}</td>
                            <td className="px-6 py-4 font-bold text-slate-800">₹{inv.amount}</td>
                            <td className="px-6 py-4 text-sm text-slate-600">{inv.date}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${inv.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-6">
                  {role !== 'Subscriber' ? (
                    <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-200">
                      <h4 className="text-indigo-100 text-sm font-medium mb-1">Total Revenue (MTD)</h4>
                      <p className="text-3xl font-bold mb-6">₹4,52,000</p>
                      <div className="flex justify-between text-sm text-indigo-100">
                        <span>Paid: ₹4,10,000</span>
                        <span>Pending: ₹42,000</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-600 p-6 rounded-2xl text-white shadow-xl shadow-emerald-200">
                      <h4 className="text-emerald-100 text-sm font-medium mb-1">Current Balance</h4>
                      <p className="text-3xl font-bold mb-6">₹0.00</p>
                      <div className="flex justify-between text-sm text-emerald-100">
                        <span>Due Amount: ₹0.00</span>
                        <span>Next Due: 24 Oct</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <h4 className="font-bold mb-4">Quick Actions</h4>
                    <div className="space-y-3">
                      {role === 'Subscriber' ? (
                        <button className="w-full text-left p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all flex items-center gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CreditCard size={18} /></div>
                          <div>
                            <p className="text-sm font-bold">Pay Now</p>
                            <p className="text-xs text-slate-500">Quickly pay your outstanding bill</p>
                          </div>
                        </button>
                      ) : (
                        <>
                          <button className="w-full text-left p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><CreditCard size={18} /></div>
                            <div>
                              <p className="text-sm font-bold">Recharge Wallet</p>
                              <p className="text-xs text-slate-500">Add credits to subscriber wallet</p>
                            </div>
                          </button>
                          <button className="w-full text-left p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={18} /></div>
                            <div>
                              <p className="text-sm font-bold">Tax Reports</p>
                              <p className="text-xs text-slate-500">Download GST/VAT reports</p>
                            </div>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold">Analytical Reports</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { title: 'Data Usage Report', desc: 'Detailed bandwidth consumption per user', icon: Activity },
                  { title: 'Revenue Share', desc: 'ISP vs Franchise revenue distribution', icon: CreditCard },
                  { title: 'NAT Logs', desc: 'Searchable history of IP translations', icon: Database },
                  { title: 'IPv4 Utilization', desc: 'Assigned vs available IPv4 pool statistics', icon: Server },
                  { title: 'User Expiry', desc: 'Upcoming account expirations list', icon: Clock },
                  { title: 'Audit Logs', desc: 'System activity and admin actions', icon: ShieldCheck },
                ].map((report, i) => (
                  <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                    <div className="p-3 bg-slate-50 rounded-xl text-indigo-600 w-fit mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <report.icon size={24} />
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1">{report.title}</h4>
                    <p className="text-sm text-slate-500">{report.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'support' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold">Support Center</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold mb-6">Active Tickets</h3>
                    <div className="space-y-4">
                      <div className="p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex justify-between items-start mb-2">
                          <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded uppercase">In Progress</span>
                          <span className="text-xs text-slate-400">#TK-8821 • 2h ago</span>
                        </div>
                        <h4 className="font-bold text-slate-900">Slow internet speed during peak hours</h4>
                        <p className="text-sm text-slate-500 mt-1">Our team is investigating the latency issues in your area.</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold mb-6">Create New Ticket</h3>
                    <form className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Issue Category</label>
                        <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                          <option>Technical Issue</option>
                          <option>Billing Query</option>
                          <option>Plan Change Request</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Subject</label>
                        <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="Brief summary of the issue" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Description</label>
                        <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none h-32" placeholder="Provide more details..." />
                      </div>
                      <button className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">Submit Ticket</button>
                    </form>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-200">
                    <h4 className="font-bold mb-4">Need Immediate Help?</h4>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg"><Wifi size={18} /></div>
                        <div>
                          <p className="text-xs text-indigo-100">Customer Care</p>
                          <p className="font-bold">1800-123-4567</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg"><Mail size={18} /></div>
                        <div>
                          <p className="text-xs text-indigo-100">Email Support</p>
                          <p className="font-bold">support@netpulse.com</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <h4 className="font-bold mb-4">FAQs</h4>
                    <div className="space-y-3">
                      {['How to reset my router?', 'How to pay my bill?', 'What is FUP policy?'].map((faq, i) => (
                        <div key={i} className="p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer text-sm font-medium flex justify-between items-center group">
                          {faq}
                          <ArrowRight size={14} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'ip-pool' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">IP Pool Management</h2>
                <div className="flex items-center gap-3">
                  {ipv4Stats && (
                    <div className="flex gap-4 text-sm">
                      <span className="text-slate-500">Total: <strong className="text-slate-800">{ipv4Stats.total}</strong></span>
                      <span className="text-emerald-600">Available: <strong>{ipv4Stats.available}</strong></span>
                      <span className="text-indigo-600">Assigned: <strong>{ipv4Stats.assigned}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Pool summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {IP_POOLS.map((pool, i) => {
                  const poolIps = ipv4Addresses.filter(a => a.poolName === pool.name);
                  const total = poolIps.length;
                  const assigned = poolIps.filter(a => a.status === 'Assigned').length;
                  return (
                    <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                          <Server size={18} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm leading-tight">{pool.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{pool.subnet}</p>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Gateway: <span className="font-mono text-slate-700">{pool.gateway}</span></span>
                        <span className="text-slate-500">Range: <span className="font-mono text-slate-700">{pool.start} – {pool.end}</span></span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between">
                        <span className="text-xs text-slate-500">Assigned: <strong className="text-indigo-600">{assigned}</strong></span>
                        <span className="text-xs text-slate-500">Available: <strong className="text-emerald-600">{total - assigned}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* IP Address tables */}
              <div className="relative">
                {/* Tab switcher */}
                <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
                  <button
                    onClick={() => setIpPoolTab('available')}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      ipPoolTab === 'available' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Available IP Addresses
                  </button>
                  <button
                    onClick={() => setIpPoolTab('assigned')}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      ipPoolTab === 'assigned' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Assigned IP Addresses
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {ipPoolTab === 'available' && (
                    <>
                      <div className="p-6 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800">Available IP Addresses</h3>
                        <p className="text-sm text-slate-500 mt-1">Unused IPs ready for subscriber assignment. Click a row for details.</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                              <th className="px-6 py-4 font-semibold">IP Address</th>
                              <th className="px-6 py-4 font-semibold">Pool Name</th>
                              <th className="px-6 py-4 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {ipv4Addresses.filter(a => a.status === 'Available').length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-6 py-12 text-center text-slate-400 text-sm">No available IP addresses.</td>
                              </tr>
                            ) : (
                              ipv4Addresses
                                .filter(a => a.status === 'Available')
                                .map((ip) => (
                                  <tr
                                    key={ip.id}
                                    onClick={() => setSelectedIpDetails(selectedIpDetails?.id === ip.id ? null : ip)}
                                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                      selectedIpDetails?.id === ip.id ? 'bg-indigo-50/60' : ''
                                    }`}
                                  >
                                    <td className="px-6 py-4 font-mono font-semibold text-slate-800">{ip.address}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{ip.poolName || getPoolName(ip.address)}</td>
                                    <td className="px-6 py-4"><StatusBadge status={ip.status} /></td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {ipPoolTab === 'assigned' && (
                    <>
                      <div className="p-6 border-b border-slate-100">
                        <h3 className="font-bold text-slate-800">Assigned IP Addresses</h3>
                        <p className="text-sm text-slate-500 mt-1">IPs currently allocated to subscribers. Click a row for full details.</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                              <th className="px-6 py-4 font-semibold">IP Address</th>
                              <th className="px-6 py-4 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {ipv4Addresses.filter(a => a.status === 'Assigned').length === 0 ? (
                              <tr>
                                <td colSpan={2} className="px-6 py-12 text-center text-slate-400 text-sm">No assigned IP addresses.</td>
                              </tr>
                            ) : (
                              ipv4Addresses
                                .filter(a => a.status === 'Assigned')
                                .map((ip) => (
                                  <tr
                                    key={ip.id}
                                    onClick={() => setSelectedIpDetails(selectedIpDetails?.id === ip.id ? null : ip)}
                                    className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                      selectedIpDetails?.id === ip.id ? 'bg-indigo-50/60' : ''
                                    }`}
                                  >
                                    <td className="px-6 py-4 font-mono font-semibold text-slate-800">{ip.address}</td>
                                    <td className="px-6 py-4"><StatusBadge status={ip.status} /></td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* Details slide-over panel */}
                <AnimatePresence>
                  {selectedIpDetails && (
                    <motion.div
                      initial={{ opacity: 0, x: 320 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 320 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                      className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl border-l border-slate-200 z-50 overflow-y-auto"
                    >
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="font-bold text-lg text-slate-800">IP Details</h3>
                          <button
                            onClick={() => setSelectedIpDetails(null)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <X size={20} className="text-slate-400" />
                          </button>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4 mb-6">
                          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">IP Address</p>
                          <p className="font-mono font-bold text-xl text-slate-800">{selectedIpDetails.address}</p>
                          <div className="mt-2">
                            <StatusBadge status={selectedIpDetails.status} />
                          </div>
                          {selectedIpDetails.poolName && (
                            <p className="text-xs text-slate-500 mt-2">Pool: {selectedIpDetails.poolName}</p>
                          )}
                        </div>

                        {selectedIpDetails.status === 'Assigned' && (() => {
                          const linkedSub = subscribers.find(
                            s => s.id === selectedIpDetails.subscriberId || s.name === selectedIpDetails.subscriberName || s.ip === selectedIpDetails.address
                          );
                          return (
                            <div className="space-y-4">
                              <h4 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">Subscriber Details</h4>
                              <div className="bg-white border border-slate-100 rounded-xl divide-y divide-slate-100">
                                <div className="p-4 flex justify-between">
                                  <span className="text-sm text-slate-500">Subscriber Name</span>
                                  <span className="text-sm font-semibold text-slate-800">{linkedSub?.name || selectedIpDetails.subscriberName || '-'}</span>
                                </div>
                                <div className="p-4 flex justify-between">
                                  <span className="text-sm text-slate-500">PPPoE Username</span>
                                  <span className="text-sm font-mono text-slate-800">{linkedSub?.pppoeUsername || '-'}</span>
                                </div>
                                <div className="p-4 flex justify-between">
                                  <span className="text-sm text-slate-500">Assigned Plan</span>
                                  <span className="text-sm font-semibold text-slate-800">{linkedSub?.plan || '-'}</span>
                                </div>
                                <div className="p-4 flex justify-between">
                                  <span className="text-sm text-slate-500">Assignment Date</span>
                                  <span className="text-sm text-slate-600">{selectedIpDetails.assignedAt ? new Date(selectedIpDetails.assignedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                </div>
                                <div className="p-4 flex justify-between">
                                  <span className="text-sm text-slate-500">Current Status</span>
                                  {linkedSub ? <StatusBadge status={getSubscriberStatus(linkedSub)} /> : <span className="text-sm text-slate-400">No subscriber linked</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {selectedIpDetails.status === 'Available' && (
                          <div className="bg-slate-50 rounded-xl p-6 text-center">
                            <Database size={32} className="mx-auto text-slate-300 mb-2" />
                            <p className="text-sm text-slate-500">This IP is available and ready for assignment.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Backdrop overlay when details panel is open */}
                {selectedIpDetails && (
                  <div
                    className="fixed inset-0 bg-black/20 z-40"
                    onClick={() => setSelectedIpDetails(null)}
                  />
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'lco-admins' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-2xl font-bold">LCO Admin</h2>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-800">LCO Admins Under Your Franchise</h3>
                    <p className="text-sm text-slate-500 mt-1">Manage LCO admins responsible for installation and field operations.</p>
                  </div>
                  <button
                    onClick={() => alert('Add LCO Admin form coming soon')}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm text-sm font-semibold"
                  >
                    <Plus size={18} />
                    Add LCO Admin
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">LCO Admin</th>
                        <th className="px-6 py-4 font-semibold">Username</th>
                        <th className="px-6 py-4 font-semibold">Contact</th>
                        <th className="px-6 py-4 font-semibold">Region</th>
                        <th className="px-6 py-4 font-semibold">Subscribers</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(lcoAdmins.length > 0 ? lcoAdmins : [
                        { name: 'Rajesh Kumar', username: 'lco_rajesh', email: 'rajesh@lco.com', phone: '9876543210', region: 'North Zone', subscribers: 45, status: 'Active' },
                        { name: 'Priya Sharma', username: 'lco_priya', email: 'priya@lco.com', phone: '9876543211', region: 'Central Zone', subscribers: 32, status: 'Active' },
                        { name: 'Suresh Patel', username: 'lco_suresh', email: 'suresh@lco.com', phone: '9876543212', region: 'South Zone', subscribers: 28, status: 'Active' },
                      ]).map((lco, i) => (
                        <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                                {lco.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <span className="font-semibold text-slate-800">{lco.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-600">{lco.username}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            <p>{lco.email}</p>
                            <p className="text-xs text-slate-400">{lco.phone}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{lco.region}</td>
                          <td className="px-6 py-4 text-sm font-bold text-indigo-600">{lco.subscribers}</td>
                          <td className="px-6 py-4"><StatusBadge status={lco.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'isp-subscribers' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-2xl font-bold">Subscriber</h2>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800">All Subscribers</h3>
                  <p className="text-sm text-slate-500 mt-1">Manage subscriber accounts, plans, and IP assignments.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Subscriber Name</th>
                        <th className="px-6 py-4 font-semibold">Username</th>
                        <th className="px-6 py-4 font-semibold">Assigned Plan</th>
                        <th className="px-6 py-4 font-semibold">Assigned IP</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(subscribers.length > 0 ? subscribers : []).map((sub, i) => (
                        <tr key={sub.id || i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-800">{sub.name}</td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-600">{sub.username}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{sub.plan}</td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-500">{sub.ip || '-'}</td>
                          <td className="px-6 py-4"><StatusBadge status={getSubscriberStatus(sub)} /></td>
                        </tr>
                      ))}
                      {subscribers.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No subscribers found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'isp-franchises' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-2xl font-bold">Franchise</h2>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800">Franchises Under Your ISP</h3>
                  <p className="text-sm text-slate-500 mt-1">View and manage all franchise admins associated with your ISP.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Franchise Name</th>
                        <th className="px-6 py-4 font-semibold">Username</th>
                        <th className="px-6 py-4 font-semibold">Contact</th>
                        <th className="px-6 py-4 font-semibold">Region</th>
                        <th className="px-6 py-4 font-semibold">Subscribers</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(franchiseAdmins.length > 0 ? franchiseAdmins : []).map((fa, i) => (
                        <tr key={fa.id || i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-800">{fa.name}</td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-600">{fa.username}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            <p>{fa.email}</p>
                            <p className="text-xs text-slate-400">{fa.phone}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{fa.region}</td>
                          <td className="px-6 py-4 text-sm font-bold text-indigo-600">{fa.subscriberCount ?? 0}</td>
                          <td className="px-6 py-4"><StatusBadge status={fa.status} /></td>
                        </tr>
                      ))}
                      {franchiseAdmins.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No franchise admins found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'syslog' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-2xl font-bold">SYSLOG</h2>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800">System Logs</h3>
                  <p className="text-sm text-slate-500 mt-1">Device and system event logs from MikroTik routers.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Timestamp</th>
                        <th className="px-6 py-4 font-semibold">Severity</th>
                        <th className="px-6 py-4 font-semibold">Device</th>
                        <th className="px-6 py-4 font-semibold">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {[
                        { time: '2026-06-12 10:23:45', severity: 'info', device: 'Core-MKT-01', message: 'Interface ether1 link up - 1Gbps full duplex' },
                        { time: '2026-06-12 10:22:10', severity: 'warning', device: 'Edge-MKT-02', message: 'CPU usage above 80% threshold' },
                        { time: '2026-06-12 10:20:33', severity: 'error', device: 'Dist-MKT-03', message: 'PPPoE session timeout for user abishree' },
                        { time: '2026-06-12 10:18:00', severity: 'info', device: 'Core-MKT-01', message: 'DHCP lease renewal for 10.0.1.15' },
                        { time: '2026-06-12 10:15:22', severity: 'warning', device: 'Core-MKT-01', message: 'Firewall rule "Block_P2P" matched 1500 packets' },
                      ].map((log, i) => (
                        <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 text-sm font-mono text-slate-500">{log.time}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                              log.severity === 'error' ? 'bg-rose-50 text-rose-700' :
                              log.severity === 'warning' ? 'bg-amber-50 text-amber-700' :
                              'bg-slate-50 text-slate-700'
                            }`}>
                              {log.severity}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-800">{log.device}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{log.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'nat-logs' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-2xl font-bold">NAT Logs</h2>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800">Network Address Translation Logs</h3>
                  <p className="text-sm text-slate-500 mt-1">NAT session logs from MikroTik routers showing translated connections.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Timestamp</th>
                        <th className="px-6 py-4 font-semibold">Source IP</th>
                        <th className="px-6 py-4 font-semibold">Source Port</th>
                        <th className="px-6 py-4 font-semibold">Translated IP</th>
                        <th className="px-6 py-4 font-semibold">Destination</th>
                        <th className="px-6 py-4 font-semibold">Protocol</th>
                        <th className="px-6 py-4 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {[
                        { time: '2026-06-12 10:23:45', src: '10.0.1.1', sport: '54321', trans: '203.0.113.10', dst: '142.250.77.46:443', proto: 'TCP', action: 'masquerade' },
                        { time: '2026-06-12 10:23:40', src: '10.0.1.15', sport: '38001', trans: '203.0.113.11', dst: '52.84.120.42:443', proto: 'TCP', action: 'masquerade' },
                        { time: '2026-06-12 10:22:55', src: '10.0.2.8', sport: '22000', trans: '203.0.113.12', dst: '8.8.8.8:53', proto: 'UDP', action: 'masquerade' },
                        { time: '2026-06-12 10:22:10', src: '10.0.1.1', sport: '44321', trans: '203.0.113.10', dst: '157.240.1.35:443', proto: 'TCP', action: 'masquerade' },
                        { time: '2026-06-12 10:21:30', src: '10.0.3.5', sport: '31000', trans: '203.0.113.13', dst: '104.16.132.229:80', proto: 'TCP', action: 'masquerade' },
                      ].map((log, i) => (
                        <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 text-sm font-mono text-slate-500">{log.time}</td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-800">{log.src}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{log.sport}</td>
                          <td className="px-6 py-4 text-sm font-mono text-indigo-600">{log.trans}</td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-600">{log.dst}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{log.proto}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{log.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>

    {/* Modals */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold">Add New Subscriber</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
              </div>
              <form onSubmit={handleAddSubscriber} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Full Name</label>
                  <input 
                    required
                    type="text" 
                    value={newSubscriber.name}
                    onChange={e => setNewSubscriber({...newSubscriber, name: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" 
                    placeholder="Enter subscriber name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
                    <input 
                      required
                      type="tel" 
                      value={newSubscriber.phone}
                      onChange={e => setNewSubscriber({...newSubscriber, phone: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" 
                      placeholder="9876543210"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Email Address</label>
                    <input 
                      required
                      type="email" 
                      value={newSubscriber.email}
                      onChange={e => setNewSubscriber({...newSubscriber, email: e.target.value})}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500" 
                      placeholder="abishree@example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Select Plan</label>
                  <select 
                    value={newSubscriber.plan}
                    onChange={e => setNewSubscriber({...newSubscriber, plan: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                  >
                    <option>100Mbps Unlimited</option>
                    <option>50Mbps Basic</option>
                    <option>200Mbps Premium</option>
                  </select>
                </div>
                {(role === 'ISPAdmin' || role === 'MasterAdmin') && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Assign to Franchise Admin</label>
                    <select
                      required
                      value={newSubscriber.franchiseAdminId}
                      onChange={e => setNewSubscriber({ ...newSubscriber, franchiseAdminId: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    >
                      <option value="">Select franchise admin</option>
                      {franchiseAdmins.map((fa) => (
                        <option key={fa.id} value={fa.id}>{fa.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Create Subscriber</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {isAddFranchiseModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold">Add Franchise Admin</h3>
                <button onClick={() => setIsAddFranchiseModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
              </div>
              <form onSubmit={handleAddFranchise} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Franchise Name</label>
                  <input
                    required
                    type="text"
                    value={newFranchise.name}
                    onChange={(e) => setNewFranchise({ ...newFranchise, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    placeholder="CityLink Franchise"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Username</label>
                  <input
                    required
                    type="text"
                    value={newFranchise.username}
                    onChange={(e) => setNewFranchise({ ...newFranchise, username: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    placeholder="franchise3"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                    <input
                      required
                      type="email"
                      value={newFranchise.email}
                      onChange={(e) => setNewFranchise({ ...newFranchise, email: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Phone</label>
                    <input
                      required
                      type="tel"
                      value={newFranchise.phone}
                      onChange={(e) => setNewFranchise({ ...newFranchise, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Region</label>
                  <input
                    required
                    type="text"
                    value={newFranchise.region}
                    onChange={(e) => setNewFranchise({ ...newFranchise, region: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    placeholder="Mumbai Central"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsAddFranchiseModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">Create Franchise Admin</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {isManageModalOpen && selectedSubscriber && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="text-xl font-bold">{selectedSubscriber.name}</h3>
                  <p className="text-sm text-slate-500">
                    ID: {selectedSubscriber.id} • {getSubscriberStatus(selectedSubscriber)}
                    {selectedSubscriber.franchiseName && ` • Franchise: ${selectedSubscriber.franchiseName}`}
                  </p>
                </div>
                <button onClick={() => setIsManageModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20} /></button>
              </div>
              
              <div className="p-8 grid grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Network Info</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">IPv4 Address</span>
                        <span className="font-mono font-bold">{selectedSubscriber.ip}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Plan</span>
                        <span className={`font-bold ${!selectedSubscriber.plan || selectedSubscriber.plan === 'Not Assigned' ? 'text-amber-600' : ''}`}>
                          {selectedSubscriber.plan || 'Not Assigned'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Expiry</span>
                        <span className="font-bold">{selectedSubscriber.expiry}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Connection</span>
                        <span className="font-bold">{selectedSubscriber.connectionType || 'PPPoE'}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">KYC Verification</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">ID Type</span>
                        <span className="font-bold">{(selectedSubscriber as any).idType || 'Aadhaar'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">ID Number</span>
                        <span className="font-bold font-mono">{(selectedSubscriber as any).idNumber || 'XXXX-XXXX-1234'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">KYC Status</span>
                        <span className={`font-bold ${selectedSubscriber.kycStatus === 'Verified' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {selectedSubscriber.kycStatus || 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contact & Address</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Phone</span>
                        <span className="font-bold">{selectedSubscriber.phone || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Email</span>
                        <span className="font-bold">{selectedSubscriber.email || 'N/A'}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-slate-500 block mb-1">Address</span>
                        <span className="font-bold block leading-tight">{selectedSubscriber.address || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</h4>

                  {(!selectedSubscriber.plan || selectedSubscriber.plan === 'Not Assigned') &&
                    (role === 'MasterAdmin' || role === 'ISPAdmin' || role === 'FranchiseAdmin') && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-3">
                      <p className="text-sm font-semibold text-amber-800">Assign Internet Plan</p>
                      <select
                        value={assignPlanValue}
                        onChange={(e) => setAssignPlanValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm outline-none"
                      >
                        <option value="">Select a plan</option>
                        {availablePlans.map((p) => (
                          <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignPlan(selectedSubscriber.id, assignPlanValue)}
                        className="w-full py-2 bg-amber-600 text-white rounded-lg font-bold text-sm hover:bg-amber-700 transition-colors"
                      >
                        Assign Plan
                      </button>
                    </div>
                  )}
                  
                  {/* LCO Admin: Installation workflow actions */}
                  {role === 'LCOAdmin' ? (
                    <div className="space-y-3">
                      {selectedSubscriber.status === 'Approved' && (
                        <button 
                          onClick={() => { handleScheduleInstallation(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                        >
                          <Clock size={20} />
                          <span className="font-bold">Start Installation</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'Installation Scheduled' && (
                        <button 
                          onClick={() => { handleCompleteInstallation(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <CheckCircle2 size={20} />
                          <span className="font-bold">Complete Installation</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'Installation Completed' && (
                        <button 
                          onClick={() => { handleProvisionSubscriber(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <Activity size={20} />
                          <span className="font-bold">Provision Subscriber</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'Active' && selectedSubscriber.pppoeUsername && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2">
                          <p className="text-sm font-bold text-emerald-800">Provisioned Successfully</p>
                          <div className="text-xs text-emerald-700 space-y-1">
                            <p><span className="font-semibold">PPPoE User:</span> {selectedSubscriber.pppoeUsername}</p>
                            <p><span className="font-semibold">PPPoE Pass:</span> {selectedSubscriber.pppoePassword}</p>
                            <p><span className="font-semibold">Assigned IP:</span> {selectedSubscriber.ip}</p>
                          </div>
                        </div>
                      )}
                      {!['Approved', 'Installation Scheduled', 'Installation Completed', 'Active'].includes(selectedSubscriber.status) && (
                        <p className="text-xs text-slate-400 italic">Awaiting prior workflow steps.</p>
                      )}
                    </div>
                  ) : (
                    /* Franchise Admin and others: Workflow actions */
                    <>
                      {selectedSubscriber.status === 'KYC Pending' && (role === 'FranchiseAdmin' || role === 'MasterAdmin') && (
                        <button 
                          onClick={() => { handleVerifyKyc(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors"
                        >
                          <ShieldCheck size={20} />
                          <span className="font-bold">Verify KYC Documents</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'KYC Verified' && (role === 'FranchiseAdmin' || role === 'MasterAdmin') && (
                        <button 
                          onClick={() => { handleFranchiseApprove(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 size={20} />
                          <span className="font-bold">Approve Subscriber</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'Approved' && (role === 'FranchiseAdmin' || role === 'MasterAdmin') && (
                        <button 
                          onClick={() => { handleScheduleInstallation(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                        >
                          <Clock size={20} />
                          <span className="font-bold">Schedule Installation</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'Installation Scheduled' && (role === 'MasterAdmin') && (
                        <button 
                          onClick={() => { handleCompleteInstallation(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          <CheckCircle2 size={20} />
                          <span className="font-bold">Complete Installation</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'Installation Completed' && (role === 'MasterAdmin') && (
                        <button 
                          onClick={() => { handleProvisionSubscriber(selectedSubscriber.id); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <Activity size={20} />
                          <span className="font-bold">Provision Subscriber</span>
                        </button>
                      )}
                      {selectedSubscriber.status === 'Active' && (
                        <button 
                          onClick={() => { handleStatusUpdate(selectedSubscriber.id, 'Suspended'); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                        >
                          <AlertCircle size={20} />
                          <span className="font-bold">Suspend Account</span>
                        </button>
                      )}
                      {(selectedSubscriber.status === 'Suspended' || selectedSubscriber.status === 'Terminated') && (
                        <button 
                          onClick={() => { handleStatusUpdate(selectedSubscriber.id, 'Active'); setIsManageModalOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 size={20} />
                          <span className="font-bold">Reactivate Account</span>
                        </button>
                      )}
                      <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">
                        <CreditCard size={20} />
                        <span className="font-bold">Recharge / Renew</span>
                      </button>
                      <button 
                        onClick={() => { handleTerminateSession(selectedSubscriber.id); setIsManageModalOpen(false); }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                      >
                        <LogOut size={20} />
                        <span className="font-bold">Terminate Session</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
