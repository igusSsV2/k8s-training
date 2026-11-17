const $ = id => document.getElementById(id);
const key = 'kube-together-v1';
const blank = () => ({learner:0,driver:0,records:[{},{}]});
let state;
try { state = JSON.parse(localStorage.getItem(key)) || blank(); } catch { state = blank(); }
if (!state.records || state.records.length !== 2) state = blank();
let selected = 0;
const titles = ['Meet your cluster','Scaling & self-healing','Services & discovery','Make it your own','Health & safe rollouts','Give your data a home','Access with intention','The incident challenge'];
const descriptions = ['Find your bearings. Meet nodes, Pods, and the controllers that keep them running.','Watch Kubernetes replace a Pod and keep your desired state in balance.','Connect the dots with Services, selectors, and your first internal HTTP request.','Personalize your app with configuration and learn how practice Secrets work.','Break a deployment, read the clues, and bring it safely back to health.','Write a shared journal and discover what survives when a Pod disappears.','Give an observer just enough permission. Prove what is allowed and denied.','Put it all together. Three faults, two teammates, one recovered application.'];
const icons = ['?','?','?','?','?','?','?','?'];
const criteria = ['I completed the hands-on tasks','The runtime validation passed','I recorded the manual acceptance evidence','I can explain this lab to my partner'];
function record(i) { return state.records[state.learner][i] || {checks:[false,false,false,false],notes:''}; }
function complete(i) { return record(i).checks.every(Boolean); }
function save() { try { localStorage.setItem(key,JSON.stringify(state)); } catch { toast('Storage unavailable. Export progress to keep a backup.'); } }
function toast(message) { $('toast').textContent=message; $('toast').style.display='block'; clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>$('toast').style.display='none',3500); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied. Ready for your terminal or Codex.'); } catch { const area=document.createElement('textarea'); area.value=text; document.body.append(area); area.select(); const ok=document.execCommand('copy'); area.remove(); toast(ok?'Copied.':'Copy unavailable. Select the command text manually.'); } }
function render() {
  $('learner').value=state.learner;
  const done=titles.filter((_,i)=>complete(i)).length;
  $('count').innerHTML=done+' <span>/ 8 labs</span>';
  $('bar').style.width=(done/8*100)+'%';
  const next=titles.findIndex((_,i)=>!complete(i));
  $('resume').textContent=done===8?'Revisit your journey ?':done?'Continue your journey ?':'Start your first lab ?';
  $('milestone').textContent=done===8?'You built this.':next===0?'Hello, cluster.':titles[next];
  $('milestoneSub').textContent=done===8?'Eight labs complete. Keep exploring.':'Next up: lab '+String(next+1).padStart(2,'0');
  $('roles').textContent='Learner '+(state.driver+1)+' drives � Learner '+(2-state.driver)+' navigates';
  $('grid').replaceChildren();
  titles.forEach((title,i)=>{
    const card=document.createElement('button');card.className='card';
    const started=record(i).checks.some(Boolean)||record(i).notes;
    card.innerHTML='<div class="cardtop"><span class="icon">'+icons[i]+'</span><span class="badge '+(complete(i)?'done':'')+'">'+(complete(i)?'? Completed':started?'In progress':'Ready to explore')+'</span></div><h3>'+title+'</h3><p>'+descriptions[i]+'</p><div class="cardfoot"><span>LAB '+String(i+1).padStart(2,'0')+' � 60�90 MIN</span><b>'+(complete(i)?'Revisit lab':'Open lab')+' ?</b></div>';
    card.onclick=()=>openLab(i);$('grid').append(card);
  });
}
function markdown(source) {
  const fragment=document.createDocumentFragment();
  source.split(/(```[\s\S]*?```)/g).forEach(part=>{
    if(part.startsWith('```')){
      const pre=document.createElement('pre'),code=document.createElement('code'),button=document.createElement('button');
      const text=part.replace(/^```[^\n]*\n/,'').replace(/```$/,'').trim();
      code.textContent=text;button.textContent='Copy';button.onclick=()=>copy(text);pre.append(button,code);fragment.append(pre);
    } else {
      part.split(/\n\s*\n/).filter(Boolean).forEach(block=>{
        const element=document.createElement(/^#{1,3} /.test(block)?'h3':'p');
        block=block.replace(/^#{1,3} /,'');
        block.split(/(`[^`]+`)/g).forEach(piece=>{
          if(piece.startsWith('`')) {const code=document.createElement('code');code.textContent=piece.slice(1,-1);element.append(code);}
          else element.append(document.createTextNode(piece));
        });fragment.append(element);
      });
    }
  });return fragment;
}
function openLab(i) {
  selected=i;$('labtag').textContent='LAB '+String(i+1).padStart(2,'0')+' / LEARNER '+(state.learner+1);
  $('title').textContent=titles[i];$('content').replaceChildren(markdown(COURSE.lessons[i]));
  const pre=document.createElement('pre'),code=document.createElement('code'),button=document.createElement('button');
  code.textContent='powershell -NoProfile -File training/scripts/Check.ps1 -Lab '+(i+1);
  button.textContent='Copy validation';button.onclick=()=>copy(code.textContent);pre.append(button,code);$('content').append(pre);
  $('tracking').hidden=false;$('checks').replaceChildren();
  criteria.forEach((text,j)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=record(i).checks[j];input.onchange=()=>{const r=record(i);r.checks[j]=input.checked;state.records[state.learner][i]=r;save();render();};label.append(input,document.createTextNode(text));$('checks').append(label);});
  $('notes').value=record(i).notes;$('modal').showModal();$('modal').scrollTop=0;
}
$('notes').oninput=()=>{const r=record(selected);r.notes=$('notes').value;state.records[state.learner][selected]=r;save();render();};
$('learner').onchange=()=>{state.learner=Number($('learner').value);save();render();};
$('swap').onclick=()=>{state.driver=1-state.driver;save();render();toast('Roles swapped. Let your partner take the keyboard.');};
$('resume').onclick=()=>openLab(Math.max(0,titles.findIndex((_,i)=>!complete(i))));
$('close').onclick=()=>$('modal').close();
$('journey').onclick=()=>$('grid').scrollIntoView({behavior:'smooth'});
$('setup').onclick=()=>{$('labtag').textContent='BEFORE YOU BEGIN';$('title').textContent='Make room for your cluster.';$('content').replaceChildren(markdown(COURSE.setup));$('tracking').hidden=true;$('modal').showModal();$('modal').scrollTop=0;};
$('coach').onclick=()=>copy('Read training/README.md and training/labs/'+String(selected+1).padStart(2,'0')+'.md. We are two beginners working through '+titles[selected]+'. Explain the concept briefly, then ask us to predict the first result. Give one hint at a time. Do not execute tasks or show the full solution unless asked. Alternate questions between us. Use only context kind-k8training and namespace k8training.');
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='kube-together-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async event=>{try{const value=JSON.parse(await event.target.files[0].text());if(![0,1].includes(value.learner)||![0,1].includes(value.driver)||!Array.isArray(value.records)||value.records.length!==2)throw Error();for(const records of value.records){if(!records||typeof records!=='object')throw Error();for(const [k,r]of Object.entries(records)){if(!/^[0-7]$/.test(k)||!Array.isArray(r.checks)||r.checks.length!==4||r.checks.some(v=>typeof v!=='boolean')||typeof r.notes!=='string')throw Error();}}if(confirm('Replace this browser�s progress with the imported backup?')){state=value;save();render();toast('Progress restored.');}}catch{toast('Could not import: choose a valid progress backup.');}event.target.value='';};
render();
