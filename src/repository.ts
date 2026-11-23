import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Comparison, ChangeFile} from './contract.ts';

const exec=promisify(execFile), LIMIT=900_000;
export interface RepositoryConfig {id:string; title:string; root:string; github?:{owner:string;repository:string;tokenFile:string}}
export class RepositoryProvider {
  constructor(readonly repositories:RepositoryConfig[]){}
  private repo(id:string){const repo=this.repositories.find(r=>r.id===id);if(!repo)throw Error('REPOSITORY_NOT_GRANTED');return repo;}
  private async git(repo:RepositoryConfig,args:string[],buffer=false):Promise<any>{try{return (await exec('git',['--no-pager','-c','core.quotepath=false',...args],{cwd:repo.root,maxBuffer:5*1024*1024,timeout:15000,encoding:buffer?'buffer':'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}})).stdout;}catch{throw Error('GIT_SOURCE_UNAVAILABLE');}}
  private async ref(repo:RepositoryConfig,value:string){if(!value||value.length>200||value.startsWith('-')||value.includes('\0'))throw Error('GIT_REF_INVALID');return (await this.git(repo,['rev-parse','--verify','--end-of-options',value+'^{commit}'])).trim();}
  async list(){return {repositories:await Promise.all(this.repositories.map(async r=>({id:r.id,title:r.title,head:await this.ref(r,'HEAD'),branches:(await this.git(r,['for-each-ref','--format=%(refname:short)','refs/heads','refs/remotes'])).trim().split('\n').filter(Boolean).slice(0,100),sources:['workspace','staged','branch','commit',...(r.github?['mr']:[])]})))};}
  async history(repoId:string,filePath?:string){const repo=this.repo(repoId);if(filePath)this.validatePath(filePath);const output=await this.git(repo,['log','-40','--format=%H%x09%aI%x09%s',...(filePath?['--',filePath]:[])]);return {commits:output.trim().split('\n').filter(Boolean).map((line:string)=>{const[sha,at,...title]=line.split('\t');return{sha,at,title:title.join('\t')};})};}
  private validatePath(filePath:string){if(path.isAbsolute(filePath)||filePath.split('/').some(p=>p==='..'||p==='.git')||filePath.includes('\0'))throw Error('REPOSITORY_PATH_DENIED');}
  private async bytes(repo:RepositoryConfig,filePath:string,ref?:string):Promise<Buffer>{
    this.validatePath(filePath);
    if(ref)return this.git(repo,['show',(ref===':'?'':ref)+':'+filePath],true);
    const root=await realpath(repo.root),full=path.join(root,filePath);let current=root;
    for(const part of filePath.split('/')){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error('REPOSITORY_SYMLINK_DENIED');}
    if(!(await realpath(full)).startsWith(root+path.sep))throw Error('REPOSITORY_PATH_DENIED');
    if((await lstat(full)).size>LIMIT)throw Error('FILE_BUDGET_EXCEEDED');return readFile(full);
  }
  private describe(bytes:Buffer){const binary=bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes);return{binary,text:binary?undefined:bytes.toString('utf8'),size:bytes.length,...(binary&&bytes.length<350_000?{base64:bytes.toString('base64')}:{}),sha256:createHash('sha256').update(bytes).digest('hex')};}
  async compare(a:{repositoryId:string;kind:'workspace'|'staged'|'branch'|'commit'|'mr';baseRef?:string;headRef?:string;number?:number}):Promise<Comparison>{
    const repo=this.repo(a.repositoryId);if(a.kind==='mr')return this.mr(repo,a.number!);
    const head=a.kind==='branch'?await this.ref(repo,a.headRef||'HEAD'):await this.ref(repo,a.headRef||'HEAD');
    const base=a.kind==='commit'?await this.ref(repo,a.baseRef||head+'^'):a.kind==='branch'?await this.ref(repo,a.baseRef||'main'):head;
    const args=a.kind==='workspace'?['diff','--name-status','-z','--find-renames',base]:a.kind==='staged'?['diff','--name-status','-z','--find-renames','--cached',base]:['diff','--name-status','-z','--find-renames',base,head];
    const raw=(await this.git(repo,args)).split('\0'),entries:{status:string;path:string;previousPath?:string}[]=[];
    for(let i=0;i<raw.length-1;){const status=raw[i++];if(!status)continue;const first=raw[i++];entries.push(status.startsWith('R')||status.startsWith('C')?{status,path:raw[i++],previousPath:first}:{status,path:first});}
    if(a.kind==='workspace')for(const file of (await this.git(repo,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean))entries.push({status:'A',path:file});
    if(entries.length>300)throw Error('COMPARISON_FILE_LIMIT');
    const files:ChangeFile[]=[];let total=0;
    for(const entry of entries){
      const status=entry.status[0],meta={path:entry.path,previousPath:entry.previousPath,status:({A:'added',D:'deleted',R:'renamed',C:'copied',M:'modified',T:'modified'} as const)[status as 'M']||'modified'};
      try{
        const before=this.describe(status==='A'?Buffer.alloc(0):await this.bytes(repo,entry.previousPath||entry.path,base));
        const after=this.describe(status==='D'?Buffer.alloc(0):await this.bytes(repo,entry.path,a.kind==='workspace'?undefined:a.kind==='staged'?':':head));
        // Index blobs must be read with :path (an empty ref is distinct from the filesystem).
        const resolvedAfter=a.kind==='staged'&&status!=='D'?this.describe(await this.git(repo,['show',':'+entry.path],true)):after;
        total+=before.size+resolvedAfter.size;if(total>3*1024*1024||before.size>LIMIT||resolvedAfter.size>LIMIT)throw Error('FILE_BUDGET_EXCEEDED');
        files.push({...meta,before:before.text,after:resolvedAfter.text,binary:before.binary||resolvedAfter.binary,truncated:false,patchUnavailable:false,beforeInfo:{sha256:before.sha256,byteLength:before.size,base64:before.base64},afterInfo:{sha256:resolvedAfter.sha256,byteLength:resolvedAfter.size,base64:resolvedAfter.base64}});
      }catch{files.push({...meta,binary:false,truncated:false,patchUnavailable:true});}
    }
    return{schema:'openmuse.repository-review/1',title:repo.title+' · '+a.kind,source:{kind:a.kind,provider:'git',repository:repo.id,baseRef:base,headRef:head,headSha:head},files,incomplete:files.some(f=>f.patchUnavailable)};
  }
  private async mr(repo:RepositoryConfig,number:number):Promise<Comparison>{
    if(!repo.github||!Number.isSafeInteger(number)||number<1)throw Error('MR_PROVIDER_NOT_CONFIGURED');
    const token=(await readFile(repo.github.tokenFile,'utf8')).trim(),base=`https://api.github.com/repos/${encodeURIComponent(repo.github.owner)}/${encodeURIComponent(repo.github.repository)}/pulls/${number}`;
    const get=async(url:string)=>{const res=await fetch(url,{headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('MR_SOURCE_UNAVAILABLE');return res.json();};
    const pr:any=await get(base),files:ChangeFile[]=[];
    for(let page=1;page<=3;page++){const batch:any=await get(base+`/files?per_page=100&page=${page}`);for(const f of batch)files.push({path:f.filename,previousPath:f.previous_filename,status:f.status==='removed'?'deleted':f.status==='changed'?'modified':f.status,patch:f.patch,binary:false,truncated:false,patchUnavailable:!f.patch});if(batch.length<100)break;}
    const again:any=await get(base);if(pr.head.sha!==again.head.sha||pr.base.sha!==again.base.sha)throw Error('MR_CHANGED_DURING_READ');
    const incomplete=pr.changed_files!==files.length||files.some(f=>f.patchUnavailable);
    return{schema:'openmuse.repository-review/1',title:`${repo.title} · MR #${number}: ${pr.title}`,source:{kind:'mr',provider:'github',repository:repo.id,baseRef:pr.base.sha,headRef:pr.head.sha,headSha:pr.head.sha,number},files,incomplete};
  }
}
