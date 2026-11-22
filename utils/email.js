/**
 * utils/email.js — Gmail SMTP & Resend API support
 */
const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  // 1. Try Gmail SMTP (Nodemailer)
  const mailer = getTransporter();
  if (mailer) {
    try {
      const fromUser = process.env.EMAIL_USER || 'vexn.co@gmail.com';
      const info = await mailer.sendMail({
        from: `SPPUVault <${fromUser}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html: html || (text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : ''),
        text
      });
      console.log('[Gmail SMTP Success] Email sent:', info.messageId);
      return { success: true, id: info.messageId };
    } catch (err) {
      console.error('[Gmail SMTP Warning]:', err.message);
    }
  }

  // 2. Fallback to Resend REST API if configured
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const fromAddress = process.env.RESEND_FROM || 'SPPUVault <notifications@sppuvault.com>';
    try {
      const payload = {
        from: fromAddress,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || (text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : '')
      };
      if (text) payload.text = text;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        console.log('[Resend Success] Email sent ID:', data.id);
        return { success: true, id: data.id };
      }
    } catch (err) {
      console.error('[Resend Network Error]', err.message);
    }
  }

  console.warn('[Email] Warning: Email could not be sent. Please check EMAIL_USER/EMAIL_PASS or RESEND_API_KEY.');
  return { success: false, error: 'Email service unavailable' };
}

const sendPurchaseEmail = async (studentEmail, studentName, productTitle, amountPaid, orderId) => {
  const isFree = amountPaid === 0;
  const priceDisplay = isFree ? 'Free' : `₹${amountPaid}`;
  const subject = isFree ? `Your Free Material: ${productTitle}` : `Payment Receipt: ${productTitle}`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
      .header { background: #2563eb; padding: 30px 20px; text-align: center; color: white; }
      .header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
      .content { padding: 30px; }
      .details { background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; }
      .details-row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 10px; }
      .details-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
      .label { font-weight: 600; color: #64748b; }
      .value { font-weight: 700; color: #0f172a; text-align: right; }
      .btn-container { text-align: center; margin: 30px 0; }
      .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; }
      .footer { text-align: center; padding: 20px; color: #94a3b8; font-size: 12px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>SPPUVault</h1>
      </div>
      <div class="content">
        <h2>Hi ${studentName},</h2>
        <p>Thank you for your ${isFree ? 'request' : 'purchase'}! Your study material is ready to be accessed.</p>
        <div class="details">
          <div class="details-row"><span class="label">Item</span><span class="value">${productTitle}</span></div>
          <div class="details-row"><span class="label">Amount</span><span class="value">${priceDisplay}</span></div>
          <div class="details-row"><span class="label">Order ID</span><span class="value" style="font-family:monospace;">${orderId || 'FREE_ACCESS'}</span></div>
        </div>
        <div class="btn-container">
          <a href="https://sppuvault.com/my-purchases.html" class="btn">View in My Purchases</a>
        </div>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} SPPUVault. Savitribai Phule Pune University Exam Materials.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  return sendEmail({ to: studentEmail, subject, html });
};

module.exports = {
  sendEmail,
  sendPurchaseEmail
};
