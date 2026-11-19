import {readFile} from 'node:fs/promises';
import {matchFile, modelFiles} from './model-files.mjs';

const {models} = JSON.parse(await readFile(new URL('./recommended-models.json', import.meta.url), 'utf8'));

export async function scanModels(folder) {
  const names = new Set(models.flatMap(model => model.files.map(file => file.name)));
  const {root, files, warnings} = await modelFiles(folder, names);
  const profiles = models.map(model => {
    const paths = {}, issues = [];
    for (const file of model.files) {
      const result = matchFile(files, file);
      if (result.path) paths[file.role] = result.path;
      else issues.push(result.issue);
    }
    return {id: model.id, name: model.name, paths, issues};
  });
  return {root, profiles, warnings};
}
