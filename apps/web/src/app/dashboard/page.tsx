'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, MapPin, Plus, Trash2, ArrowRight, LayoutDashboard, X, BarChart3, Users, DollarSign } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  banner_url: string;
  start_at: string;
  location: string;
  status: 'active' | 'cancelled';
}

interface TierInput {
  name: string;
  price_cents: number;
  total_qty: number;
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Redirect if not logged in as organizer
  useEffect(() => {
    if (!user) {
      router.push('/login');
    } else if (user.role !== 'organizer') {
      router.push('/');
    }
  }, [user]);

  // Form States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [startAt, setStartAt] = useState('');
  const [location, setLocation] = useState('');
  const [tiers, setTiers] = useState<TierInput[]>([
    { name: 'General Admission', price_cents: 4000, total_qty: 200 }
  ]);

  // Fetch organizer events
  const { data, isLoading, error } = useQuery<{ events: Event[] }>({
    queryKey: ['organizer-events'],
    queryFn: async () => {
      const res = await fetch('http://localhost:5000/api/events/organizer', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
    enabled: !!token,
  });

  const events = data?.events || [];

  // Create Event Mutation
  const createEventMutation = useMutation({
    mutationFn: async (eventData: any) => {
      const res = await fetch('http://localhost:5000/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(eventData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create event');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer-events'] });
      setShowCreateModal(false);
      // Reset form
      setTitle('');
      setBannerUrl('');
      setStartAt('');
      setLocation('');
      setTiers([{ name: 'General Admission', price_cents: 4000, total_qty: 200 }]);
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create event');
    }
  });

  // Cancel Event Mutation
  const cancelEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await fetch(`http://localhost:5000/api/events/${eventId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to cancel event');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizer-events'] });
      alert('Event cancelled and buyers notified.');
    }
  });

  // Tier Input Handlers
  const handleAddTierInput = () => {
    setTiers([...tiers, { name: 'VIP Pass', price_cents: 10000, total_qty: 50 }]);
  };

  const handleRemoveTierInput = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleTierChange = (index: number, field: keyof TierInput, value: any) => {
    const updated = [...tiers];
    if (field === 'price_cents') {
      // Input is dollars, store as cents
      updated[index][field] = Math.round(parseFloat(value) * 100) || 0;
    } else if (field === 'total_qty') {
      updated[index][field] = parseInt(value) || 0;
    } else {
      updated[index][field] = value;
    }
    setTiers(updated);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startAt || !location || tiers.length === 0) {
      alert('Please fill out all required fields and add at least one tier');
      return;
    }

    createEventMutation.mutate({
      title,
      banner_url: bannerUrl,
      start_at: startAt,
      location,
      tiers
    });
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8 text-indigo-500" />
            Organizer Dashboard
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Manage events, define ticket inventories, and review conversion metrics.</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-sm font-semibold shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create New Event
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <div className="w-10 h-10 border-t-2 border-indigo-500 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-400 text-center text-sm">
          Failed to load dashboard events. Ensure database and Redis services are active.
        </div>
      )}

      {!isLoading && !error && events.length === 0 && (
        <div className="text-center py-20 bg-zinc-900/10 border border-zinc-900 rounded-2xl p-8">
          <p className="text-zinc-400 mb-4">You have not created any events yet.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600/10 border border-indigo-500/25 text-indigo-400 rounded-lg hover:bg-indigo-600 hover:text-white transition-all text-xs font-semibold"
          >
            Create Your First Event
          </button>
        </div>
      )}

      {/* Events Grid */}
      {!isLoading && !error && events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => {
            const dateStr = new Date(event.start_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            });

            return (
              <div
                key={event.id}
                className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-40 bg-zinc-950">
                    <img
                      src={event.banner_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop&q=60'}
                      alt={event.title}
                      className="w-full h-full object-cover opacity-75"
                    />
                    <div className={`absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      event.status === 'active' ? 'bg-emerald-500/80 text-white' : 'bg-red-500/80 text-white'
                    }`}>
                      {event.status.toUpperCase()}
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="text-lg font-bold text-white mb-1 line-clamp-1">{event.title}</h3>
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs line-clamp-1">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0 border-t border-zinc-850/80 mt-4 flex items-center justify-between gap-3">
                  <button
                    disabled={event.status === 'cancelled'}
                    onClick={() => {
                      if (confirm('Are you sure you want to cancel this event? Buyers will be notified.')) {
                        cancelEventMutation.mutate(event.id);
                      }
                    }}
                    className="p-2 text-zinc-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-950/20 rounded-xl transition-all"
                    title="Cancel Event"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>

                  <button
                    onClick={() => router.push(`/dashboard/${event.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-650 hover:text-white rounded-xl text-xs font-semibold transition-all"
                  >
                    View Analytics
                    <BarChart3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-6">Create New Event</h2>

            <form onSubmit={handleCreateSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Event Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="Tech Summit 2026"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-850 focus:border-indigo-500 rounded-xl text-white outline-none text-sm placeholder-zinc-700 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Banner Image URL</label>
                  <input
                    type="url"
                    placeholder="https://example.com/banner.jpg"
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-850 focus:border-indigo-500 rounded-xl text-white outline-none text-sm placeholder-zinc-700 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Start Date/Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-850 focus:border-indigo-500 rounded-xl text-white outline-none text-sm transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 text-xs font-semibold uppercase tracking-wider mb-2">Location/Venue *</label>
                  <input
                    type="text"
                    required
                    placeholder="San Francisco, CA"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-850 focus:border-indigo-500 rounded-xl text-white outline-none text-sm placeholder-zinc-700 transition-colors"
                  />
                </div>
              </div>

              {/* Dynamic Ticket Tiers */}
              <div className="border-t border-zinc-800 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-indigo-500" />
                    Ticket Tiers
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddTierInput}
                    className="text-xs font-semibold px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg transition-colors flex items-center gap-1"
                  >
                    Add Tier
                  </button>
                </div>

                <div className="space-y-4">
                  {tiers.map((tier, idx) => (
                    <div key={idx} className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-5">
                        <label className="block text-zinc-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Tier Name</label>
                        <input
                          type="text"
                          required
                          value={tier.name}
                          onChange={(e) => handleTierChange(idx, 'name', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg text-white outline-none text-xs"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-zinc-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={tier.price_cents / 100}
                          onChange={(e) => handleTierChange(idx, 'price_cents', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg text-white outline-none text-xs font-mono"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-zinc-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Total Qty</label>
                        <input
                          type="number"
                          required
                          value={tier.total_qty}
                          onChange={(e) => handleTierChange(idx, 'total_qty', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-lg text-white outline-none text-xs font-mono"
                        />
                      </div>

                      <div className="md:col-span-1 flex justify-center">
                        <button
                          type="button"
                          disabled={tiers.length === 1}
                          onClick={() => handleRemoveTierInput(idx)}
                          className="p-2 text-zinc-550 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-950/20 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={createEventMutation.isPending}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50"
              >
                {createEventMutation.isPending ? 'Saving to Database...' : 'Save and Launch Event'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
