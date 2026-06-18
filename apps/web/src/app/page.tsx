'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Calendar, MapPin, Search, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';
import { useState } from 'react';
import { API_URL } from '@/config';

interface Event {
  id: string;
  title: string;
  banner_url: string;
  start_at: string;
  location: string;
  status: 'active' | 'cancelled';
  organizer_email: string;
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch active events from Express backend
  const { data, isLoading, error } = useQuery<{ events: Event[] }>({
    queryKey: ['events'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/events`);
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
  });

  const events = data?.events || [];

  // Filter events based on search input
  const filteredEvents = events.filter((event) =>
    event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col">
      {/* Premium Hero Section */}
      <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8 border-b border-zinc-900 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.15),rgba(255,255,255,0))]">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono mb-6 animate-pulse">
            <Activity className="w-3.5 h-3.5" />
            V2.0 RELEASED — SCALE ARCHITECTURE
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Ticketing Built for{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
              High-Demand Launches
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Eliminate overselling with robust PostgreSQL row-level locks, protect ticket authenticity with HMAC QR signatures, and manage high-traffic launches seamlessly.
          </p>

          {/* Search bar */}
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search events, cities, venues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-zinc-900/60 border border-zinc-800 focus:border-indigo-500 rounded-xl text-white outline-none placeholder-zinc-500 transition-colors focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
        </div>
      </section>

      {/* Events Listing */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex-1 w-full">
        <h2 className="text-2xl font-bold mb-8 text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-500" />
          Featured Live Events
        </h2>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-96 rounded-2xl bg-zinc-900/50 animate-pulse border border-zinc-800" />
            ))}
          </div>
        )}

        {error && (
          <div className="p-6 rounded-xl bg-red-950/20 border border-red-900/30 text-center text-red-400 max-w-md mx-auto">
            <p>Failed to load events. Ensure the backend API is running.</p>
          </div>
        )}

        {!isLoading && !error && filteredEvents.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-lg">No events found matching your search.</p>
          </div>
        )}

        {!isLoading && !error && filteredEvents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => {
              const eventDate = new Date(event.start_at).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });

              return (
                <div
                  key={event.id}
                  className="group flex flex-col bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl overflow-hidden hover:scale-[1.01] transition-all hover:shadow-xl hover:shadow-black/40"
                >
                  {/* Event Banner */}
                  <div className="relative h-48 bg-zinc-950 overflow-hidden">
                    <img
                      src={event.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&auto=format&fit=crop&q=60'}
                      alt={event.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100"
                    />
                    <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/90 text-white shadow-lg">
                      {event.status === 'active' ? 'ON SALE' : 'CANCELLED'}
                    </div>
                  </div>

                  {/* Event Content */}
                  <div className="p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
                        <Calendar className="w-4 h-4 text-zinc-500 shrink-0" />
                        <span>{eventDate}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-400 text-sm mb-4">
                        <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
                        <span className="line-clamp-1">{event.location}</span>
                      </div>
                    </div>

                    <Link
                      href={`/event/${event.id}`}
                      className="w-full mt-4 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-800 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-all group-hover:bg-zinc-800/80 group-hover:hover:bg-indigo-600"
                    >
                      Get Tickets
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Feature Pillar Section */}
      <section className="bg-zinc-950 border-t border-zinc-900 py-16 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 w-fit rounded-xl text-indigo-400 mb-4">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Zero Overselling</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              PostgreSQL row-level locking handles inventory decrement atomically. No double sales or ticket overlaps.
            </p>
          </div>
          
          <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900">
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 w-fit rounded-xl text-purple-400 mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">HMAC Cryptography</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Every QR payload is cryptographically signed using a unique server secret, entirely blocking counterfeit ticket injection.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/20 border border-zinc-900">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 w-fit rounded-xl text-emerald-400 mb-4">
              <Activity className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Sorted-Set Queueing</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              High-traffic ticket drops are managed by Redis. Buyers poll their rank in line and get structured checkout windows.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
