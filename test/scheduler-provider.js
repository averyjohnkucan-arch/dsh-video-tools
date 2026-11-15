import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
const sibling=fileURLToPath(new URL('../../dsh-model-scheduler/',import.meta.url));
const root=process.env.DSH_MODEL_SCHEDULER_ROOT;
const moduleUrl=root?pathToFileURL(join(root,'lib/scheduler.js')).href:existsSync(join(sibling,'lib/scheduler.js'))?pathToFileURL(join(sibling,'lib/scheduler.js')).href:'dsh-model-scheduler/lib/scheduler.js';
export const {ModelScheduler}=await import(moduleUrl);
