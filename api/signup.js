const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, phone, source } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const key = email.toLowerCase().trim();
    const existing = await kv.hget('leads:all', key);

    const lead = {
      name: name || '',
      email: key,
      phone: phone || '',
      source: source || 'website',
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.hset('leads:all', { [key]: lead });
    if (!existing) {
      await kv.lpush('leads:log', JSON.stringify(lead));
      await kv.incr('leads:count');
    }

    // Apollo integration — add APOLLO_API_KEY to Vercel env vars to enable
    if (process.env.APOLLO_API_KEY) {
      try {
        const firstName = (name || '').split(' ')[0];
        const lastName = (name || '').split(' ').slice(1).join(' ');
        await fetch('https://api.apollo.io/api/v1/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': process.env.APOLLO_API_KEY,
          },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email: key,
            phone_numbers: phone ? [{ raw_number: phone }] : [],
            label_names: [source || 'website'],
          }),
        });
      } catch (err) {
        console.error('Apollo sync error:', err.message);
      }
    }

    return res.status(200).json({ success: true, isNew: !existing });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
};
