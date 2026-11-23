import{createHighlighterCoreSync}from'shiki/core'
import{createJavaScriptRegexEngine}from'shiki/engine/javascript'
import ts from'shiki/langs/typescript.mjs';import tsx from'shiki/langs/tsx.mjs';import js from'shiki/langs/javascript.mjs';import json from'shiki/langs/json.mjs';import dart from'shiki/langs/dart.mjs';import rust from'shiki/langs/rust.mjs';import python from'shiki/langs/python.mjs';import shell from'shiki/langs/shellscript.mjs';import yaml from'shiki/langs/yaml.mjs';import html from'shiki/langs/html.mjs';import css from'shiki/langs/css.mjs';import light from'shiki/themes/github-light.mjs'
import type{DiffLine}from'../src/diff-model.ts'
const highlighter=createHighlighterCoreSync({themes:[light],langs:[ts,tsx,js,json,dart,rust,python,shell,yaml,html,css],engine:createJavaScriptRegexEngine()})
export const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const languages:Record<string,string>={ts:'typescript',mts:'typescript',tsx:'tsx',js:'javascript',jsx:'tsx',mjs:'javascript',cjs:'javascript',json:'json',dart:'dart',rs:'rust',py:'python',sh:'shellscript',bash:'shellscript',zsh:'shellscript',yaml:'yaml',yml:'yaml',html:'html',htm:'html',css:'css'}
export function languageFor(path:string){return Object.hasOwn(languages,path.split('.').pop()!.toLowerCase())?languages[path.split('.').pop()!.toLowerCase()]:'text'}
export function tokenize(code:string,path:string){const lang=languageFor(path);if(code.length>500_000||code.split('\n').some(line=>line.length>3000))return null;return highlighter.codeToTokensBase(code,{lang,theme:'github-light'})}
export function lineHtml(line:DiffLine,tokens?:{content:string;color?:string}[]){
 let at=0,result='';for(const token of tokens||[{content:line.text}]){let offset=0;const ranges=line.changes||[];while(offset<token.content.length){const start=at+offset;const marked=ranges.some(r=>r.start<=start&&start<r.end);const boundaries=ranges.flatMap(r=>[r.start,r.end]).filter(n=>n>start);const end=Math.min(at+token.content.length,...boundaries);const piece=token.content.slice(offset,end-at);const color=/^#[a-f\d]{6,8}$/i.test(token.color||'')?token.color:undefined;result+=`<span${marked?' class="word-change"':''}${color?' style="color:'+color+'"':''}>${escape(piece)}</span>`;offset=end-at;}at+=token.content.length}
 return result||' '
}
