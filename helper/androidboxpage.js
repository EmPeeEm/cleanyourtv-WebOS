// The phone page for the Android box settings (androidbox.js): address of the box, its HDMI input, and which apps open on it. It is served
// by a short-lived server on the LAN (like the cards page) and needs the code shown on the TV in every request (header x-code).
const web = require('./web'),
  i18n = require('./i18n');

const PLEX = 'com.plexapp.android';
const PHONE_JS = `var code='',S={},rows=[],$=function(i){return document.getElementById(i)};
function api(p,b){return new Promise(function(ok,no){var x=new XMLHttpRequest();x.open(b===undefined?'GET':'POST','/api/'+p);x.setRequestHeader('x-code',code);
 x.onload=function(){var j={};try{j=JSON.parse(x.responseText)}catch(e){}if(x.status===403){showLogin(t('Wrong code.'));no(j)}else ok(j)};x.onerror=function(){no({error:t('The TV did not answer. Is the phone on the same Wi-Fi?')})};
 x.send(b===undefined?null:JSON.stringify(b))})}
function msg(s,e){$('msg').innerHTML=s?'<p class="m'+(e?' e':'')+'"></p>':'';if(s)$('msg').firstChild.textContent=s}
function showLogin(s){$('login').className='';$('main').className='hide';$('sum').textContent=s||''}
function el(tag,attrs,text){var e=document.createElement(tag);for(var k in attrs||{})e.setAttribute(k,attrs[k]);if(text!==undefined)e.textContent=text;return e}
/* one app: which of the TV's apps, and the Android package that opens instead */
function addRow(id,pkg){var r=el('div',{'class':'sl'}),sel=el('select',{}),pk=el('input',{type:'text',placeholder:'${PLEX}',autocomplete:'off',autocapitalize:'off',spellcheck:'false'}),rm=el('button',{type:'button'},t('Remove')),have=false;
 (S.apps||[]).forEach(function(a){if(a.id===id)have=true;sel.appendChild(el('option',{value:a.id},a.title||a.id))});
 if(id&&!have)sel.appendChild(el('option',{value:id},id));if(id)sel.value=id;pk.value=pkg||'';
 sel.onchange=function(){if(!pk.value&&sel.value==='plex')pk.value='${PLEX}'};
 rm.onclick=function(){r.parentNode.removeChild(r);rows.splice(rows.indexOf(r),1)};
 [el('label',{},t('App on the TV')),sel,el('label',{},t('Android package on the box')),pk,rm].forEach(function(x){r.appendChild(x)});
 r._sel=sel;r._pk=pk;rows.push(r);$('apps').appendChild(r)}
function draw(){var s=S.settings||{},ids=Object.keys(s.apps||{});$('host').value=s.host||'';$('port').value=s.port||5555;$('input').value=s.input||'com.webos.app.hdmi2';
 $('apps').innerHTML='';rows=[];if(!ids.length){var plex=(S.apps||[]).some(function(a){return a.id==='plex'});addRow(plex?'plex':'',plex?'${PLEX}':'')}else ids.forEach(function(i){addRow(i,s.apps[i])})}
function collect(){var apps={};rows.forEach(function(r){var i=r._sel.value,p=r._pk.value.trim();if(i&&p)apps[i]=p});return {host:$('host').value.trim(),port:+$('port').value||5555,input:$('input').value,apps:apps}}
function save(b,done){msg(t('Saving…'));api('save',b).then(function(r){if(r.error)return msg(t(r.error),1);S.settings=r.settings||null;draw();msg(done)},function(e){msg(e.error,1)})}
function state(){return api('state').then(function(s){S=s;$('login').className='hide';$('main').className='';$('sum').textContent='';draw()})}
$('add').onclick=function(){addRow('','')};
$('save').onclick=function(){save(collect(),t('Saved. On the TV, choose Test the connection.'))};
$('off').onclick=function(){save({host:''},t('Switched off.'))};
$('go').onclick=function(){code=$('code').value.trim();state().catch(function(){})};
code=(location.hash||'').slice(1);if(/^\\d{6}$/.test(code))state().catch(function(){});else showLogin();
`;

function phonePage(lang) {
  const T = s => web.esc(i18n.tr(lang, s));
  const inputs = [1, 2, 3, 4].map(n => `<option value=com.webos.app.hdmi${n}>HDMI ${n}</option>`).join('');
  return (
    `<!doctype html><html lang=${lang}><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${T('Android box')}</title>
<style>*{box-sizing:border-box}body{font:17px -apple-system,system-ui,sans-serif;background:#0d0e12;color:#eee;margin:0;padding:20px 16px 60px;max-width:640px;margin:0 auto}
h1{font-size:26px;margin:4px 0 4px}p{color:#aaa;margin:6px 0}.m{padding:12px 14px;border-radius:12px;background:#1d2a1f;margin:12px 0}.m.e{background:#3a1717}
button,input,select{font:inherit;display:block;width:100%;padding:14px;border-radius:12px;border:1px solid #333;background:#1a1b21;color:#eee;margin:8px 0}
button{text-align:center}button.p{background:#f5f6f8;color:#111;font-weight:600;border:0}label{display:block;color:#aaa;margin:12px 0 0;font-size:15px}
.sl{padding:16px;border-radius:14px;background:#15161b;margin:14px 0}.hide{display:none}details{margin:18px 0}summary{color:#aaa}[dir=rtl] body{text-align:right}</style>
<h1>${T('Android box')}</h1><p id=sum>${T('Connecting to the TV…')}</p>
<div id=login class=hide><p>${T('Enter the code shown on the TV.')}</p><input id=code inputmode=numeric autocomplete=one-time-code><button class=p id=go>${T('Continue')}</button></div>
<div id=main class=hide><p>${T('Opening an app from the list below switches the TV to the box and starts the app there. The box needs network debugging switched on.')}</p><div id=msg></div>
<label>${T('Address of the box')}</label><input id=host type=text inputmode=decimal placeholder=192.168.1.50 autocomplete=off autocapitalize=off>
<label>${T('HDMI input the box is on')}</label><select id=input>${inputs}</select>
<details><summary>${T('Port')}</summary><input id=port type=number value=5555></details>
<div id=apps></div><button type=button id=add>${T('Add an app')}</button>
<button class=p id=save>${T('Save')}</button><button id=off>${T('Switch off')}</button></div>
` +
    i18n.script(lang, PHONE_JS) +
    '<script>' +
    PHONE_JS +
    '</script></html>'
  );
}

module.exports = { phonePage, PLEX };
