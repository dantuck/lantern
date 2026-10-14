// Makes the key pair for the optional "time is up" push alerts (VAPID, RFC 8292). Nothing is sent anywhere: the keys are made on this
// machine and printed once. Put them on the Worker with `npx wrangler secret put`, as the setup guide shows.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const b64u = (s) => Buffer.from(s, 'base64url');
// The public key as browsers want it: 0x04, then the point's x and y.
const publicKey = Buffer.concat([Buffer.from([4]), b64u(jwk.x), b64u(jwk.y)]).toString('base64url');

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('\nKeep the private key secret. Set both on your Worker, pasting each value when asked:');
console.log('  npx wrangler secret put VAPID_PUBLIC_KEY');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY');
console.log('\nThen make sure wrangler.jsonc has the schedule (see docs/setup-guide.md) and deploy again.');
