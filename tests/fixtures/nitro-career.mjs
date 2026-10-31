import {freshCareer} from '../../dist/career-save.js';
import {FINAL_DELIVERY_CHECKPOINT,ROUTE_COMPLETION_PROOF} from '../../dist/economy-config.js';
import {FINISH_LINE_SPEC} from '../../dist/finish-line.js';
import {BRIDGES} from '../../dist/road-bridges.js';
export const nitroCareer=()=>({...freshCareer(),money:100000,brains:10000,completedRuns:1,routeCompletion:{version:1,proof:ROUTE_COMPLETION_PROOF,checkpointId:FINAL_DELIVERY_CHECKPOINT.id,runId:'nitro-test',startProgress:0,endProgress:FINISH_LINE_SPEC.progress,sampleCount:100000,bridgeIds:BRIDGES.filter(b=>b.to<FINAL_DELIVERY_CHECKPOINT.progress).map(b=>b.id)}});
