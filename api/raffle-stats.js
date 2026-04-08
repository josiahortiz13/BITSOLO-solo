const { kv } = require(’@vercel/kv’);

module.exports = async (req, res) => {
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘GET, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);
res.setHeader(‘Cache-Control’, ‘s-maxage=30, stale-while-revalidate’);

if (req.method === ‘OPTIONS’) return res.status(200).end();

try {
const email = req.query.email;
const total = (await kv.get(‘raffle:count’)) || 0;


let mine = null;
if (email && typeof email === 'string' && email.includes('@')) {
  mine = (await kv.get(`raffle:customer:${email.toLowerCase()}`)) || 0;
}

return res.status(200).json({
  active: process.env.RAFFLE_ACTIVE !== 'false',
  total,
  mine,
  endDate: process.env.RAFFLE_END_DATE || '2026-04-22T23:59:59-05:00',

  prize: {
    name: 'Canaan Avalon Nano3S',
    tagline: 'Plug-and-play Bitcoin miner',
    value: 299
  }
});


} catch (err) {
console.error(‘Raffle stats error:’, err);
return res.status(500).json({ error: ‘Failed to load stats’ });
}
};
