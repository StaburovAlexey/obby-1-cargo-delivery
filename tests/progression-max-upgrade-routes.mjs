#!/usr/bin/env node

import { runNetworkJourneys } from './network-journeys.mjs';
const report=await runNetworkJourneys({upgrades:['max'],checkpoints:false,label:'max'});
process.exitCode=report.passed?0:1;
