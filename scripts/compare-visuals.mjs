import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
const root='tests/visual', out=path.join(root,'diff');
fs.mkdirSync(out,{recursive:true});
const report=[];
for(const project of fs.readdirSync(path.join(root,'baseline'))){
  for(const file of fs.readdirSync(path.join(root,'baseline',project)).filter(x=>x.endsWith('.png'))){
    const previous=PNG.sync.read(fs.readFileSync(path.join(root,'baseline',project,file)));
    const currentPath=path.join(root,'after',project,file); if(!fs.existsSync(currentPath))throw Error(`Missing ${currentPath}`);
    const current=PNG.sync.read(fs.readFileSync(currentPath));
    const width=Math.max(previous.width,current.width),height=Math.max(previous.height,current.height);
    function padded(image){const result=new PNG({width,height});result.data.fill(255);PNG.bitblt(image,result,0,0,image.width,image.height,0,0);return result;}
    const a=padded(previous),b=padded(current),diff=new PNG({width,height});
    const pixels=pixelmatch(a.data,b.data,diff.data,width,height,{threshold:.1});
    fs.mkdirSync(path.join(out,project),{recursive:true});fs.writeFileSync(path.join(out,project,file),PNG.sync.write(diff));
    report.push({project,screen:file,changedPixels:pixels,changedPercent:Number((100*pixels/(width*height)).toFixed(2)),before:[previous.width,previous.height],after:[current.width,current.height]});
  }
}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
console.table(report.map(({project,screen,changedPercent})=>({project,screen,changedPercent})));
