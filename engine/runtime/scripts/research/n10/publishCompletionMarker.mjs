/** Publish only complete markers, atomically and without replacing an existing marker. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function publishCompletionMarker(directory, name, {io=fs}={}) {
  if (!/^n11-(?:(?:prime|phase)-(?:degraded|relief|recovery)|complete)\.json$/.test(name)) {
    throw Error('closed completion marker name required');
  }
  const temporary=path.join(directory,'.n11-marker-'+randomUUID()+'.tmp');
  const target=path.join(directory,name);
  try {
    await io.writeFile(temporary,'{"complete":true}',{flag:'wx',mode:0o644});
    // link is atomic and exclusive; rename would silently overwrite an existing target.
    await io.link(temporary,target);
  } finally {
    try {await io.unlink(temporary);} catch(error) {if(error.code!=='ENOENT')throw error;}
  }
}
