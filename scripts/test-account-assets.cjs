const assert=require('node:assert/strict');
const path=require('node:path');
const sharp=require('sharp');
const load=require('./ts-loader.cjs').createTsLoader({Buffer,require:(id)=>id==="sharp"?{default:sharp}:require(id)});
const {normalizeAvatar}=load(path.join(__dirname,'../lib/avatar.ts'));
const {validTaskDate}=load(path.join(__dirname,'../lib/tasks.ts'));
(async()=>{
 let passed=0;
 const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 await test('normalizes and center-crops uploaded portraits, strips input metadata',async()=>{
 const input=await sharp({create:{width:800,height:400,channels:3,background:'#a88dc9'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const result=await normalizeAvatar(input);const meta=await sharp(result).metadata();
 assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);assert.equal(meta.orientation,undefined);assert.ok(result.length<=262144);
 });
 await test('rejects active SVG even if browser labels it as an image',async()=>assert.rejects(()=>normalizeAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><script>alert(1)</script></svg>'))));
 await test('rejects corrupt upload bytes',async()=>assert.rejects(()=>normalizeAvatar(Buffer.from('invalid-image'))));
 await test('rejects excessive pixel dimensions despite a small compressed file',async()=>{
 const huge=await sharp({create:{width:4100,height:4100,channels:3,background:'#000'}}).png().toBuffer();await assert.rejects(()=>normalizeAvatar(huge));
 });
 await test('task dates enforce real calendar dates and leap years',()=>{for(const date of ['2026-10-19','2028-02-29','2099-12-31'])assert.ok(validTaskDate(date));for(const date of ['2026-02-29','2026-02-30','2026-13-01','2026-01-00','2026-1-2','1999-01-01','2100-01-01','2026-10-19T12:00:00Z'])assert.equal(validTaskDate(date),false);});
 console.log(passed+' account asset checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
