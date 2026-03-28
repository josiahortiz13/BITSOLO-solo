const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  'bitaxe-gamma-601': { name: 'Bitaxe Gamma 601', price: 9900 },
  'bitaxe-gt': { name: 'Bitaxe GT', price: 24900 },
  'bitaxe-supra-hex': { name: 'Bitaxe Supra Hex', price: 34900 },
  'nerdqaxe-plus-plus': { name: 'NerdQaxe++', price: 39900 },
  'canaan-nano3s': { name: 'Canaan Nano3S', price: 29900 },
  'canaan-avalon-q': { name: 'Canaan Avalon Q', price: 188800 },
  'nerdoctaxe': { name: 'NerdOctaxe', price: 74900 },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items, customerEmail } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items' });

    const line_items = items.map(item => {
      const product = PRODUCTS[item.id];
      if (!product) throw new Error('Unknown product: ' + item.id);
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: product.price,
        },
        quantity: item.quantity || 1,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency: 'usd' },
          display_name: 'Free Domestic Shipping',
          delivery_estimate: {
            minimum: { unit: 'business_day', value: 3 },
            maximum: { unit: 'business_day', value: 7 },
          },
        },
      }],
      customer_email: customerEmail || undefined,
      success_url: (req.headers.origin || 'https://bitsolo.co') + '?status=success',
      cancel_url: (req.headers.origin || 'https://bitsolo.co') + '?status=cancelled',
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
