import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.DSH_MODEL_SCHEDULER_ROOT||join(homedir(),'dsh-model-scheduler');
export const {ModelScheduler}=await import(pathToFileURL(join(root,'lib/scheduler.js')).href);
