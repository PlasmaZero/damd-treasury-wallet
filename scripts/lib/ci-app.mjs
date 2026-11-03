import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root} from '../compile.mjs';

// Build a disposable acceptance app without changing the team's deployment records.
export async function buildFixtureApp({directory,chainId,rpcUrl,manifest}) {
  const appDir=path.join(directory,'app');fs.mkdirSync(appDir,{recursive:true});
  for(const item of ['src','index.html','vite.config.js'])
    fs.cpSync(path.join(root,item),path.join(appDir,item),{recursive:true});
  fs.writeFileSync(path.join(appDir,'package.json'),'{"type":"module"}\n');
  const publicDir=path.join(appDir,'public/deployments');fs.mkdirSync(publicDir,{recursive:true});
  fs.writeFileSync(path.join(publicDir,`${chainId}.json`),JSON.stringify(manifest,null,2)+'\n');
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build'],{
      cwd:appDir,stdio:'inherit',env:{...process.env,BASE_PATH:'/',VITE_USE_MOCK:'false',
        VITE_CHAIN_ID:String(chainId),VITE_RPC_URL:rpcUrl}});
    child.once('error',reject);
    child.once('exit',code=>code===0?resolve():reject(Error(`Acceptance app build failed (${code}).`)));
  });
  return appDir;
}
