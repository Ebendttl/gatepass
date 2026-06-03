'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/providers';
import {
  Calendar,
  DollarSign,
  Ticket,
  Eye,
  Activity,
  ArrowLeft,
  ChevronRight,
  TrendingUp,
  PieChart as PieIcon,
  Clock
} from 'lucide-react';
import Link from 'next/link';

// Recharts imports (with dynamic import fallback/safety check)
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend
} from 'recharts';

interface AnalyticsData {
  summary: {
    totalRevenue: number;
    totalTicketsSold: number;
    views: number;
    conversionRate: number;
  };
  capacityByTier: Array<{
    id: string;
    name: string;
    total: number;
    sold: number;
    remaining: number;
    fillRate: number;
  }>;
  revenueByTier: Array<{
    name: string;
    revenue: number;
    sold: number;
  }>;
  salesOverTime: Array<{
    time: string;
    sales: number;
    cumulativeSales: number;
  }>;
}

export default function AnalyticsDashboardPage() {
  const { eventId } = useParams();
  const { token, user } = useAuth();
  const router = useRouter();

  // State Management
  const [timeGroup, setTimeGroup] = useState<'hour' | 'day'>('day');

  // Redirect if not logged in as organizer
  useEffect(() => {
    if (!user) {
      router.push('/login');
    } else if (user.role !== 'organizer') {
      router.push('/');
    }
  }, [user]);

  // Fetch Analytics from Express backend (refetches when timeGroup changes)
  const { data, isLoading, error, refetch } = useQuery<AnalyticsData>({
    queryKey: ['event-analytics', eventId, timeGroup],
    queryFn: async () => {
      const res = await fetch(`http://localhost:5000/api/events/${eventId}/analytics?group=${timeGroup}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    enabled: !!token && !!eventId,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-10 h-10 border-t-2 border-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-red-400">
          <ArrowLeft className="w-8 h-8 mx-auto mb-4 text-red-500 cursor-pointer" onClick={() => router.push('/dashboard')} />
          <h2 className="text-xl font-bold">Failed to load analytics</h2>
          <p className="text-zinc-550 text-sm mt-1">Check that the API is active and you own this event.</p>
        </div>
      </div>
    );
  }

  const { summary, capacityByTier, revenueByTier, salesOverTime } = data;

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      
      {/* Header Navigation */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="p-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <span className="text-xs text-zinc-500 font-mono flex items-center gap-1.5 uppercase">
            Analytics Portal <ChevronRight className="w-3 h-3 text-zinc-700" /> Event #{eventId?.slice(0, 8)}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Event Performance</h1>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Revenue */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs sm:text-sm text-zinc-400 font-semibold">Total Revenue</span>
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl sm:text-3xl font-extrabold text-white font-mono">
              ${summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <span className="text-[10px] text-zinc-550 mt-1 block">Gross earnings</span>
          </div>
        </div>

        {/* Tickets Sold */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs sm:text-sm text-zinc-400 font-semibold">Tickets Sold</span>
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl sm:text-3xl font-extrabold text-white font-mono">
              {summary.totalTicketsSold}
            </h3>
            <span className="text-[10px] text-zinc-550 mt-1 block">Paid ticket entries</span>
          </div>
        </div>

        {/* Page Views */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs sm:text-sm text-zinc-400 font-semibold">Page Views</span>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl sm:text-3xl font-extrabold text-white font-mono">
              {summary.views}
            </h3>
            <span className="text-[10px] text-zinc-550 mt-1 block">Redis view counter</span>
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs sm:text-sm text-zinc-400 font-semibold">Conversion Rate</span>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-xl sm:text-3xl font-extrabold text-white font-mono">
              {summary.conversionRate}%
            </h3>
            <span className="text-[10px] text-zinc-550 mt-1 block">Tickets / Views ratio</span>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Ticket Sales Over Time Line Chart */}
        <div className="lg:col-span-2 bg-zinc-900/20 border border-zinc-900 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                Tickets Sold Over Time
              </h3>
              <p className="text-zinc-500 text-xs mt-0.5">Track ticket purchase volume and distribution.</p>
            </div>

            {/* Time toggle controls */}
            <div className="flex bg-zinc-950 border border-zinc-850 p-0.5 rounded-lg shrink-0 text-xs">
              <button
                onClick={() => setTimeGroup('hour')}
                className={`px-3 py-1 font-semibold rounded-md flex items-center gap-1 transition-all ${
                  timeGroup === 'hour' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-350'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Hourly
              </button>
              <button
                onClick={() => setTimeGroup('day')}
                className={`px-3 py-1 font-semibold rounded-md flex items-center gap-1 transition-all ${
                  timeGroup === 'day' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-350'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Daily
              </button>
            </div>
          </div>

          <div className="h-[300px] w-full">
            {salesOverTime.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                No tickets sold yet. Run the database seed script to populate sample data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesOverTime} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                  <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                    labelStyle={{ color: '#fafafa', fontWeight: 'bold' }}
                    itemStyle={{ color: '#6366f1' }}
                  />
                  <Line
                    name="Cumulative Sales"
                    type="monotone"
                    dataKey="cumulativeSales"
                    stroke="#6366f1"
                    strokeWidth={3}
                    dot={{ stroke: '#6366f1', strokeWidth: 1, r: 3, fill: '#18181b' }}
                  />
                  <Line
                    name="Incremental Sales"
                    type="monotone"
                    dataKey="sales"
                    stroke="#a855f7"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Revenue by Tier Bar Chart */}
        <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-indigo-500" />
              Revenue By Ticket Tier
            </h3>
            <p className="text-zinc-500 text-xs mt-0.5">Dollar revenue earned from each ticket category.</p>
          </div>

          <div className="h-[300px] w-full">
            {revenueByTier.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                No revenue calculated.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByTier} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} />
                  <Tooltip
                    formatter={(value) => [`$${value}`, 'Revenue']}
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                    labelStyle={{ color: '#fafafa', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="revenue" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* Inventory & Capacity Progression */}
      <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <Ticket className="w-4 h-4 text-indigo-500" />
          Remaining Tier Capacity
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {capacityByTier.map((tier) => {
            const isFull = tier.sold >= tier.total;

            return (
              <div key={tier.id} className="bg-zinc-950/60 p-5 border border-zinc-850 rounded-xl space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-white text-sm sm:text-base">{tier.name}</h4>
                    <span className="text-[10px] text-zinc-500 font-mono uppercase">TIER CAPACITY</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {tier.sold} / {tier.total}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      isFull
                        ? 'bg-red-500'
                        : tier.fillRate > 80
                        ? 'bg-amber-500'
                        : 'bg-indigo-500'
                    }`}
                    style={{ width: `${tier.fillRate}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-zinc-500">
                  <span>{tier.remaining} remaining</span>
                  <span className="font-semibold text-zinc-400">{tier.fillRate.toFixed(0)}% Sold</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
