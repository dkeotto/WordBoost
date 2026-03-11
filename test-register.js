const base = process.argv[2] || 'https://wordboost.up.railway.app';

async function test() {
  // 1) Health check
  console.log('1) Health check:', base + '/api/health');
  try {
    const c1 = new AbortController();
    setTimeout(() => c1.abort(), 15000);
    const r = await fetch(base + '/api/health', { signal: c1.signal });
    const h = await r.json();
    console.log('   ', JSON.stringify(h));
  } catch (e) {
    console.log('   Hata:', e.message);
    return;
  }

  // 2) Register
  const username = 'testbot' + Date.now();
  const body = JSON.stringify({
    username,
    email: username + '@example.com',
    password: 'TestPass123!'
  });
  console.log('\n2) POST /api/register');
  try {
    const r = await fetch(base + '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 60000); return c.signal })()
    });
    const d = await r.json();
    console.log('   Status:', r.status);
    console.log('   Body:', JSON.stringify(d, null, 2));
    if (d.success) console.log('\n=> Kayıt OK. requireVerification:', d.requireVerification);
    if (d.error) console.log('\n=> Hata:', d.error);
  } catch (e) {
    console.log('   Hata:', e.message);
  }
}

test();
