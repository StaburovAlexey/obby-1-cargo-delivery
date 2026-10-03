#!/usr/bin/env node
// Graph-aware real-force journeys, both sides of every reached fork.
import { runNetworkJourneys } from './network-journeys.mjs';
const report=await runNetworkJourneys({upgrades:['stock'],checkpoints:false,label:'stock'});
process.exitCode=report.passed?0:1;
