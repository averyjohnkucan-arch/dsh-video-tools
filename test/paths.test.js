import {fileURLToPath} from 'node:url';import {executable} from './executables.js';
import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('configured exact GGUF wins over an identically named default checkpoint',()=>{
 const code=`import sys,tempfile\nfrom pathlib import Path\nsys.path.insert(0,${JSON.stringify(fileURLToPath(new URL('../lib',import.meta.url)))})\nfrom comfy_paths import bind_checkpoint\nwith tempfile.TemporaryDirectory() as t:\n root=Path(t); a=root/'default';b=root/'exact';a.mkdir();b.mkdir();(a/'model.gguf').write_text('wrong');(b/'model.gguf').write_text('right')\n class F:\n  folder_names_and_paths={'unet':([str(a)],{'.gguf'}),'diffusion_models':([str(a)],{'.gguf'})}\n  def get_full_path(self,key,name):\n   return next((str(Path(p)/name) for p in self.folder_names_and_paths[key][0] if (Path(p)/name).exists()),None)\n f=F();name=bind_checkpoint(f,str(b/'model.gguf'));assert Path(f.get_full_path('unet',name)).read_text()=='right'\n`;
 assert.doesNotThrow(()=>execFileSync(executable('python3'),['-c',code],{stdio:'pipe'}));
});
