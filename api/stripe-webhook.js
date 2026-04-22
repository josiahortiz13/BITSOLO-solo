const Stripe = require(‘stripe’);
const { kv } = require(’@vercel/kv’);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Vercel needs the raw body for Stripe signature verification
async function buffer(readable) {
const chunks = [];
for await (const chunk of readable) {
chunks.push(typeof chunk === ‘string’ ? Buffer.from(chunk) : chunk);
}
return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
if (req.method !== ‘POST’) {
return res.status(405).json({ error: ‘Method not allowed’ });
}

const sig = req.headers[‘stripe-signature’];
let event;

try {
const rawBody = await buffer(req);
event = stripe.webhooks.constructEvent(
rawBody,
sig,
process.env.STRIPE_WEBHOOK_SECRET
);
} catch (err) {
console.error(‘Webhook signature verification failed:’, err.message);
return res.status(400).send(`Webhook Error: ${err.message}`);
}

// Only act on successful checkouts
if (event.type === ‘checkout.session.completed’) {
const session = event.data.object;
const sessionId = session.id;
const email = (session.customer_details && session.customer_details.email)
|| session.customer_email
|| null;
const name = (session.customer_details && session.customer_details.name) || null;

if (!email) {
  console.log('No email on session, skipping raffle entry');
  return res.status(200).json({ received: true });
}

try {
  // Idempotency: skip if this session was already processed
  const existing = await kv.hget('raffle:orders', sessionId);
  if (existing) {
    console.log('Session already has raffle entry:', sessionId);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Fetch line items to count miner units (every product in BitSolo is a miner)
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 100
  });

  let units = 0;
  for (const item of lineItems.data) {
    units += item.quantity || 0;
  }

  if (units <= 0) {
    return res.status(200).json({ received: true, entries: 0 });
  }

  // 1 entry per miner unit
  const entries = units;

  const record = {
    email,
    name,
    sessionId,
    units,
    entries,
    amountTotal: session.amount_total,
    createdAt: new Date().toISOString()
  };

  // Store everything
  await kv.hset('raffle:orders', { [sessionId]: record });
  await kv.lpush('raffle:entries-log', JSON.stringify(record));
  await kv.incrby('raffle:count', entries);
  await kv.incrby(`raffle:customer:${email.toLowerCase()}`, entries);

  console.log(`Raffle: +${entries} entries for ${email}`);
} catch (err) {
  console.error('Failed to record raffle entry:', err);
  // Don't fail the webhook — Stripe will retry otherwise
}

}

return res.status(200).json({ received: true });
};

// Disable Vercel’s default body parser so we can verify the Stripe signature
module.exports.config = {
api: {
bodyParser: false
}
};
