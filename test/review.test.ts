import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {Client} from '@modelcontextprotocol/client';
import {ReviewStore} from '../src/store.ts';
import {RepositoryProvider} from '../src/repository.ts';
import {buildHunks,pairedRows} from '../src/diff-model.ts';
import {buildServer,uri} from '../src/server.ts';
import {comparisonSchema} from '../src/contract.ts';
import {tokenize,lineHtml,languageFor} from '../web/highlight.ts';

const comparison=()=>comparisonSchema.parse({schema:'openmuse.repository-review/1',title:'Real review',source:{kind:'workspace',provider:'test'},files:[{path:'src/demo.ts',status:'modified',before:'export const value = 1;\n',after:'export const value = 2;\n'}]});
test('large identical source is unchanged, not full replacement',()=>{const f=comparison().files[0];f.before=f.after=Array(2001).fill('same').join('\n');assert.equal(buildHunks(f).hunks.length,0);});
test('native patch retains absolute old/new line anchors',()=>{const f=comparison().files[0];delete f.before;delete f.after;f.patch='@@ -147,2 +150,2 @@\n keep\n-old\n+new';const m=buildHunks(f);assert.equal(m.hunks[0].lines[1].oldLine,148);assert.equal(m.hunks[0].lines[2].newLine,151);assert.deepEqual([m.additions,m.deletions],[1,1]);});
test('word changes and split rows distinguish inserts and replacements',()=>{const m=buildHunks(comparison().files[0]);assert.ok(m.hunks[0].lines[0].changes?.length);const paired=pairedRows(m.hunks[0].lines);assert.equal(paired[0].left?.kind,'delete');assert.equal(paired[0].right?.kind,'add');});
test('empty files, Unicode and no newline remain exact',()=>{const f=comparison().files[0];f.before='';f.after='中文😀';const m=buildHunks(f);assert.equal(m.additions,1);assert.equal(m.deletions,0);assert.ok(m.hunks[0].lines.some(l=>l.kind==='meta'));});
test('unavailable and binary content are explicitly incomplete text views',()=>{for(const binary of [true,false]){const f=comparison().files[0];f.binary=binary;f.patchUnavailable=!binary;assert.equal(buildHunks(f).partial,true);}});
test('syntax tokens are colored and source HTML never executes',()=>{const tokens=tokenize('export const value = "<script>alert(1)</script>";','a.ts')!;assert.ok(tokens.flat().some(t=>t.color));const html=lineHtml({kind:'add',text:'<img src=x onerror=alert(1)>',hunk:0});assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.equal(languageFor('a.constructor'),'text');assert.equal(tokenize('x'.repeat(4000),'a.ts'),null);});
test('durable hash-bound review, replay, notes, resolution and receipt',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'review-store-'));try{
    let store=new ReviewStore(dir,'authorized account / CI Agent delegated'),r=await store.open(comparison());
    const base={comparisonId:r.id,expectedDigest:r.digest,commandId:randomUUID(),path:'src/demo.ts'};
    await assert.rejects(store.change({...base,side:'right',line:999,body:'bad'}),/NOTE_ANCHOR_INVALID/);
    await assert.rejects(store.change({...base,decision:'accepted'}),/REVIEW_NOT_COMPLETE/);
    const result:any=await store.change({...base,side:'right',line:1,body:'Review this change'});
    assert.deepEqual(await store.change({...base,side:'right',line:1,body:'Review this change'}),result);
    await assert.rejects(store.change({...base,side:'right',line:1,body:'different'}),/COMMAND_ID_REUSED/);
    await store.change({...base,commandId:randomUUID(),viewed:true});
    await assert.rejects(store.change({...base,commandId:randomUUID(),decision:'accepted'}),/REVIEW_NOT_COMPLETE/);
    await store.change({...base,commandId:randomUUID(),noteId:result.notes[0].id,resolved:true});
    await store.change({...base,commandId:randomUUID(),decision:'accepted'});
    store=new ReviewStore(dir,'authorized account / CI Agent delegated');await store.load();
    assert.equal(store.read(r.id).decision,'accepted');assert.equal(store.export(r.id).platformApproval,false);assert.equal(store.export(r.id).merged,false);
    await assert.rejects(store.change({...base,commandId:randomUUID(),expectedDigest:'0'.repeat(64),viewed:false}),/COMPARISON_CHANGED/);
    const changed=comparison();changed.files[0].after='new snapshot';const newer=await store.open(changed);assert.notEqual(newer.id,r.id);assert.deepEqual(newer.viewed,[]);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('Git providers acquire actual workspace, staged, branch, commit and non-code snapshots',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'review-git-'));const git=(...a:string[])=>execFileSync('git',a,{cwd:dir,encoding:'utf8'}).trim();
  try{
    git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');
    await writeFile(path.join(dir,'demo.ts'),'export const n = 1;\n');await writeFile(path.join(dir,'notes.md'),'# 产品稿\n版本一\n');await writeFile(path.join(dir,'image.png'),Buffer.from([137,80,78,71,0,1]));git('add','.');git('commit','-m','initial');
    const base=git('rev-parse','HEAD');git('checkout','-b','feature');await writeFile(path.join(dir,'demo.ts'),'export const n = 2;\n');await writeFile(path.join(dir,'notes.md'),'# 产品稿\n版本二\n');git('add','.');git('commit','-m','feature');
    const provider=new RepositoryProvider([{id:'test',title:'Test',root:dir}]);
    const commit=await provider.compare({repositoryId:'test',kind:'commit'});assert.equal(commit.files.length,2);assert.equal(commit.files.find(f=>f.path==='notes.md')?.before,'# 产品稿\n版本一\n');
    assert.equal((await provider.compare({repositoryId:'test',kind:'branch',baseRef:'main',headRef:'feature'})).source.baseRef,base);
    await writeFile(path.join(dir,'demo.ts'),'export const n = 3;\n');git('add','demo.ts');await writeFile(path.join(dir,'demo.ts'),'export const n = 4;\n');
    assert.equal((await provider.compare({repositoryId:'test',kind:'staged'})).files[0].after,'export const n = 3;\n');
    await writeFile(path.join(dir,'image.png'),Buffer.from([137,80,78,71,0,2]));
    const workspace=await provider.compare({repositoryId:'test',kind:'workspace'});assert.equal(workspace.files.find(f=>f.path==='demo.ts')?.after,'export const n = 4;\n');assert.equal(workspace.files.find(f=>f.path==='image.png')?.binary,true);
    await symlink('/etc/hosts',path.join(dir,'linked'));const linked=await provider.compare({repositoryId:'test',kind:'workspace'});assert.equal(linked.files.find(f=>f.path==='linked')?.patchUnavailable,true);
    await assert.rejects(provider.compare({repositoryId:'unauthorized',kind:'workspace'}),/REPOSITORY_NOT_GRANTED/);
    assert.ok((await provider.history('test','notes.md')).commits.length===2);await assert.rejects(provider.history('test','../secret'),/REPOSITORY_PATH_DENIED/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('independent MCP consumer discovers UI and shares review contract without CI imports',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'review-mcp-'));try{
    const store=new ReviewStore(dir,'Test'),server=buildServer(store,new RepositoryProvider([]),async()=>'<html>review</html>');
    const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();const client=new Client({name:'independent-consumer',version:'1.0'});await server.connect(serverTransport);await client.connect(clientTransport);
    const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='review_open'));const ui=await client.readResource({uri});assert.equal((ui.contents[0] as any).text,'<html>review</html>');
    const opened=await client.callTool({name:'review_open',arguments:comparison()});assert.ok((opened.structuredContent as any)?.id);await client.close();await server.close();
  }finally{await rm(dir,{recursive:true,force:true});}
});
