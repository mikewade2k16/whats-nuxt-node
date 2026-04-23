const http = require('http');

async function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', (e) => reject(e));
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTest(email, password) {
  console.log(`\nTesting user: ${email}`);
  
  // 1. Login
  const loginData = JSON.stringify({ email, password });
  const loginRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/core-bff/core/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  }, loginData);

  if (loginRes.statusCode !== 200) {
    console.error(`Login failed: ${loginRes.statusCode} - ${loginRes.body}`);
    return;
  }

  const coreCookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';
  console.log(`Login status: ${loginRes.statusCode}`);

  // 2. Queue session
  const sessionRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/modules/fila-atendimento/session',
    method: 'POST',
    headers: {
      'Cookie': coreCookie
    }
  });

  if (sessionRes.statusCode !== 200 && sessionRes.statusCode !== 201) {
    console.error(`Session failed: ${sessionRes.statusCode} - ${sessionRes.body}`);
    return;
  }

  const sessionCookies = sessionRes.headers['set-cookie'] ? sessionRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';
  const combinedCookie = [coreCookie, sessionCookies].filter(Boolean).join('; ');
  console.log(`Session status: ${sessionRes.statusCode}`);

  // 3. Get stores
  const storesRes = await request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/admin/modules/fila-atendimento/stores',
    method: 'GET',
    headers: {
      'Cookie': combinedCookie
    }
  });

  console.log(`Stores Status: ${storesRes.statusCode}`);
  if (storesRes.statusCode === 200) {
    const stores = JSON.parse(storesRes.body);
    console.log(`Found stores: ${JSON.stringify(stores)}`); // (', ')}`);
  } else {
    console.error(`Get stores failed: ${storesRes.body}`);
  }
}

async function main() {
  const password = 'Perola@2026!';
  await runTest('talia.st10@hotmail.com', password);
  await runTest('days.matos@gmail.com', password);
}

main().catch(console.error);
