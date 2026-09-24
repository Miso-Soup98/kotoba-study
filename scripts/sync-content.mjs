import {readFile,writeFile} from 'node:fs/promises';
const data=await readFile('public/data/grammar.json','utf8');
const parsed=JSON.parse(data);if(parsed.entries.length!==622)throw Error('教材基线必须保留622条；扩展内容另建内容包。');
const html=await readFile('public/reader.html','utf8');const re=/(<script id="book-data" type="application\/json">)[\s\S]*?(<\/script>)/;
if(!re.test(html))throw Error('找不到旧版教材数据块');
await writeFile('public/reader.html',html.replace(re,(_,before,after)=>before+data.replace(/<\/script/gi,'<\\/script')+after));
console.log('Updated the portable reader from the canonical corpus.');
