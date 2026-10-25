import {accessSync,constants} from 'node:fs';
import {delimiter,join} from 'node:path';
export function executable(name){
 const override=process.env[name.toUpperCase()+'_EXECUTABLE'];
 for(const candidate of override?[override]:(process.env.PATH||'').split(delimiter).map(directory=>join(directory,name+(process.platform==='win32'?'.exe':'')))){
  try{accessSync(candidate,constants.X_OK);return candidate;}catch{}
 }
 throw Error(`Install ${name} on PATH or set ${name.toUpperCase()}_EXECUTABLE to run media tests.`);
}
