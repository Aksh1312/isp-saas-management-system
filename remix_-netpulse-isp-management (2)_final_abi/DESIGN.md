# NetPulse ISP Management Platform - System Architecture

## 1. System Overview
The NetPulse platform is a high-performance, multi-tenant solution designed for ISPs to manage subscribers, network infrastructure, and billing.

## 2. Full System Architecture Diagram

```mermaid
graph TD
    subgraph "Frontend Layer (React)"
        Dashboard[Admin/Subscriber Dashboard]
        KYC[KYC/CAF Module]
        BillingUI[Billing & Wallet UI]
    end

    subgraph "API Layer (.NET Core / Express)"
        Auth[JWT Auth & RBAC]
        SubSvc[Subscriber Service]
        PlanSvc[Plan Management]
        BillingSvc[Billing Engine]
        NetworkSvc[Network Integration Svc]
        LogSvc[NAT/Syslog Service]
    end

    subgraph "Data Layer"
        SQL[(MS SQL Server)]
        Redis[(Redis Cache)]
    end

    subgraph "Network & AAA Layer"
        RADIUS[FreeRADIUS Server]
        MikroTik[MikroTik RouterOS]
        Syslog[Syslog Collector]
    end

    Dashboard --> Auth
    Auth --> SQL
    SubSvc --> SQL
    NetworkSvc --> RADIUS
    NetworkSvc --> MikroTik
    BillingSvc --> SQL
    LogSvc --> Syslog
    Syslog --> SQL
```

## 3. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    TENANT ||--o{ USER : contains
    TENANT ||--o{ PLAN : offers
    TENANT ||--o{ IP_POOL : owns
    
    USER ||--o{ SUBSCRIBER_PROFILE : has
    USER ||--o{ WALLET : has
    
    SUBSCRIBER_PROFILE ||--o{ KYC_DOCUMENT : provides
    SUBSCRIBER_PROFILE ||--o{ SUBSCRIPTION : active
    
    SUBSCRIPTION }|--|| PLAN : based_on
    SUBSCRIPTION ||--o{ INVOICE : generates
    
    MIKROTIK_ROUTER }|--|| TENANT : managed_by
    RADIUS_ACCOUNTING }|--|| USER : tracks
    
    NAT_LOG }|--|| USER : identifies
```

## 4. Multi-Tenant Role Hierarchy
1. **Master Admin**: Global configuration, Tenant (ISP) creation, Global Reports.
2. **ISP Admin**: Manage Franchise/LCO, IP Pools, Global Plans for their ISP.
3. **Franchise Admin**: Manage LCOs, Subscribers, Revenue Share.
4. **LCO Admin**: Local Subscriber management, Support, Collection.
5. **Subscriber**: Self-care, Recharge, Usage stats, Support tickets.
