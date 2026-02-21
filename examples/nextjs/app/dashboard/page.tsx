'use client';

import Link from 'next/link';

const MOCK_STATS = [
  { label: 'Templates', value: '12', change: '+2 this week', positive: true },
  { label: 'Contacts', value: '3,847', change: '+124 this week', positive: true },
  { label: 'Campaigns Sent', value: '28', change: '3 scheduled', positive: false },
  { label: 'Avg. Open Rate', value: '42.3%', change: '+1.8% vs last month', positive: true },
  { label: 'Avg. Click Rate', value: '8.7%', change: '+0.3% vs last month', positive: true },
  { label: 'Active Subscribers', value: '3,612', change: '94% of total', positive: false },
];

const RECENT_CAMPAIGNS = [
  { name: 'February Newsletter', status: 'sent', sent: '3,612', openRate: '44.2%', date: '2026-02-18' },
  { name: 'Product Launch Teaser', status: 'sent', sent: '2,890', openRate: '51.3%', date: '2026-02-14' },
  { name: 'Valentine Promo', status: 'sent', sent: '3,100', openRate: '38.7%', date: '2026-02-12' },
];

export default function DashboardOverview() {
  return (
    <div>
      <div className="dashboard-page-header">
        <h1>Dashboard</h1>
        <p>Overview of your email platform activity</p>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-stats-grid">
        {MOCK_STATS.map((stat) => (
          <div key={stat.label} className="dashboard-stat-card">
            <div className="dashboard-stat-card__label">{stat.label}</div>
            <div className="dashboard-stat-card__value">{stat.value}</div>
            <div className={`dashboard-stat-card__change ${stat.positive ? 'dashboard-stat-card__change--positive' : 'dashboard-stat-card__change--neutral'}`}>
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Campaigns */}
      <div className="dashboard-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent Campaigns</h3>
          <Link
            href="/dashboard/campaigns"
            style={{ fontSize: 13, color: 'var(--db-accent)', textDecoration: 'none' }}
          >
            View all
          </Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Open Rate</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_CAMPAIGNS.map((c) => (
              <tr key={c.name}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: 'var(--success-muted)',
                    color: 'var(--success)',
                  }}>
                    {c.status}
                  </span>
                </td>
                <td>{c.sent}</td>
                <td>{c.openRate}</td>
                <td style={{ color: 'var(--db-text-muted)' }}>{c.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 24 }}>
        {[
          { label: 'Create Template', href: '/dashboard/templates', icon: '+' },
          { label: 'Import Contacts', href: '/dashboard/contacts', icon: '+' },
          { label: 'New Campaign', href: '/dashboard/campaigns', icon: '+' },
          { label: 'View Reports', href: '/dashboard/analytics', icon: '>' },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="dashboard-quick-action"
          >
            <span className="dashboard-quick-action__icon">
              {action.icon}
            </span>
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
