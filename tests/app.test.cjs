const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function boot(saved) {
  const elements={};
  function element(){return {children:[],style:{},value:'',append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},showModal(){this.open=true},close(){this.open=false}}}
  const document={getElementById(id){return elements[id]??=element()},createElement:element,createDocumentFragment:element,createTextNode(text){return {textContent:text}}};
  let stored=saved;
  const context=vm.createContext({document,window:{},localStorage:{getItem:()=>stored,setItem:(k,v)=>{stored=v}},setTimeout,clearTimeout,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/course.js'),'utf8'),context);
  vm.runInContext('const COURSE=window.COURSE;',context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8'),context);
  return {context,elements,stored:()=>stored};
}
test('all eight labs render and code blocks retain copyable commands',()=>{
  const {context,elements}=boot();
  assert.equal(elements.grid.children.length,8);
  vm.runInContext('openLab(0)',context);
  assert.equal(elements.modal.open,true);
  assert.equal(elements.checks.children.length,4);
  assert.ok(vm.runInContext('COURSE.lessons[0].includes("create namespace")',context));
});
test('progress persists and stays isolated between learners',()=>{
  const app=boot();
  vm.runInContext('openLab(0)',app.context);
  for(const label of app.elements.checks.children){label.children[0].checked=true;label.children[0].onchange();}
  assert.match(app.elements.count.innerHTML,/1 <span>/);
  const restored=boot(app.stored());
  assert.match(restored.elements.count.innerHTML,/1 <span>/);
  restored.elements.learner.value='1';restored.elements.learner.onchange();
  assert.match(restored.elements.count.innerHTML,/0 <span>/);
});
test('invalid saved JSON falls back to an empty journey',()=>{
  const app=boot('{broken');
  assert.equal(app.elements.grid.children.length,8);
});

test('bundled lessons match portable source commands',()=>{
  const {context}=boot();
  for(let index=0;index<8;index++){
    const source=fs.readFileSync(path.join(__dirname,'../training/labs',`${String(index+1).padStart(2,'0')}.md`),'utf8');
    const bundled=vm.runInContext(`COURSE.lessons[${index}]`,context);
    assert.equal(bundled,source.replace(/\r\n/g,'\n'));
    assert.ok(!bundled.includes('apps/kube-together/'));
  }
  assert.equal(vm.runInContext('COURSE.setup',context),fs.readFileSync(path.join(__dirname,'../training/SETUP.md'),'utf8').replace(/\r\n/g,'\n'));
});
