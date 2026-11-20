const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const assert = require('node:assert/strict');
const root = 'packages/builtin-plugin-remote/src/host/service/';
function load(name, suffix, globals) {
  const code = fs.readFileSync(root + name, 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
  return new vm.Script(stripTypeScriptTypes(code + suffix, {mode:'strip'})).runInNewContext(globals);
}
(async () => {
  const utils = load('core.utils.ts', ';({parseRemoteCopies,remoteCopiesProbeCommand})', {REMOTE_ROOT:'fixture'});
  function marker(name,pkg) {return '__DSH_COPY__'+name+'\n__DSH_DIR__/fixture/'+name+'\n__DSH_ENTRY__/fixture/'+name+'/lib/bin.js\n__DSH_PKG_BEGIN__\n'+pkg+'\n__DSH_PKG_END__\n';}
  let stdout = marker('dsh','{') + marker('dsh-0.2.3','{"version":"0.2.3"}');
  const session = {exec:async()=>({stdout,code:0}),close:async()=>{}};
  const core = load('core.ts', ';core', {...utils,defineService:x=>x,machine:{profileName:()=> 'fixture',openSession:async()=>session},remoteCoreTargetId:()=> 'fixture',REMOTE_CORE_CAPABILITIES:[],REMOTE_CORE_PLATFORMS:[],assertSupportedDshVersion:()=>{},semver:{prerelease:()=>null},messageOf:String});
  const broken = await core.resolve('fixture');
  assert.equal(broken.availability,'unreadable');
  assert.equal(broken.slots.length,0);
  assert.equal(utils.parseRemoteCopies(stdout)[1].version,'0.2.3');
  stdout = marker('dsh-0.2.3','{"version":"0.2.3"}');
  const healthy = await core.resolve('fixture');
  assert.equal(healthy.slots.length,1);
  console.log('remote broken active:',broken.availability,broken.slots.length,'healthy only:',healthy.availability,healthy.slots.length);
  const state = load('tasks.ts', ';({tasks,taskStates})', {defineService:x=>x,EVENT_RING_CAPACITY:5});
  for(let i=0;i<200;i++) {
    const {taskId}=state.tasks.create('installVersion','fixture');
    for(let j=0;j<10;j++) state.tasks.append(taskId,'install','fixture',{terminal:j===9?'success':undefined});
  }
  assert.equal(state.taskStates.size,200);
  assert.equal([...state.taskStates.values()][0].events.length,5);
  console.log('completed retained:',state.taskStates.size,'events per task:',[...state.taskStates.values()][0].events.length);
})().catch(error=>{console.error(error);process.exitCode=1;});
