#!/usr/bin/env node
/** Reproducible cleanup proof against the approved, isolated frozen candidate.
 * This file is QA only. The production module has no candidate/test hooks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=new URL('../../',import.meta.url);
const candidateRoot=process.argv[2];
if(!candidateRoot)throw new Error('Usage: node qa/compact-hazard-integration/verify-candidate-equivalence.mjs /absolute/path/to/frozen-candidate');
const candidateFile=pathToFileURL(resolve(candidateRoot,'dist/road-hazards.js'));
const runtimeFile=new URL('dist/road-hazards.js',root);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(candidateFile),'00c9f66ee5469692e1dbc2ae24b1a0a12ff978d2585dfb6952f5768650e90948','Require the exact approved frozen candidate');
const {buildRoadHazards:actual}=await import(runtimeFile);
const {buildRoadHazards:candidate}=await import(candidateFile);
const seeds=[...Array(256).keys(),2026,2027,4294967295,'same','different',null,undefined];
for(const seed of seeds)assert.deepEqual(actual(seed),candidate(seed),`Descriptor mismatch for seed ${seed}`);
const report={generatedAt:new Date().toISOString(),passed:true,seeds:seeds.length,seedScope:'0–255,2026,2027,4294967295,two strings,null,undefined',count:90,moving:10,fullDescriptorAndSeedPhaseEquivalence:true,candidateHash:hash(candidateFile),runtimeHash:hash(runtimeFile),seed42DescriptorHash:createHash('sha256').update(JSON.stringify(actual(42))).digest('hex')};
fs.writeFileSync(new URL('equivalence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`PASS: complete descriptors and phases equal the approved candidate for all ${seeds.length} seed cases.`);
