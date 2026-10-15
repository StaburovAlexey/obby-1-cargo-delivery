#!/usr/bin/env node

import { runNetworkJourneys } from './network-journeys.mjs';
const report=await runNetworkJourneys({upgrades:['stock'],checkpoints:false,label:'stock'});
process.exitCode=report.passed?0:1;
