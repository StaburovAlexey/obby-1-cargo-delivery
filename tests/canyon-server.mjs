import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOnlineClient} from '../dist/online-client.js';

// Client scores deliberately no longer carry server attestation. This protects
// the approved deployment from accidentally reintroducing the expensive path.
test('room runtime has no drift verifier or leaderboard computation dependency',()=>{
 const source=readFileSync(new URL('../server/room-server.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/createDriftVerifier|sanitizeDriftRecord|driftLeaderboard|driftRun/);
});
test('online movement client exposes no drift verification RPC',()=>{
 const client=createOnlineClient({url:''});
 for(const name of ['startDriftRun','finishDriftRun','cancelDriftRun'])assert.equal(client[name],undefined);
 client.dispose();
});
