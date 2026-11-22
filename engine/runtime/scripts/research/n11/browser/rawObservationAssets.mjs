import fs from 'node:fs/promises';
import path from 'node:path';

export async function stageRawObservationAssets(runtime, directory, ts) {
  const web = path.resolve(runtime, '../../apps/web/src');
  for (const [name, source] of [
    ['raw-stats.js','lib/webrtc/telemetry/webrtcStatsParser.ts'],
    ['raw-stream.js','features/player/telemetry/streamTelemetryExport.ts'],
    ['raw-artifact.js','features/player/artifactFilename.ts'],
  ]) {
    let code = ts.transpileModule(await fs.readFile(path.join(web, source), 'utf8'), {
      compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
    }).outputText;
    code = code.replaceAll('../artifactFilename.ts', '/raw-artifact.js');
    await fs.writeFile(path.join(directory,name),code,{mode:0o644});
  }
}
