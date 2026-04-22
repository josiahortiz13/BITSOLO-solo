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

    // Klaviyo integration — add KLAVIYO_API_KEY to Vercel env vars to enable
    if (process.env.KLAVIYO_API_KEY) {
      try {
        await fetch('https://a.klaviyo.com/api/profiles/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
            'revision': '2024-02-15',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: {
              type: 'profile',
              attributes: {
                email: key,
                first_name: name || '',
                phone_number: phone || '',
                properties: { source: source || 'website' },
              },
            },
          }),
        });
      } catch (err) {
        console.error('Klaviyo sync error:', err.message);
      }
    }

    return res.status(200).json({ success: true, isNew: !existing });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Signup failed' });
  }
};
