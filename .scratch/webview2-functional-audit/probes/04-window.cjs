const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('apps/desktop/src-tauri/src/desktop/open_in_app.js.inc','utf8');
async function probe(input, init) {
 const calls=[]; const window={fetch:async()=>({ok:true}),__TAURI_INTERNALS__:{invoke:async(...args)=>{calls.push(args)}}};
 vm.runInNewContext(code,{window,URL});
 await window.fetch(input,init);
 return calls;
}
(async()=>{
 const stringPost=await probe('http://localhost:3080/api/open-in-app/open',{method:'POST',body:JSON.stringify({path:'C:/isolated'})});
 const requestPost=await probe(new Request('http://localhost:3080/api/open-in-app/open',{method:'POST',body:JSON.stringify({path:'C:/isolated'})}));
 const unrelated=await probe('https://example.invalid/a?next=/open-in-app/open',{method:'POST',body:JSON.stringify({path:'C:/isolated'})});
 assert.equal(stringPost.length,1);assert.equal(requestPost.length,0);assert.equal(unrelated.length,1);
 console.log(JSON.stringify({stringPost:stringPost.length,requestPost:requestPost.length,unrelatedRoute:unrelated.length,scope:'VM executing exact injection; no native calls or network'}));
})().catch(e=>{console.error(e);process.exitCode=1});
