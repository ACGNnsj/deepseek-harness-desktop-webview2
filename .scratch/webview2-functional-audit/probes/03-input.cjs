const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element { dispatchEvent(e) { outputs.push(e); } }
class File { constructor(parts, name, options={}) { this.name=name; this.type=options.type || ''; this.parts=parts; } }
class DataTransferItem { constructor(file) { this.kind='file'; this.file=file; } getAsFile(){return this.file;} webkitGetAsEntry(){return null;} }
class DataTransfer { constructor(){ this.items=[]; this.items.add=f=>this.items.push(new DataTransferItem(f)); this.data={}; } get files(){return this.items.map(x=>x.getAsFile());} setData(k,v){this.data[k]=v;} getData(k){return this.data[k] || '';} get types(){return this.files.length ? ['Files',...Object.keys(this.data)] : Object.keys(this.data);} }
class ClipboardEvent { constructor(type, opts){this.type=type;Object.assign(this,opts);} }
class DragEvent extends ClipboardEvent {}
let outputs=[], invokes=[], pending=[];
const handlers={}; const body=new Element();
const document={body,documentElement:{style:{}},addEventListener(k,fn){handlers[k]=fn;},dispatchEvent(e){outputs.push(e);}};
const window={addEventListener(){},__TAURI_INTERNALS__:{invoke(cmd,args){invokes.push({cmd,args}); return new Promise((resolve,reject)=>pending.push({resolve,reject}));}}}; window.self=window;window.top=window;window.DataTransferItem=DataTransferItem;
vm.runInNewContext(fs.readFileSync('apps/desktop/src-tauri/src/desktop/browser.js.inc','utf8'),{window,document,DataTransfer,DataTransferItem,File,Element,ClipboardEvent,DragEvent,console:{warn(){},info(){},error(){}},atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,navigator:{userAgent:'probe'}});
function paste(name){const transfer=new DataTransfer();transfer.items.add(new File(['x'],name,{type:'image/png'})); const e={clipboardData:transfer,target:body,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};handlers.paste(e);return e;}
async function flush(){await Promise.resolve();await Promise.resolve();}
(async()=>{
 const shot=paste('image.png'); assert.equal(shot.prevented,true);assert.equal(invokes[0].cmd,'read_clipboard_file_paths');assert.equal(outputs.length,0);pending.shift().resolve([]);await flush();assert.equal(outputs.length,1);console.log('PASS screenshot+Files: prevented=true, IPC=read_clipboard_file_paths, resumed after IPC');
 outputs=[];paste('first.png');paste('second.png');pending[1].resolve([]);await flush();pending[0].resolve([]);await flush();pending=[];assert.deepEqual(outputs.map(e=>e.clipboardData.files[0].name),['second.png','first.png']);console.log('PASS concurrent paste: observed order second.png,first.png');
 outputs=[];const drop=window.__dshShellDropAnnounce([{path:'C:/fixture/large.png',isDir:false}]);pending.shift().reject(new Error('DROP_BYTES_TOO_LARGE'));await drop;assert.equal(outputs.length,0);console.log('PASS failed image drop: emitted drops=0, no fallback');
 outputs=[];paste('same');pending.shift().resolve([{name:'same',path:'C:/dir/same',is_dir:true}]);await flush();const result=outputs[0].clipboardData.files[0];assert.equal(window.__DSH_HOST_PATHS__.pathFor(result),'C:/dir/same');assert.equal(outputs[0].clipboardData.items[0].webkitGetAsEntry().isDirectory,true);console.log('PASS same-name kind mismatch: file converted to directory C:/dir/same');
})().catch(e=>{console.error(e);process.exitCode=1;});
