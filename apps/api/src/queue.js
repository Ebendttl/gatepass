const Queue = require('bull');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
require('dotenv').config();

// Initialize the email queue with Redis URL
const emailQueue = new Queue('email-delivery', process.env.REDIS_URL || 'redis://localhost:6379');

// Helper to send email using Resend API
async function sendViaResend(to, subject, html, base64Qr) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'tickets@gatepass.com';
  
  if (!apiKey || apiKey.startsWith('re_mock')) {
    throw new Error('Resend API key not configured or mock');
  }

  // Resend API request
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from,
      to: [to],
      subject: subject,
      html: html,
      attachments: [
        {
          filename: 'ticket-qr.png',
          content: base64Qr.split(',')[1],
          encoding: 'base64',
          cid: 'qrcode',
        }
      ]
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API failed: ${response.statusText} - ${errorBody}`);
  }

  return await response.json();
}

// Helper to send email using Nodemailer (SMTP)
async function sendViaSmtp(to, subject, html, base64Qr) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || 'tickets@gatepass.com';

  if (!host || !user || user.startsWith('mock')) {
    throw new Error('SMTP not configured or mock');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    attachments: [
      {
        filename: 'ticket-qr.png',
        path: base64Qr,
        cid: 'qrcode',
      }
    ]
  });
}

// Bull Process Queue
emailQueue.process(async (job) => {
  const { buyer_email, event_title, event_start_at, event_location, ticket_id, qr_payload, tier_name } = job.data;
  console.log(`[Queue] Processing email ticket job for ${buyer_email} (Ticket ID: ${ticket_id})`);

  try {
    // 1. Generate base64 QR Code
    const base64Qr = await QRCode.toDataURL(qr_payload, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 1,
    });

    // 2. Format HTML
    const formattedDate = new Date(event_start_at).toLocaleString();
    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h1 style="color: #4f46e5; margin-bottom: 5px;">Your Ticket is Confirmed!</h1>
        <p style="color: #4b5563; font-size: 16px; margin-top: 0;">Thanks for your purchase. Here are your event access details.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0; color: #1f2937;">${event_title}</h2>
          <p style="margin: 5px 0; color: #4b5563;"><strong>Date/Time:</strong> ${formattedDate}</p>
          <p style="margin: 5px 0; color: #4b5563;"><strong>Location:</strong> ${event_location}</p>
          <p style="margin: 5px 0; color: #4b5563;"><strong>Ticket Tier:</strong> ${tier_name}</p>
          <p style="margin: 5px 0; color: #4b5563;"><strong>Ticket ID:</strong> ${ticket_id}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <p style="color: #4b5563; font-size: 14px; margin-bottom: 10px;">Please show this QR code at the entrance to scan:</p>
          <img src="cid:qrcode" alt="Ticket QR Code" style="border: 2px solid #1f2937; border-radius: 6px; width: 200px; height: 200px;" />
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">Gatepass Ticketing Platform. Secured with HMAC verification.</p>
      </div>
    `;

    const subject = `Your ticket for ${event_title}`;

    // 3. Send Email (with fallback hierarchy)
    try {
      await sendViaResend(buyer_email, subject, htmlContent, base64Qr);
      console.log(`[Queue] Email sent successfully via Resend API to ${buyer_email}`);
    } catch (resendErr) {
      // Fallback to SMTP
      try {
        await sendViaSmtp(buyer_email, subject, htmlContent, base64Qr);
        console.log(`[Queue] Email sent successfully via SMTP to ${buyer_email}`);
      } catch (smtpErr) {
        // Fallback to Console log mockup (useful for testing)
        console.log('\n================ MOCK EMAIL DELIVERY ================\n');
        console.log(`To: ${buyer_email}`);
        console.log(`Subject: ${subject}`);
        console.log(`Event Details: ${event_title} | ${formattedDate} | ${event_location}`);
        console.log(`Tier: ${tier_name} | Ticket ID: ${ticket_id}`);
        console.log(`HMAC Signature QR Payload: ${qr_payload}`);
        console.log(`QR Code image size: ${base64Qr.length} chars (base64 PNG)`);
        console.log('\n=======================================================\n');
      }
    }
  } catch (error) {
    console.error(`[Queue] Error processing ticket email for ${buyer_email}:`, error);
    throw error; // Let Bull retry the job if it fails
  }
});

module.exports = emailQueue;
