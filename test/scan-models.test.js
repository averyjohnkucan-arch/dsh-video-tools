import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, open, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scanModels} from '../lib/scan-models.js';

test('recursive video scan recognizes a complete distilled profile and keeps HQ separate', async t => {
  const root = await mkdtemp(join(tmpdir(),'video-discovery-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const modelRoot = join(root,'Models');
  const {models} = JSON.parse(await readFile(new URL('../lib/recommended-models.json', import.meta.url)));
  const standard = models.find(model=>model.id==='standard');
  const hq = models.find(model=>model.id==='HQ');
  for (const file of [...standard.files, hq.files.find(f=>f.role==='modelPath')]) {
    const inside = !file.name.includes('-dev-');
    const dir = inside ? join(modelRoot,file.role,'BF16') : join(root,'not-selected');
    await mkdir(dir,{recursive:true});
    const handle = await open(join(dir,file.name),'w');
    await handle.truncate(file.size);
    await handle.close();
    if (!inside) await symlink(join(dir,file.name),join(modelRoot,file.name));
  }
  const {profiles,warnings} = await scanModels(modelRoot);
  assert.equal(profiles.find(p=>p.id==='standard').issues.length,0);
  assert.equal(profiles.find(p=>p.id==='HQ').issues.length,1);
  assert.ok(warnings[0].includes('outside the selected folder'));
});
