import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {matchBrace} from './helpers/extract.mjs';
const src=fs.readFileSync(path.join(process.env.PRIVACYASSAY_TEST_ROOT||path.resolve('.'),'index.html'),'utf8');
const extract=n=>{const p=src.indexOf('function '+n+'('),b=src.indexOf('{',src.indexOf(')',p));return src.slice(p,matchBrace(src,b)+1)};
for(const mode of ['shader failure','successful work','stalled validation'])test('WebGPU cleanup: '+mode,async()=>{
 let timeout,destroyed=0,textures=0;
 const dev={destroy(){destroyed++},createShaderModule(){if(mode==='shader failure')throw new TypeError('fixture');return {}},createComputePipelineAsync:()=>Promise.resolve(),pushErrorScope(){},createTexture:()=>({destroy(){textures++}}),popErrorScope:()=>mode==='stalled validation'?new Promise(()=>{}):Promise.resolve(null),createBuffer:()=>({mapAsync:()=>Promise.resolve(),unmap(){},destroy(){}})};
 const ad={info:{vendor:'fixture'},limits:{maxBufferSize:1024},features:new Set(['shader-f16']),requestDevice:()=>Promise.resolve(dev)};
 const collect=new Function('navigator','performance','setTimeout','cat','paFrameGpu','GPUTextureUsage','GPUBufferUsage','GPUMapMode', ['fnv','fnvParts','fnvDead','paErr','collectWebGPU'].map(extract).join('\n')+';return collectWebGPU')({gpu:{requestAdapter:()=>Promise.resolve(ad)}},{now:()=>1},f=>{timeout=f;return 1},(name,rows)=>({name,rows}),()=>Promise.resolve({adapter:'frame-adapter',limits:'frame-limits',features:'frame-features'}),{RENDER_ATTACHMENT:1,STORAGE_BINDING:2,TEXTURE_BINDING:4},{MAP_READ:1,COPY_DST:2},{READ:1});
 const promise=collect();if(mode==='stalled validation'){for(let i=0;i<8;i++)await Promise.resolve();timeout()}
 const result=await promise;assert.ok(result.rows.some(r=>r[0]==='fresh-frame features'&&r[1]==='frame-features'));assert.equal(destroyed,1);if(mode!=='shader failure')assert.equal(textures,9);
});
