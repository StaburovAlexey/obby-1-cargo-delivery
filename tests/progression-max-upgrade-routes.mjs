#!/usr/bin/env node
// Max tank remains +6%; real path length and base consumption decide reach.
import { runNetworkJourneys } from './network-journeys.mjs';
const report=await runNetworkJourneys({upgrades:['max'],checkpoints:false,label:'max'});
process.exitCode=report.passed?0:1;
