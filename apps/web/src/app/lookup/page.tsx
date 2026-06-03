'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Ticket, Calendar, MapPin, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface TicketItem {
  id: string;
  event_title: string;
  start_at: string;
  location: string;
  tier_name: string;
  status: 'UNUSED' | 'USED' | 'CANCELLED';
  qr_payload: string;
}

export default function TicketLookupPage() {
  const [emailInput, setEmailInput] = useState('');
  const [searchEmail, setSearchEmail] = useState('');

  const { data, isLoading, error, refetch } = useQuery<{ tickets: TicketItem[] }>({
    queryKey: ['tickets', searchEmail],
    queryFn: async () => {
      if (!searchEmail) return { tickets: [] };
      const res = await fetch(`http://localhost:5000/api/tickets/buyer?email=${encodeURIComponent(searchEmail.trim())}`);
      if (!res.ok) throw new Error('Failed to fetch tickets');
      return res.json();
    },
    enabled: !!searchEmail,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) {
      setSearchEmail(emailInput.trim());
    }
  };

  const tickets = data?.tickets || [];

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center max-w-xl mx-auto mb-12">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Retrieve Your Tickets</h1>
        <p className="text-zinc-400 text-sm">Enter the email address used during purchase to fetch your entry passes and QR codes.</p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="max-w-md mx-auto flex gap-3 mb-12">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="email"
            required
            placeholder="buyer@gmail.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 rounded-xl text-white outline-none text-sm transition-colors placeholder-zinc-650"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 shrink-0"
        >
          Search
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-t-2 border-indigo-500 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-400 text-center text-sm max-w-md mx-auto">
          Failed to load tickets. Ensure the database and API are running.
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && searchEmail && tickets.length === 0 && (
        <div className="text-center py-16 bg-zinc-900/10 border border-zinc-900 rounded-2xl p-8 max-w-md mx-auto">
          <Ticket className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-1">No Tickets Found</h3>
          <p className="text-zinc-500 text-xs">Ensure the email matches what you registered during checkout, or try running the database seeder.</p>
        </div>
      )}

      {!isLoading && !error && tickets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tickets.map((ticket) => {
            const dateStr = new Date(ticket.start_at).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div
                key={ticket.id}
                className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden p-6 flex flex-col justify-between"
              >
                <div>
                  {/* Header Status */}
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-mono text-zinc-500 uppercase">TICKET PASS</span>
                    {ticket.status === 'UNUSED' && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        UNUSED
                      </span>
                    )}
                    {ticket.status === 'USED' && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        USED
                      </span>
                    )}
                    {ticket.status === 'CANCELLED' && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                        <XCircle className="w-3.5 h-3.5" />
                        CANCELLED
                      </span>
                    )}
                  </div>

                  {/* Body Event Details */}
                  <h3 className="text-xl font-bold text-white mb-2 leading-tight">{ticket.event_title}</h3>
                  <p className="text-indigo-400 font-bold text-xs uppercase tracking-wider mb-4">{ticket.tier_name}</p>

                  <div className="space-y-2 text-zinc-400 text-xs mb-6 font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span>{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="line-clamp-1">{ticket.location}</span>
                    </div>
                  </div>
                </div>

                {/* QR Section */}
                <div className="border-t border-zinc-800/80 pt-6 flex flex-col items-center">
                  <div className="bg-white p-2 rounded-lg mb-3 shadow-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(ticket.qr_payload)}`}
                      alt="Ticket QR"
                      className="w-32 h-32"
                    />
                  </div>
                  <span className="text-[10px] text-zinc-600 font-mono break-all text-center max-w-xs">{ticket.id}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
