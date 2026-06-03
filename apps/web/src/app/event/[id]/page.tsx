'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Calendar, MapPin, Ticket, ShieldCheck, Mail, CreditCard, ChevronRight, Users, Clock, AlertCircle } from 'lucide-react';

interface TicketTier {
  id: string;
  name: string;
  price_cents: number;
  total_qty: number;
  sold_qty: number;
}

interface EventDetails {
  event: {
    id: string;
    title: string;
    banner_url: string;
    start_at: string;
    location: string;
    status: 'active' | 'cancelled';
  };
  tiers: TicketTier[];
}

export default function EventPage() {
  const { id: eventId } = useParams();
  const router = useRouter();

  // State Management
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Select Tier/Qty, 2: Checkout Form, 3: Success Ticket
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [email, setEmail] = useState<string>('');
  
  // Payment States
  const [paymentIntentId, setPaymentIntentId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isMockStripe, setIsMockStripe] = useState(true);

  // Queue States
  const [isQueuing, setIsQueuing] = useState(false);
  const [queueStatus, setQueueStatus] = useState<'waiting' | 'active' | 'error'>('waiting');
  const [queueToken, setQueueToken] = useState<string>('');
  const [purchaseToken, setPurchaseToken] = useState<string>('');
  const [queuePosition, setQueuePosition] = useState<number>(0);
  const [totalQueue, setTotalQueue] = useState<number>(0);
  const [queueMessage, setQueueMessage] = useState<string>('');

  // Ticket Result
  const [purchasedTickets, setPurchasedTickets] = useState<any[]>([]);

  // Fetch Event & Tiers
  const { data, isLoading, error } = useQuery<EventDetails>({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const res = await fetch(`http://localhost:5000/api/events/${eventId}`);
      if (!res.ok) throw new Error('Event not found');
      return res.json();
    },
  });

  const event = data?.event;
  const tiers = data?.tiers || [];
  const selectedTier = tiers.find(t => t.id === selectedTierId);

  // Calculate total event capacity to check if we trigger the queue system
  const totalCapacity = tiers.reduce((acc, tier) => acc + tier.total_qty, 0);
  const requiresQueue = totalCapacity >= 1000;

  // 1. Join Queue Mutation
  const joinQueueMutation = useMutation({
    mutationFn: async (buyerEmail: string) => {
      const res = await fetch('http://localhost:5000/api/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, email: buyerEmail }),
      });
      if (!res.ok) throw new Error('Failed to join queue');
      return res.json();
    },
    onSuccess: (data) => {
      setQueueToken(data.queueToken);
      setQueuePosition(data.position);
      setIsQueuing(true);
      setQueueStatus('waiting');
    }
  });

  // Polling Queue Status
  useEffect(() => {
    if (!isQueuing || !queueToken) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/queue/status/${queueToken}`);
        const data = await res.json();

        if (data.status === 'active') {
          setQueueStatus('active');
          setPurchaseToken(data.purchaseToken);
          setIsQueuing(false); // Done queuing
          clearInterval(interval);
          
          // Proceed to initiate payment
          initiatePayment(data.purchaseToken);
        } else {
          setQueuePosition(data.position);
          setTotalQueue(data.totalQueue);
          setQueueMessage(data.message);
        }
      } catch (err) {
        console.error('Error polling queue status:', err);
        setQueueStatus('error');
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isQueuing, queueToken]);

  // 2. Initiate Payment Intent
  const initiatePayment = async (qToken?: string) => {
    setIsProcessingPayment(true);
    try {
      const res = await fetch('http://localhost:5000/api/checkout/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier_id: selectedTierId,
          qty: quantity,
          buyer_email: email,
          queue_token: qToken || purchaseToken
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Checkout initiation failed');
      }

      setPaymentIntentId(data.paymentIntentId);
      setClientSecret(data.clientSecret);
      setIsMockStripe(data.isMock);
      setStep(2); // Proceed to payment card details screen

    } catch (err: any) {
      alert(err.message || 'Payment initiation failed');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleProceedToPayment = () => {
    if (!selectedTierId) {
      alert('Please select a ticket tier');
      return;
    }
    if (!email) {
      alert('Please enter your email');
      return;
    }

    if (requiresQueue && !purchaseToken) {
      // Must join the queue first
      joinQueueMutation.mutate(email);
    } else {
      // Skip queue and checkout directly
      initiatePayment();
    }
  };

  // 3. Confirm Checkout (Simulated Webhook execution)
  const handleConfirmPurchase = async () => {
    setIsProcessingPayment(true);
    try {
      // Simulate calling the Stripe success webhook on the backend
      const res = await fetch('http://localhost:5000/api/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: paymentIntentId,
          metadata: {
            tier_id: selectedTierId,
            qty: quantity.toString(),
            buyer_email: email,
            event_id: eventId
          }
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to confirm purchase');
      }

      setPurchasedTickets(data.tickets || []);
      setStep(3); // Show success screen with ticket QR codes

    } catch (err: any) {
      alert(err.message || 'Payment confirmation failed');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-red-400">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold">Event Not Found</h2>
          <p className="text-zinc-500 text-sm mt-1">Please verify the URL or event ID.</p>
        </div>
      </div>
    );
  }

  const formattedDate = new Date(event.start_at).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12">
      {/* Event Cancelled Alert */}
      {event.status === 'cancelled' && (
        <div className="mb-8 p-4 rounded-xl bg-red-950/20 border border-red-900/40 text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>This event has been cancelled by the organizer. Ticket sales are disabled.</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Event Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="relative h-64 sm:h-96 rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-900 shadow-2xl">
            <img
              src={event.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&auto=format&fit=crop&q=60'}
              alt={event.title}
              className="w-full h-full object-cover opacity-90"
            />
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-900">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight leading-tight">{event.title}</h1>
            
            <div className="space-y-3.5 mb-6 text-zinc-300">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-indigo-400 shrink-0" />
                <span className="text-sm sm:text-base">{formattedDate}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-indigo-400 shrink-0" />
                <span className="text-sm sm:text-base">{event.location}</span>
              </div>
              {requiresQueue && (
                <div className="flex items-center gap-3 text-amber-400 font-medium">
                  <Users className="w-5 h-5 shrink-0" />
                  <span className="text-sm">High-demand launch: Active queue system enabled</span>
                </div>
              )}
            </div>
            
            <h3 className="text-lg font-bold text-white mb-2">About this event</h3>
            <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
              Join us for an unforgettable experience. Gatepass handles your checkout seamlessly using exclusive database row locking to protect your transaction against double-booking race conditions.
            </p>
          </div>
        </div>

        {/* Right Side: Checkout Wizard */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl glass-premium border border-zinc-800 p-6 shadow-2xl relative overflow-hidden">
            {/* Queue Waiting Room Overlay */}
            {isQueuing && (
              <div className="absolute inset-0 bg-zinc-950/95 z-40 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-6 animate-pulse">
                  <Clock className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">You are in the Queue</h3>
                <p className="text-zinc-400 text-sm mb-4">We are processing checkouts sequentially to protect server state.</p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-4 mb-6">
                  <span className="text-3xl font-mono font-bold text-indigo-400">#{queuePosition}</span>
                  <p className="text-xs text-zinc-500 mt-1 font-mono">Your rank in line</p>
                </div>
                <p className="text-xs text-zinc-500 animate-pulse">Please do not close or refresh this page. Polling every 3s...</p>
              </div>
            )}

            {/* Step 1: Select Tiers */}
            {step === 1 && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-indigo-500" />
                  Select Tickets
                </h3>

                <div className="space-y-3">
                  {tiers.map((tier) => {
                    const isSoldOut = tier.sold_qty >= tier.total_qty;
                    const remaining = tier.total_qty - tier.sold_qty;

                    return (
                      <button
                        key={tier.id}
                        disabled={isSoldOut || event.status === 'cancelled'}
                        onClick={() => setSelectedTierId(tier.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          selectedTierId === tier.id
                            ? 'bg-indigo-600/15 border-indigo-500 text-white'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        } ${isSoldOut ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="font-bold text-sm sm:text-base">{tier.name}</span>
                          <span className="font-mono font-extrabold text-sm sm:text-base text-indigo-400">
                            ${(tier.price_cents / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-zinc-500">
                          <span>{isSoldOut ? 'Sold Out' : `${remaining} tickets remaining`}</span>
                          {selectedTierId === tier.id && <span className="text-indigo-400 font-semibold">SELECTED</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedTierId && (
                  <div>
                    <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Quantity</label>
                    <select
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                    >
                      {[1, 2, 3, 4, 5].map((q) => (
                        <option key={q} value={q}>
                          {q} Ticket{q > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Your Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      required
                      placeholder="buyer@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-white outline-none focus:border-indigo-500 text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={handleProceedToPayment}
                  disabled={!selectedTierId || !email || event.status === 'cancelled' || joinQueueMutation.isPending || isProcessingPayment}
                  className="w-full flex items-center justify-center gap-1.5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 shadow-lg hover:shadow-indigo-500/20"
                >
                  {joinQueueMutation.isPending || isProcessingPayment ? 'Processing...' : 'Proceed to Checkout'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 2: Payment Details (Stripe Simulation) */}
            {step === 2 && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-500" />
                  Stripe Payment
                </h3>

                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 space-y-2">
                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>{selectedTier?.name} &times; {quantity}</span>
                    <span>${(((selectedTier?.price_cents || 0) * quantity) / 100).toFixed(2)}</span>
                  </div>
                  <hr className="border-zinc-800" />
                  <div className="flex justify-between font-bold text-white text-base">
                    <span>Total Cost</span>
                    <span className="text-indigo-400">${(((selectedTier?.price_cents || 0) * quantity) / 100).toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-zinc-400 text-xs font-semibold uppercase tracking-wider">Card Details (Stripe Elements)</label>
                  
                  {/* Beautiful Mock Stripe Card Input */}
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-zinc-500" />
                    <span className="text-zinc-500 font-mono text-sm tracking-widest flex-1">•••• •••• •••• 4242</span>
                    <span className="text-zinc-500 font-mono text-sm">12 / 28</span>
                  </div>

                  <div className="flex items-start gap-2 bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-3">
                    <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-indigo-300 leading-normal">
                      Security Sandbox: Stripe Webhook confirmation will trigger exclusive pg row locks to confirm inventory allocation atomically.
                    </p>
                  </div>

                  <button
                    onClick={handleConfirmPurchase}
                    disabled={isProcessingPayment}
                    className="w-full flex items-center justify-center gap-1.5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-emerald-500/20"
                  >
                    {isProcessingPayment ? 'Locking Tickets...' : 'Simulate Stripe Success'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Success Screen with QR Code */}
            {step === 3 && (
              <div className="space-y-6 text-center">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-white">Booking Confirmed!</h3>
                  <p className="text-zinc-400 text-sm mt-1">Your tickets are locked and registered. We sent a QR copy to <strong className="text-zinc-200 font-mono">{email}</strong>.</p>
                </div>

                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                  {purchasedTickets.map((ticket, idx) => (
                    <div key={ticket.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col items-center">
                      <span className="text-xs text-zinc-500 font-mono mb-2">TICKET {idx + 1} OF {purchasedTickets.length}</span>
                      
                      {/* Dynamic QR Code Render (Using an online QR generator since payloads are verified cryptographically) */}
                      <div className="bg-white p-2 rounded-lg mb-2">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(ticket.qr_payload)}`}
                          alt="Ticket QR Code"
                          className="w-32 h-32"
                        />
                      </div>
                      
                      <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider">{selectedTier?.name}</span>
                      <span className="text-[10px] text-zinc-600 font-mono mt-1 break-all select-all">{ticket.id}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setStep(1);
                    setSelectedTierId('');
                    setEmail('');
                    setQuantity(1);
                    setPurchasedTickets([]);
                    setPurchaseToken('');
                  }}
                  className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Buy More Tickets
                </button>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
