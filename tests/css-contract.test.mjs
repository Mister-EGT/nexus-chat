import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
const directory=new URL('../src/styles/',import.meta.url);
const files=['tokens.css','base.css',...fs.readdirSync(new URL('components/',directory)).map(name=>'components/'+name)];
const roots=files.map(file=>postcss.parse(fs.readFileSync(new URL(file,directory),'utf8')));
function luminance(hex) { let chars=hex.slice(1);if(chars.length===3)chars=[...chars].map(c=>c+c).join('');const rgb=[0,2,4].map(i=>parseInt(chars.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; }
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('Every text token meets AA on every neutral surface in both themes',()=>{
  const dark={},light={};roots[0].walkRules(rule=>rule.walkDecls(d=>(rule.selector.includes('light')?light:dark)[d.prop]=d.value));
  for(const [name,theme] of [['dark',dark],['light',{...dark,...light}]]){
    for(const text of ['--text-1','--text-2','--text-3'])for(const surface of ['--bg-0','--bg-1','--bg-2','--bg-3','--bg-4','--bg-hover'])assert.ok(contrast(theme[text],theme[surface])>=4.5,`${name} ${text}/${surface}: ${contrast(theme[text],theme[surface]).toFixed(2)}`);
    for(const accent of ['--accent','--accent-h'])assert.ok(contrast(theme['--on-accent'],theme[accent])>=4.5,`${name} on-accent/${accent}`);
  }
});
test('Styles have one token source, no obsolete palette and no important declarations',()=>{
  for(const [i,root] of roots.entries()){
    const text=root.toString();assert.doesNotMatch(text,/!important|--copper|#131a18|rgba\(0,\s*120,\s*212|layro-model-pill|studio-landing|studio-orbit|starter-grid|key-card|key-screen/);
    root.walkDecls(d=>{if(i>0 && d.parent.name !== 'font-face'){assert.doesNotMatch(d.value,/#(?:[\da-f]{3,8})\b|rgba?\(/i,`${files[i]} ${d.prop}`);if(/^(?:font-size|font-weight|line-height|letter-spacing|border-radius|box-shadow)$/.test(d.prop)&&!['0','none','inherit','normal'].includes(d.value))assert.match(d.value,/^var\(/,`${files[i]} ${d.prop}: ${d.value}`);}});
  }
  const source=roots.slice(1).map(root=>root.toString()).join('\n');assert.equal((source.match(/content-visibility: var\(--message-visibility,\s*auto\)/g)||[]).length,1);
  assert.ok(!fs.existsSync(new URL('glass.css',directory)));assert.ok(!fs.existsSync(new URL('liquid-glass.css',directory)));
});
