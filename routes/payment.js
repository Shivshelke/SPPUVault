const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { sendPurchaseEmail } = require('../utils/email');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Purchase = require('../models/Purchase');
const Coupon = require('../models/Coupon');
const { requireAuth } = require('../middleware/auth');
const https = require('https');

// Helper to validate and calculate coupon discount
async function validateCoupon(codeStr, product) {
  if (!codeStr || !codeStr.trim()) {
    return { valid: false, error: 'Coupon code is required' };
  }
  const cleanCode = codeStr.trim().toUpperCase();
  const coupon = await Coupon.findOne({ code: cleanCode });
  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code' };
  }
  if (!coupon.isActive) {
    return { valid: false, error: 'This coupon is no longer active' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, error: 'This coupon has expired' };
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, error: 'Coupon usage limit reached' };
  }
  if (coupon.minOrderValue && product.price < coupon.minOrderValue) {
    return { valid: false, error: `Minimum order of ₹${coupon.minOrderValue} required for this coupon` };
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = Math.round((product.price * coupon.discountValue) / 100);
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else {
    discount = Math.round(coupon.discountValue);
  }

  discount = Math.min(product.price, Math.max(0, discount));
  const finalPrice = Math.max(0, product.price - discount);

  return {
    valid: true,
    coupon,
    discount,
    finalPrice,
    code: coupon.code
  };
}

// Native Fetch Razorpay Order Creator (100% Cloudflare Workers & Node Compatible)
async function createRazorpayOrder(options) {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret || key_id === 'rzp_test_placeholder') {
    throw new Error('Razorpay keys not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Environment Variables.');
  }

  const auth = Buffer.from(`${key_id}:${key_secret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(options)
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.description || data?.error?.message || 'Failed to create Razorpay order';
    throw new Error(msg);
  }
  return data;
}

// POST /api/payment/apply-coupon
router.post('/apply-coupon', async (req, res) => {
  try {
    const { productId, couponCode } = req.body;
    if (!productId || !couponCode) {
      return res.status(400).json({ error: 'Product ID and coupon code are required' });
    }

    let product;
    const { ObjectId } = require('../utils/db');
    if (ObjectId.isValid(productId)) {
      product = await Product.findById(productId);
    }
    if (!product) {
      product = await Product.findOne({ slug: productId });
    }
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const result = await validateCoupon(couponCode, product);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      code: result.code,
      discount: result.discount,
      finalPrice: result.finalPrice,
      originalPrice: product.price,
      discountType: result.coupon.discountType,
      discountValue: result.coupon.discountValue
    });
  } catch (err) {
    console.error('Error applying coupon:', err);
    res.status(500).json({ error: 'Failed to apply coupon' });
  }
});

// POST /api/payment/create-order
router.post('/create-order', requireAuth, async (req, res) => {
  try {
    const { productId, couponCode } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID is required' });

    let product;
    const { ObjectId } = require('../utils/db');
    if (ObjectId.isValid(productId)) {
      product = await Product.findById(productId);
    }
    if (!product) {
      product = await Product.findOne({ slug: productId });
    }
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check if user already purchased this product
    const existingPurchase = await Purchase.findOne({ user: req.user._id, product: product._id });
    if (existingPurchase) {
      return res.status(400).json({ error: 'You have already purchased this product' });
    }

    let finalPrice = product.price;
    let appliedCoupon = null;
    let discountAmount = 0;

    if (couponCode && couponCode.trim()) {
      const couponRes = await validateCoupon(couponCode, product);
      if (!couponRes.valid) {
        return res.status(400).json({ error: couponRes.error });
      }
      finalPrice = couponRes.finalPrice;
      appliedCoupon = couponRes.coupon;
      discountAmount = couponRes.discount;
    }

    if (finalPrice === 0) {
      const newPurchase = new Purchase({
        user: req.user._id,
        product: product._id,
        pricePaid: 0,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        purchasedAt: new Date()
      });
      await newPurchase.save();

      if (appliedCoupon) {
        await Coupon.updateOne({ _id: appliedCoupon._id }, { $inc: { usedCount: 1 } });
      }

      // Send email receipt asynchronously
      sendPurchaseEmail(req.user.email, req.user.username, product.title, 0, newPurchase._id).catch(console.error);

      return res.json({
        success: true,
        isFree: true
      });
    }

    // Razorpay amount is in paise (multiply by 100)
    const options = {
      amount: Math.round(finalPrice * 100),
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${String(req.user._id).slice(-8)}`
    };

    const order = await createRazorpayOrder(options);

    // Save pending order to our DB
    const newOrder = await Order.create({
      user: req.user._id,
      items: [{ product: product._id }],
      amount: finalPrice,
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      discount: discountAmount,
      paymentGateway: 'razorpay',
      orderId: order.id,
      status: 'pending'
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error creating order:', error);
    let detail = error?.error?.description || error?.message || 'Failed to create order';
    if (detail === 'Authentication failed') {
      detail = 'Razorpay Authentication Failed: The API Key ID or Key Secret is invalid or expired.';
    }
    res.status(500).json({ error: detail });
  }
});

// POST /api/payment/verify-payment
router.post('/verify-payment', requireAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Signature is valid
      const order = await Order.findOne({ orderId: razorpay_order_id });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      order.paymentId = razorpay_payment_id;
      order.status = 'completed';
      await order.save();

      // Create a Purchase record for each item in the order
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        const prodId = item.product?._id || item.product;
        if (prodId) {
          const purchase = await Purchase.create({
            user: req.user._id,
            product: prodId,
            orderId: order._id || order.id,
            pricePaid: order.amount || 0,
            couponCode: order.couponCode || null,
            purchasedAt: new Date()
          });

          if (order.couponCode) {
            Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } }).catch(console.error);
          }
          
          // Send email receipt asynchronously
          Product.findById(prodId).then(p => {
            if (p) {
              sendPurchaseEmail(req.user.email, req.user.username, p.title, order.amount, purchase._id).catch(console.error);
            }
          }).catch(console.error);
        }
      }

      return res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      console.warn('[Verify Payment] Signature mismatch:', { expectedSignature, razorpay_signature });
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// GET /api/payment/my-purchases
router.get('/my-purchases', requireAuth, async (req, res) => {
  try {
    const rawPurchases = await Purchase.find({ user: req.user._id }).sort({ createdAt: -1, purchasedAt: -1 });
    const productIds = rawPurchases.map(p => p.product).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } });
    const productMap = new Map();
    products.forEach(p => productMap.set(String(p._id), p));

    const purchases = rawPurchases.map(p => {
      const prod = productMap.get(String(p.product)) || null;
      return {
        ...p,
        product: prod,
        purchasedAt: p.purchasedAt || p.createdAt || new Date()
      };
    });
    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// GET /api/payment/stream/:productId
// Securely streams or redirects to the PDF if the user has bought it
router.get('/stream/:productId', requireAuth, async (req, res) => {
  try {
    const { toObjectId } = require('../utils/db');
    const targetId = toObjectId(req.params.productId);
    const purchase = await Purchase.findOne({
      user: req.user._id,
      $or: [{ product: targetId }, { product: req.params.productId }]
    });
    if (!purchase) {
      return res.status(403).json({ error: 'Unauthorized. You have not purchased this item.' });
    }

    const product = await Product.findById(req.params.productId) || await Product.findOne({ slug: req.params.productId });
    if (!product || !product.pdfUrl) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const pdfUrl = product.pdfUrl;
    if (pdfUrl.includes('drive.google.com')) {
      return res.redirect(pdfUrl);
    }

    let downloadUrl = pdfUrl;
    if (pdfUrl.includes('/upload/') && !pdfUrl.includes('/fl_attachment')) {
      const safeTitle = (product.title || 'premium_material').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadUrl = pdfUrl.replace('/upload/', `/upload/fl_attachment:${encodeURIComponent(safeTitle)}/`);
    }

    return res.redirect(302, downloadUrl);
  } catch (error) {
    console.error('Error streaming PDF:', error);
    res.status(500).json({ error: 'Failed to load PDF' });
  }
});

// POST /api/payment/webhook
// This receives Razorpay server-to-server notifications
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      console.error('Webhook failed: RAZORPAY_WEBHOOK_SECRET not configured in .env');
      return res.status(500).send('Webhook secret not configured');
    }

    // req.body is a Buffer here because we used express.raw() in server.js
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.warn('Webhook signature mismatch');
      return res.status(400).send('Invalid signature');
    }

    // Parse the raw body to JSON
    const payload = JSON.parse(req.body.toString());

    if (payload.event === 'payment.captured') {
      const payment = payload.payload.payment.entity;
      const orderId = payment.order_id;
      
      if (orderId) {
        const order = await Order.findOne({ orderId: orderId });
        if (order && order.status !== 'completed') {
          // Verify payment in case frontend closed before completing
          order.paymentId = payment.id;
          order.status = 'completed';
          await order.save();

          for (const item of order.items) {
            if (item.product) {
              const existingPurchase = await Purchase.findOne({ user: order.user, product: item.product });
              if (!existingPurchase) {
                const purchase = new Purchase({
                  user: order.user,
                  product: item.product,
                  orderId: order.id,
                  pricePaid: order.amount
                });
                await purchase.save();
              }
            }
          }
          console.log(`Webhook: Successfully processed payment for order ${orderId}`);
        }
      }
    }
    
    // Always return 200 OK so Razorpay doesn't retry
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
