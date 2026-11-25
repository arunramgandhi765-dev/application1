'use strict';
/* Plain JavaScript frontend. All API URLs are relative to the FastAPI origin. */
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const path = location.pathname.replace(/\/$/, '') || '/';
let catalog, user, toastTimer;

async function api(url, options = {}) {
  const response = await fetch(url, {...options, credentials:'same-origin', headers:{'Content-Type':'application/json','X-Requested-With':'Edutech', ...options.headers}});
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const detail = body?.detail;
    const message = Array.isArray(detail) ? detail.map(x => `${x.loc.at(-1)}: ${x.msg}`).join(' ') : detail;
    const error = new Error(message || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return body;
}
const post = (url, data) => api(url, {method:'POST', body:JSON.stringify(data)});
function toast(message) {
  const node = $('#toast'); node.textContent = message; node.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => {node.hidden = true;}, 4200);
}
function nextPage() {
  const requested = new URLSearchParams(location.search).get('next') || '/dashboard';
  try {const url = new URL(requested, location.origin); return url.origin === location.origin ? url.pathname + url.search : '/dashboard';} catch {return '/dashboard';}
}
function icon(name) {
  const shapes = {
    chart:'<path d="M4 21V13H9V21M12 21V8H17V21M20 21V3H25V21"/>',
    database:'<ellipse cx="14" cy="5" rx="10" ry="4"/><path d="M4 5v17c0 5 20 5 20 0V5M4 13c0 5 20 5 20 0"/>',
    brain:'<path d="M14 5C10-2 4 3 5 8C-1 9 1 17 5 18C3 24 11 27 14 22V5ZM14 5C18-2 24 3 23 8C29 9 27 17 23 18C25 24 17 27 14 22V5ZM7 9l3 2-1 4M21 9l-3 2 1 4M6 19l4-1M22 19l-4-1"/>',
    code:'<path d="m9 6-7 8 7 8m10-16 7 8-7 8M16 3l-4 22"/>',
    web:'<rect x="2" y="3" width="24" height="22" rx="3"/><path d="M2 9h24M6 6h1m3 0h1m-1 8-4 3 4 3m8-6 4 3-4 3"/>',
    terminal:'<rect x="2" y="3" width="24" height="22" rx="3"/><path d="m7 10 5 4-5 4m8 0h6"/>',
    bug:'<rect x="8" y="7" width="12" height="17" rx="6"/><path d="M11 7V4h6v3M3 10l5 3m12 0 5-3M3 18h5m12 0h5M6 25l4-4m8 0 4 4M14 8v15"/>',
    spark:'<path d="m14 2 3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/>',
    briefcase:'<rect x="2" y="8" width="24" height="17" rx="3"/><path d="M9 8V3h10v5M2 15h24M12 13v4h4v-4"/>',
    target:'<circle cx="14" cy="14" r="11"/><circle cx="14" cy="14" r="6"/><path d="m14 14 10-10m-5 0h5v5"/>',
    book:'<path d="M14 6C10 3 5 3 2 5v19c4-2 8-2 12 0 4-2 8-2 12 0V5c-3-2-8-2-12 1v18M6 9h4M6 13h4m8-4h4m-4 4h4"/>',
    people:'<circle cx="10" cy="8" r="4"/><circle cx="21" cy="10" r="3"/><path d="M2 25v-5c0-8 16-8 16 0v5M20 17c5-1 7 2 7 6v2"/>',
    document:'<path d="M5 2h12l6 6v18H5zM17 2v7h6M9 14h10M9 18h10M9 22h6"/>',
    phone:'<rect x="7" y="2" width="14" height="24" rx="3"/><path d="M11 5h6M12 23h4"/>',
    cloud:'<path d="M6 22C-1 22-1 11 6 10c0-10 17-11 18 0 7 1 7 12 0 12H6ZM10 18l4-4 4 4m-4-4v11"/>',
    car:'<path d="M3 20v-7l4-8h14l4 8v7H3ZM4 13h20M6 20v4m16-4v4M7 16h3m8 0h3"/>',
  };
  return `<svg class="icon" viewBox="0 0 28 28" aria-hidden="true">${shapes[name] || shapes.book}</svg>`;
}
const chevron = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg>';
function card(item, group, linkLabel = 'Explore') {
  return `<a class="card" href="/${group}/${esc(item.slug)}">${icon(item.icon)}<h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><span class="card-link">${esc(linkLabel)}</span></a>`;
}
function breadcrumb(group, name) {
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/${group}">${({courses:'Courses',practice:'Practice',resources:'Resources',products:'Our Products'})[group]}</a>${name ? `<span aria-hidden="true">/</span><span aria-current="page">${esc(name)}</span>` : ''}</nav>`;
}
function intro(title, description, eyebrow = 'LEARN WITH EDUTECH') {
  return `<div class="page-intro"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`;
}
function title(value) {document.title = `${value} | Edutech`;}
function renderHeader() {
  const sections = [['courses','Courses'],['practice','Practice'],['resources','Resources'],['products','Our Products']];
  $('#site-header').innerHTML = `<div class="account-bar">${user ? `<span class="account-name">Hello, ${esc(user.name)}</span><a href="/dashboard">My learning</a><button id="logout" type="button">Log out</button>` : '<a href="/login">Login</a><a class="small-button" href="/signup">Sign up</a>'}</div>
    <div class="main-nav"><a class="brand" href="/" aria-label="Edutech home"><span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i></span>edutech</a>
    <button class="mobile-menu" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Open navigation">${icon('web')}</button>
    <nav class="nav-links" id="nav-links" aria-label="Main navigation">${sections.map(([group,label]) => `<div class="nav-group"><a class="nav-link" href="/${group}" ${path.startsWith('/'+group) ? 'aria-current="page"' : ''}>${label}</a><button class="menu-toggle" type="button" aria-label="Show ${label} menu" aria-expanded="false" aria-controls="menu-${group}">${chevron}</button><div class="dropdown ${catalog[group].length > 5 ? 'dropdown-wide' : ''}" id="menu-${group}" hidden>${catalog[group].map(item=>`<a href="/${group}/${esc(item.slug)}">${icon(item.icon)}<span><strong>${esc(item.name)}</strong><small>${esc(item.description)}</small></span></a>`).join('')}</div></div>`).join('')}</nav></div>`;
  const closeMenus = () => $$('.menu-toggle').forEach(button => {button.setAttribute('aria-expanded','false'); $('#'+button.getAttribute('aria-controls')).hidden = true;});
  $$('.menu-toggle').forEach(button=>button.addEventListener('click',()=>{const open = button.getAttribute('aria-expanded') === 'true'; closeMenus(); if(!open){button.setAttribute('aria-expanded','true');$('#'+button.getAttribute('aria-controls')).hidden=false;}}));
  $('.mobile-menu').addEventListener('click', e=>{const button=e.currentTarget; const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));$('#nav-links').classList.toggle('mobile-open',open);if(!open) closeMenus();});
  document.addEventListener('click', e=>{if(!e.target.closest('.nav-group')) closeMenus();});
  document.addEventListener('keydown', e=>{if(e.key==='Escape'){const open=$('.menu-toggle[aria-expanded="true"]');closeMenus();if(open) open.focus();}});
  $('#logout')?.addEventListener('click',async()=>{try{await post('/api/auth/logout',{});location.assign('/');}catch(error){toast(error.message);}});
}
function home() {
  title('Learn. Build. Lead with AI.');
  $('#main').innerHTML = `<section class="hero" aria-labelledby="hero-title"><img class="hero-art" src="/static/hero.png" alt="A glowing golden neural network above an open laptop" width="1536" height="1024" fetchpriority="high"><div class="hero-copy"><p class="eyebrow">Learn with Edutech</p><h1 id="hero-title">Learn. Build.<br><span class="gold-text">Lead with AI.</span></h1><p class="lead">Practical courses in data and AI.<br>Build your skills, one project at a time.</p><div class="actions"><a class="button button-primary" href="/courses">Explore Courses</a><a class="button" href="/practice">Start Practising</a></div></div></section>
  <section class="section home-courses"><div class="section-title"><h2>Choose your course</h2></div><div class="cards">${catalog.courses.slice(0,3).map(c=>card(c,'courses','View course')).join('')}</div></section>
  <section class="section subtle-section"><div class="section-head"><div><p class="eyebrow">Small steps. Real progress.</p><h2>Put your learning into practice.</h2><p>From your first line of code to your next SQL query, make room to experiment.</p></div><a class="text-link" href="/practice">Explore practice</a></div><div class="practice-grid">${catalog.practice.map(c=>card(c,'practice','Start practising')).join('')}</div></section>
  <section class="section subtle-section"><div class="section-head"><div><p class="eyebrow">Keep your curiosity going</p><h2>A space for every next step.</h2><p>Explore learning resources, build a resume, or share a question with the community.</p></div><a class="button" href="/resources">Explore Resources</a></div></section>`;
}
function listing(group) {
  const details = {courses:['Find your next course.','Explore data, AI, and the skills that connect them. Choose a subject to see its learning outline.'],practice:['Learn by doing.','Choose a practice space, try an exercise, and build your confidence one problem at a time.'],products:['More ways to move forward.','Explore learning for children, solutions for teams, and preparation for your next interview.'],resources:['Make room for curiosity.','References, learning paths, tools, and a community to support your next step.']};
  const [heading,description] = details[group];title(group==='products'?'Our Products':group[0].toUpperCase()+group.slice(1));
  $('#main').innerHTML = breadcrumb(group) + intro(heading,description) + (group==='courses'?'<div class="search-row"><label class="sr-only" for="course-search">Search courses</label><input id="course-search" type="search" placeholder="Search courses, Python, SQL, AI…" autocomplete="off"></div>':'') + `<section class="section" style="padding-top:0"><div id="listing-cards" class="${group==='practice'?'practice-grid':'cards'}">${catalog[group].map(item=>card(item,group,group==='practice'?'Open practice':'Explore')).join('')}</div><p id="search-empty" hidden>No matching courses. Try a different search.</p></section>`;
  $('#course-search')?.addEventListener('input', e=>{const q=e.target.value.toLowerCase().trim();const matches=catalog.courses.filter(c=>(c.name+' '+c.description).toLowerCase().includes(q));$('#listing-cards').innerHTML=matches.map(c=>card(c,'courses','View course')).join('');$('#search-empty').hidden=!!matches.length;});
}
async function coursePage(slug) {
  const item=await api('/api/courses/'+encodeURIComponent(slug));title(item.name);
  let saved=false;if(user){const items=await api('/api/me/saved-courses');saved=items.some(c=>c.slug===slug);}
  $('#main').innerHTML=breadcrumb('courses',item.name)+intro(item.name,item.overview,item.tag)+`<div class="detail-grid"><section class="panel"><h2>What you’ll explore</h2><ul class="topics">${item.topics.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section><aside class="panel side-panel">${icon(item.icon)}<h2 class="spaced">Your next step</h2><p>Save this course to your learning list, or ask us about the course and upcoming batches.</p><button class="button button-primary" id="save-course" type="button">${saved?'Saved to my learning':'Save course'}</button><a class="button" href="/contact?topic=${encodeURIComponent(item.name)}">Enquire about this course</a><a class="text-link" href="/practice">Try a practice exercise</a></aside></div>`;
  $('#save-course').addEventListener('click',async e=>{if(!user){location.assign('/login?next='+encodeURIComponent(path));return;}const button=e.currentTarget;button.disabled=true;try{await post('/api/me/saved-courses',{course_slug:slug});button.textContent='Saved to my learning';toast('Course saved to My learning.');}catch(error){toast(error.message);}finally{button.disabled=false;}});
}
function formMessage(form,message,error=false){const node=$('.form-message',form);node.textContent=message;node.classList.toggle('error-text',error);node.classList.toggle('success-text',!error);}
function authPage(signup=false) {
  title(signup?'Create your account':'Welcome back');
  if(user){location.replace(nextPage());return;}
  $('#main').innerHTML=`<section class="auth-layout"><div class="auth-aside"><p class="eyebrow">Your next chapter starts here</p><h1>Keep learning.<br><span class="gold-text">Keep building.</span></h1><p>Your courses, practice spaces, and learning journey in one place.</p><img src="/static/hero.png" alt="Golden AI learning illustration" width="1536" height="1024"></div><div class="auth-card"><h2>${signup?'Create your account':'Welcome back.'}</h2><p>${signup?'Start your learning journey with Edutech.':'Log in to pick up your learning journey.'}</p><form id="auth-form">${signup?'<div class="form-field"><label for="name">Your name</label><input id="name" name="name" required minlength="2" maxlength="80" autocomplete="name"></div>':''}<div class="form-field"><label for="email">Email address</label><input id="email" name="email" type="email" required maxlength="254" autocomplete="email"></div><div class="form-field"><label for="password">Password</label><div class="password-field"><input id="password" name="password" type="password" required minlength="${signup?12:1}" maxlength="128" autocomplete="${signup?'new-password':'current-password'}"><button class="password-toggle" type="button" aria-label="Show password">Show</button></div>${signup?'<p class="form-help">Use at least 12 characters. A memorable phrase works well.</p>':''}</div><button class="button button-primary" type="submit">${signup?'Create account':'Log in'}</button><p class="form-message" role="status" aria-live="polite"></p></form><p class="auth-switch">${signup?'Already have an account?':'New to Edutech?'} <a class="text-link" href="/${signup?'login':'signup'}${location.search}">${signup?'Log in':'Create an account'}</a></p></div></section>`;
  $('.password-toggle').addEventListener('click',e=>{const field=$('#password');const show=field.type==='password';field.type=show?'text':'password';e.currentTarget.textContent=show?'Hide':'Show';e.currentTarget.setAttribute('aria-label',show?'Hide password':'Show password');});
  $('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const button=$('button[type=submit]',form);button.disabled=true;formMessage(form,'');try{await post('/api/auth/'+(signup?'signup':'login'),Object.fromEntries(new FormData(form)));location.assign(nextPage());}catch(error){formMessage(form,error.message,true);}finally{button.disabled=false;}});
}
function contactPage() {
  title('Contact us');const topic=new URLSearchParams(location.search).get('topic')||'General enquiry';
  const choices=[...new Set(['General enquiry',...catalog.courses.map(x=>x.name),...catalog.products.map(x=>x.name),'Become An Affiliate','Success Stories'])];if(!choices.includes(topic))choices.push(topic.slice(0,80));
  $('#main').innerHTML=intro('Let’s talk about your next step.','Tell us what you would like to learn or how we can help.','CONTACT EDUTECH')+`<div class="contact-layout"><form id="enquiry-form" class="panel"><div class="form-columns"><div class="form-field"><label for="contact-name">Your name</label><input id="contact-name" name="name" required minlength="2" maxlength="80" value="${esc(user?.name||'')}" autocomplete="name"></div><div class="form-field"><label for="contact-email">Email address</label><input id="contact-email" name="email" type="email" required maxlength="254" value="${esc(user?.email||'')}" autocomplete="email"></div></div><div class="form-field"><label for="contact-topic">What are you interested in?</label><select id="contact-topic" name="topic">${choices.map(c=>`<option ${c===topic?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="form-field"><label for="message">Your message</label><textarea id="message" name="message" required minlength="10" maxlength="2000" placeholder="Tell us about your learning goals or requirements…"></textarea></div><button type="submit" class="button button-primary">Submit enquiry</button><p class="form-message" role="status" aria-live="polite"></p></form><aside class="panel"><h2>Make it personal.</h2><p>Share the course or product you’re interested in and the questions you have.</p><p>For HackerKID enquiries, please use a parent or guardian’s name and email.</p><a class="text-link" href="/courses">Explore our courses</a></aside></div>`;
  $('#enquiry-form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const button=$('button[type=submit]',form);button.disabled=true;try{const result=await post('/api/enquiries',Object.fromEntries(new FormData(form)));formMessage(form,`Your enquiry has been recorded. Reference #${result.reference}.`);$('#message').value='';}catch(error){formMessage(form,error.message,true);}finally{button.disabled=false;}});
}
async function dashboard() {
  title('My learning');if(!user){location.replace('/login?next=/dashboard');return;}
  const [courses,enquiries]=await Promise.all([api('/api/me/saved-courses'),api('/api/me/enquiries')]);
  $('#main').innerHTML=intro(`Hello, ${user.name}.`,'Make a little time for your next skill. Your saved courses and enquiries are here.','MY LEARNING')+`<section class="section"><div class="section-title"><h2>Your saved courses</h2></div>${courses.length?`<div class="cards">${courses.map(c=>`<article class="card saved-card">${icon(c.icon)}<h3><a href="/courses/${esc(c.slug)}">${esc(c.name)}</a></h3><p>${esc(c.description)}</p><a class="text-link" href="/courses/${esc(c.slug)}">View course</a><button class="button button-small remove-saved" data-slug="${esc(c.slug)}" type="button">Remove from saved</button></article>`).join('')}</div>`:'<div class="empty-state"><h2>Your next skill is waiting.</h2><p>Save a course to find it here whenever you return.</p><a class="button button-primary" href="/courses">Explore courses</a></div>'}</section><section class="section"><div class="section-head"><h2>Your enquiries</h2><a class="text-link" href="/contact">New enquiry</a></div>${enquiries.length?`<ul class="enquiry-list">${enquiries.map(e=>`<li><strong>${esc(e.topic)}</strong><span class="note">Reference #${e.id} · ${new Date(e.created_at*1000).toLocaleDateString()}</span><p>${esc(e.message)}</p></li>`).join('')}</ul>`:'<p>You haven’t submitted an enquiry while logged in.</p>'}</section><a class="button" href="/practice">Open practice</a>`;
  $$('.remove-saved').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await api('/api/me/saved-courses/'+b.dataset.slug,{method:'DELETE'});await dashboard();}catch(error){toast(error.message);b.disabled=false;}}));
}
async function productPage(slug) {
  const item=await api('/api/products/'+encodeURIComponent(slug));title(item.name);
  $('#main').innerHTML=breadcrumb('products',item.name)+intro(item.name,item.overview,item.tag)+`<div class="detail-grid"><section class="panel"><h2>${slug==='placement-preparation'?'Practise your next step':'Explore the possibilities'}</h2><ul class="topics">${item.topics.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section><aside class="panel side-panel">${icon(item.icon)}<h2 class="spaced">Start a conversation.</h2><p>${esc(item.contact)}</p><a class="button button-primary" href="/contact?topic=${encodeURIComponent(item.name)}">Enquire now</a></aside></div>${slug==='placement-preparation'?'<section class="panel" id="quiz-area"></section>':''}`;
  if(slug==='placement-preparation')renderQuiz();
}
function renderQuiz() {
  const questions=[{q:'A train covers 150 km in 3 hours. What is its average speed?',options:['30 km/h','50 km/h','75 km/h'],answer:1,why:'Average speed = distance ÷ time = 150 ÷ 3 = 50 km/h.'},{q:'What comes next: 2, 6, 12, 20, …?',options:['24','28','30'],answer:2,why:'The differences are 4, 6, 8, then 10. So the next number is 30.'},{q:'If 3 notebooks cost 90, how many notebooks can you buy for 150 at the same rate?',options:['4','5','6'],answer:1,why:'Each notebook costs 90 ÷ 3 = 30, so 150 ÷ 30 = 5 notebooks.'}];
  // Aptitude question avoids publishing course pricing or fees.
  $('#quiz-area').innerHTML=`<h2>Try a short aptitude quiz.</h2><p>Three sample questions to get you thinking.</p><form id="quiz-form">${questions.map((q,i)=>`<div class="quiz-question"><fieldset><legend>${esc(q.q)}</legend>${q.options.map((o,j)=>`<label class="quiz-option"><input type="radio" name="q${i}" value="${j}" required>${esc(o)}</label>`).join('')}</fieldset></div>`).join('')}<button class="button button-primary" type="submit">Check answers</button><div class="form-message" role="status" id="quiz-result"></div></form>`;
  $('#quiz-form').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.currentTarget);let score=0;const results=questions.map((q,i)=>{const pass=Number(data.get('q'+i))===q.answer;score+=Number(pass);return `<p class="${pass?'success-text':'error-text'}">${pass?'Correct.':'Try again.'} ${esc(q.why)}</p>`;});$('#quiz-result').innerHTML=`<h3>${score} of ${questions.length} correct</h3>`+results.join('');});
}

function runJavaScript(code, tests=null, stdin='') {
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.hidden=true;frame.title='Isolated JavaScript runner';frame.setAttribute('sandbox','allow-scripts');frame.src='/static/runner.html';
    const id=crypto.randomUUID?crypto.randomUUID():String(Math.random());let logs=[],results=null,done=false;
    const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();error?reject(new Error(error)):resolve({logs,results});};
    const receive=event=>{if(event.source!==frame.contentWindow)return;const data=event.data;if(data?.kind==='ready'){frame.contentWindow.postMessage({type:'run',id,code,tests,stdin},'*');return;}if(data?.id!==id)return;if(data.kind==='log')logs.push(String(data.text));if(data.kind==='tests')results=data.results;if(data.kind==='error')finish(data.text);if(data.kind==='done')finish();};
    const timer=setTimeout(()=>finish('The runner timed out. Please try again.'),4500);window.addEventListener('message',receive);document.body.append(frame);
  });
}
function enableTabs(textarea) {
  textarea.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();const start=textarea.selectionStart,end=textarea.selectionEnd;textarea.setRangeText('  ',start,end,'end');textarea.dispatchEvent(new Event('input'));}});
}
async function practicePage(slug) {
  const item=await api('/api/practice/'+encodeURIComponent(slug));title(item.name);
  $('#main').innerHTML=breadcrumb('practice',item.name)+intro(item.name,item.overview,item.tag)+'<div id="practice-workspace"></div>';
  if(slug==='codekata'||slug==='fixthecode')await challengeWorkspace(slug);
  if(slug==='sqlkata')sqlWorkspace();
  if(slug==='webkata')webWorkspace();
  if(slug==='ide')await ideWorkspace();
}
async function challengeWorkspace(slug) {
  const challenges=await api(`/api/practice/${slug}/challenges`);let current=challenges[0];
  $('#practice-workspace').innerHTML=`<div class="toolbar"><label for="challenge">Choose an exercise</label><select id="challenge">${challenges.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></div><div class="workspace"><section class="panel"><span class="pill">Beginner · JavaScript</span><h2 class="spaced" id="challenge-title"></h2><p id="challenge-description"></p><h3>Example checks</h3><ul id="challenge-tests" class="test-list"></ul><p class="note">These are starter exercises with visible example checks, not a certification or interview assessment.</p></section><section class="panel"><label for="code-editor">Your solution</label><textarea id="code-editor" class="code-editor" spellcheck="false"></textarea><div class="editor-actions"><button class="button button-primary" id="run-code" type="button">Run checks</button><button class="button" id="reset-code" type="button">Reset code</button></div></section></div><section class="panel"><h2>Results</h2><pre class="output" id="code-output" role="status" aria-live="polite">Run your solution to see the results.</pre></section>`;
  const setChallenge=()=>{$('#challenge-title').textContent=current.name;$('#challenge-description').textContent=current.description;$('#code-editor').value=current.starter;$('#challenge-tests').innerHTML=current.tests.map(t=>`<li><span>Input: <code>${esc(JSON.stringify(t.input))}</code></span><br>Expected: <code>${esc(JSON.stringify(t.expected))}</code></li>`).join('');$('#code-output').textContent='Run your solution to see the results.';};setChallenge();enableTabs($('#code-editor'));
  $('#challenge').addEventListener('change',e=>{current=challenges.find(c=>c.id===e.target.value);setChallenge();});$('#reset-code').addEventListener('click',()=>{$('#code-editor').value=current.starter;});
  $('#run-code').addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;$('#code-output').textContent='Running…';try{const {logs,results}=await runJavaScript($('#code-editor').value,current.tests);$('#code-output').textContent=[...logs,...results.map((r,i)=>`${r.pass?'PASS':'FAIL'} — Check ${i+1}\nExpected: ${r.expected}\nReceived: ${r.actual}`)].join('\n\n');if(results.every(r=>r.pass)){try{const completed=new Set(JSON.parse(localStorage.getItem('edutech-completed')||'[]'));completed.add(`${slug}/${current.id}`);localStorage.setItem('edutech-completed',JSON.stringify([...completed]));}catch{/* Storage is optional. */}}}catch(error){$('#code-output').textContent=error.message;}finally{button.disabled=false;}});
}
function sqlWorkspace() {
  $('#practice-workspace').innerHTML=`<div class="workspace"><section class="panel schema"><h2>Your practice database</h2><p><strong>employees</strong><br><code>id, name, department_id, salary</code></p><p><strong>departments</strong><br><code>id, name</code></p><p>Try finding each employee’s department or the average salary by department.</p><p class="note">SELECT queries only. Results are limited to 100 rows. This sample database is separate from user accounts.</p><button class="button button-small" type="button" id="load-join">Load a JOIN example</button></section><section class="panel"><label for="sql-editor">SQL query</label><textarea id="sql-editor" class="code-editor" spellcheck="false">SELECT name, salary\nFROM employees\nORDER BY salary DESC;</textarea><div class="editor-actions"><button class="button button-primary" id="run-sql" type="button">Run query</button></div></section></div><section class="panel"><h2>Query results</h2><p id="sql-status" role="status">Run a query to see the result.</p><div id="sql-results" class="result-table"></div></section>`;
  enableTabs($('#sql-editor'));$('#load-join').addEventListener('click',()=>{$('#sql-editor').value='SELECT e.name, d.name AS department\nFROM employees AS e\nJOIN departments AS d\n  ON e.department_id = d.id\nORDER BY e.name;';});
  $('#run-sql').addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;$('#sql-status').textContent='Running…';$('#sql-results').innerHTML='';try{const data=await post('/api/practice/sqlkata/run',{query:$('#sql-editor').value});$('#sql-status').textContent=`${data.rows.length} rows returned.${data.truncated?' Showing the first 100 rows.':''}`;$('#sql-results').innerHTML=`<table><thead><tr>${data.columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v===null?'NULL':v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}catch(error){$('#sql-status').textContent=error.message;}finally{button.disabled=false;}});
}
function webWorkspace() {
  $('#practice-workspace').innerHTML=`<div class="web-editors"><div><label for="html-editor">HTML</label><textarea id="html-editor" class="code-editor short" spellcheck="false"></textarea></div><div><label for="css-editor">CSS</label><textarea id="css-editor" class="code-editor short" spellcheck="false"></textarea></div><div><label for="js-editor">JavaScript</label><textarea id="js-editor" class="code-editor short" spellcheck="false"></textarea></div></div><div class="editor-actions"><button class="button button-primary" id="preview-web" type="button">Update preview</button><button class="button" id="reset-web" type="button">Reset example</button></div><p class="note">The preview is isolated. External requests and navigation outside the preview are disabled.</p><iframe class="web-preview" id="web-preview" title="Your website preview" sandbox="allow-scripts"></iframe><section class="panel"><h2>Try a backend API.</h2><p>A frontend can request data from a backend. This button calls the course API and displays its JSON response.</p><code>GET /api/courses</code><div class="editor-actions"><button class="button" type="button" id="api-example">Fetch courses</button></div><pre class="output spaced" id="api-output" role="status">Your API response will appear here.</pre></section>`;
  const reset=()=>{$('#html-editor').value='<main>\n  <h1>Hello, Edutech!</h1>\n  <p>My first web project.</p>\n  <button id="hello">Say hello</button>\n</main>';$('#css-editor').value='body {\n  font-family: system-ui;\n  background: #0b141d;\n  color: #f5d47d;\n  padding: 30px;\n}\nbutton { padding: 12px 20px; }';$('#js-editor').value='document.getElementById("hello")\n  .addEventListener("click", () => {\n    document.querySelector("p").textContent =\n      "Keep learning. Keep building.";\n  });';};
  const preview=()=>{$('#web-preview').srcdoc=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>${$('#css-editor').value}</style></head><body>${$('#html-editor').value}<script>${$('#js-editor').value}<\/script></body></html>`;};
  reset();preview();['html','css','js'].forEach(x=>enableTabs($('#'+x+'-editor')));$('#preview-web').addEventListener('click',preview);$('#reset-web').addEventListener('click',()=>{reset();preview();});$('#api-example').addEventListener('click',async()=>{try{$('#api-output').textContent=JSON.stringify(await api('/api/courses'),null,2);}catch(error){$('#api-output').textContent=error.message;}});
}
async function ideWorkspace() {
  const config=await api('/api/compiler/languages');
  $('#practice-workspace').innerHTML=`<div class="toolbar"><label for="language">Language</label><select id="language">${config.languages.map(l=>`<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div>${config.remote_available?'':'<p class="notice">JavaScript is ready to run. Additional languages are not connected yet.</p>'}<div class="workspace"><section class="panel"><label for="ide-editor">Your code</label><textarea id="ide-editor" class="code-editor" spellcheck="false">console.log("Hello, Edutech!");\n\nconst skills = ["Python", "SQL", "AI"];\nskills.forEach(skill => console.log("Learn " + skill));</textarea><div class="editor-actions"><button class="button button-primary" id="run-ide" type="button">Run code</button></div></section><section class="panel"><label for="stdin">Standard input (optional)</label><textarea id="stdin" class="code-editor short" spellcheck="false" placeholder="One input per line"></textarea><p class="form-help">In JavaScript, use readline() to read a line of input.</p><h2 class="spaced">Output</h2><pre class="output" id="ide-output" role="status" aria-live="polite">Your output will appear here.</pre></section></div>`;
  enableTabs($('#ide-editor'));$('#run-ide').addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;$('#ide-output').textContent='Running…';try{const language=$('#language').value;if(language==='javascript'){const result=await runJavaScript($('#ide-editor').value,null,$('#stdin').value);$('#ide-output').textContent=result.logs.join('\n')||'Completed with no console output.';}else{const result=await post('/api/compiler/run',{language_id:Number(language),source_code:$('#ide-editor').value,stdin:$('#stdin').value});$('#ide-output').textContent=[result.stdout,result.stderr,result.compile_output,result.message,result.status?.description].filter(Boolean).join('\n')||'No output returned.';}}catch(error){$('#ide-output').textContent=error.message;}finally{button.disabled=false;}});
}

const learningGuides = [
  {name:'Python essentials',body:'PYTHON ESSENTIALS\n\nVariables store values:\nname = "Edutech"\ncount = 3\n\nLists hold multiple items:\nskills = ["Python", "SQL", "AI"]\n\nLoops repeat an action:\nfor skill in skills:\n    print(skill)\n\nFunctions group reusable work:\ndef add(a, b):\n    return a + b\n\nPractice: write a function that adds every number in a list.'},
  {name:'SQL quick reference',body:'SQL QUICK REFERENCE\n\nChoose columns:\nSELECT name, salary FROM employees;\n\nFilter rows:\nSELECT * FROM employees WHERE salary > 50000;\n\nSort results:\nSELECT name FROM employees ORDER BY name;\n\nGroup and aggregate:\nSELECT department_id, AVG(salary)\nFROM employees GROUP BY department_id;\n\nJoin tables:\nSELECT e.name, d.name AS department\nFROM employees e JOIN departments d\nON e.department_id = d.id;\n\nTry these queries in Edutech SQLKata.'},
  {name:'AI learning glossary',body:'AI LEARNING GLOSSARY\n\nMachine learning: learning patterns from examples to make predictions.\n\nModel: a mathematical system whose parameters are learned from data.\n\nTraining: adjusting model parameters using examples and a learning objective.\n\nInference: using a trained model to produce an output for a new input.\n\nEmbedding: a numerical representation of an item, often used to compare meaning or similarity.\n\nRAG: retrieving relevant information and including it as context for a model when generating an answer.\n\nEvaluation: measuring how well a system performs on representative tasks.\n\nNext step: choose a small problem, define success, and test your solution.'}
];
function downloadText(name,text,type='text/plain') {const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function resourcePage(slug) {
  const item=await api('/api/resources/'+encodeURIComponent(slug));title(item.name);$('#main').innerHTML=breadcrumb('resources',item.name)+intro(item.name,item.overview,item.tag)+'<section id="resource-content"></section>';
  const content=$('#resource-content');
  if(slug==='free-resources'){
    content.innerHTML=`<div class="cards">${learningGuides.map((g,i)=>`<article class="panel"><h2>${esc(g.name)}</h2><p>A short reference you can keep beside your practice.</p><button class="button download-guide" data-guide="${i}" type="button">Download TXT</button><details class="spaced"><summary>Read the guide</summary><pre class="output spaced">${esc(g.body)}</pre></details></article>`).join('')}</div>`;
    $$('.download-guide').forEach(b=>b.addEventListener('click',()=>{const g=learningGuides[Number(b.dataset.guide)];downloadText(g.name.toLowerCase().replaceAll(' ','-')+'.txt',g.body);}));
  } else if(slug==='success-stories'){
    content.innerHTML=`<div class="empty-state">${icon('spark')}<h2>Every learning journey has a beginning.</h2><p>Edutech learner stories will appear here when they are available. Have a learning experience you would like to share?</p><a class="button button-primary" href="/contact?topic=Success%20Stories">Share your story</a></div>`;
  } else if(slug==='learn-hub'){
    content.innerHTML=`<div class="cards">${catalog.courses.slice(0,3).map(c=>`<article class="panel">${icon(c.icon)}<h2 class="spaced">${esc(c.name)}</h2><ul class="topics">${c.topics.slice(0,4).map(t=>`<li>${esc(t)}</li>`).join('')}</ul><a class="button button-primary spaced" href="/courses/${c.slug}">Explore the course</a></article>`).join('')}</div><div class="notice"><p>Pair a course topic with a small exercise. Start with coding, then try SQL or a webpage.</p><a class="text-link" href="/practice">Choose a practice space</a></div>`;
  } else if(slug==='rewards'){
    let count=0;try{const values=JSON.parse(localStorage.getItem('edutech-completed')||'[]');count=Array.isArray(values)?new Set(values).size:0;}catch{}
    content.innerHTML=`<section class="panel"><h2>Your learning milestones</h2><p><strong class="gold-text">${count}</strong> starter coding exercises passed on this browser.</p><ul class="topics"><li>${count>=1?'Achieved':'Next milestone'}: complete your first CodeKata or FixTheCode exercise</li><li>${count>=3?'Achieved':'Keep practising'}: complete three different exercises</li><li>${count>=5?'Achieved':'Keep building'}: complete all five starter exercises</li></ul><p class="note">Milestones are stored on this device and are not verified credentials. No reward programme is currently active.</p><a class="button button-primary" href="/practice">Keep practising</a></section>`;
  } else if(slug==='leaderboard'){
    content.innerHTML=`<div class="empty-state">${icon('chart')}<h2>A place for future challenges.</h2><p>No ranked challenge is running yet. Rankings will appear when an Edutech challenge is available.</p><a class="button button-primary" href="/practice">Practise your skills</a></div>`;
  } else if(slug==='referral'){
    content.innerHTML=`<div class="panel"><h2>Learning is better together.</h2><p>Share Edutech with a friend who wants to explore data, coding, or AI.</p><label for="share-link">Website link</label><input id="share-link" readonly value="${esc(location.origin+'/')}"><div class="editor-actions"><button id="copy-link" class="button button-primary" type="button">Copy link</button></div><p class="note">Use your published website address when sharing with others. Referral tracking is not currently active.</p></div>`;
    $('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#share-link').value);toast('Website link copied.');}catch{$('#share-link').select();toast('Select and copy the website link.');}});
  } else if(slug==='blogs'){
    content.innerHTML=`<div class="article-list"><article class="panel"><p class="eyebrow">Learning foundations</p><h2>Start small. Make it work.</h2><p>A useful first coding project does one thing clearly. Read a value, transform it, and show the result. For example, add numbers from a list or count how often a word appears.</p><p>Write down the input and expected output before you code. Try a normal example, an empty input, and an unusual value. These checks make it easier to understand what your program should do.</p><a class="text-link" href="/practice/codekata">Try a coding exercise</a></article><article class="panel"><p class="eyebrow">Working with data</p><h2>What a SQL JOIN actually connects</h2><p>A JOIN combines matching rows from two tables. In our sample database, employees have a department_id and departments have an id. Matching these values lets you show an employee’s name beside their department’s name.</p><pre class="output">SELECT e.name, d.name AS department\nFROM employees e\nJOIN departments d ON e.department_id = d.id;</pre><p class="spaced">An INNER JOIN keeps matching rows. A LEFT JOIN also keeps rows from the left table when there is no match on the right.</p><a class="text-link" href="/practice/sqlkata">Try the query in SQLKata</a></article><article class="panel"><p class="eyebrow">Understanding AI</p><h2>Learn the task before the tool</h2><p>Start an AI project by describing what the user needs and what a useful answer looks like. If the task is answering questions from notes, identify the source material and test whether the answer is supported by it.</p><p>Choose a small set of representative questions. Check accuracy, missing information, and how the system behaves when it cannot answer. An impressive demonstration is only the beginning; evaluation tells you where to improve.</p><a class="text-link" href="/courses/artificial-intelligence">Explore AI foundations</a></article></div>`;
  } else if(slug==='get-the-app'){
    content.innerHTML=`<section class="panel"><h2>Edutech, one tap away.</h2><p>You can use this website as a web app on supported browsers.</p><ol><li>Open the browser menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>, if available.</li><li>Open Edutech from your apps or home screen.</li></ol><button class="button button-primary" id="install-app" type="button" hidden>Install Edutech</button><p class="note">An internet or server connection is needed for accounts, course data, and SQL practice. There is no native app-store download available yet.</p></section>`;
    if(installPrompt)$('#install-app').hidden=false;
    $('#install-app').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install-app').hidden=true;}});
  } else if(slug==='become-an-affiliate'){
    content.innerHTML=`<div class="detail-grid"><section class="panel"><h2>Let’s explore working together.</h2><p>Tell us about your audience, community, or organisation and how you would like to introduce learners to Edutech.</p><ul class="topics"><li>Introduce yourself and your community</li><li>Share the topics your learners are interested in</li><li>Describe the collaboration you have in mind</li></ul></section><aside class="panel side-panel"><h2>Start a conversation.</h2><p>Affiliate arrangements are discussed individually. Submitting an enquiry does not create an affiliate account.</p><a class="button button-primary" href="/contact?topic=Become%20An%20Affiliate">Enquire about collaboration</a></aside></div>`;
  } else if(slug==='resume-builder')renderResume();
  else if(slug==='community-hub')await renderCommunity();
}
function renderResume() {
  $('#resource-content').innerHTML=`<div class="workspace"><form class="panel" id="resume-form"><h2>Your details</h2><p class="note">These details stay in this browser tab and are not submitted to the server.</p>${[['fullName','Full name','text'],['email','Email address','email'],['contact','Phone or portfolio URL','text']].map(([key,label,type])=>`<div class="form-field"><label for="resume-${key}">${label}</label><input id="resume-${key}" name="${key}" type="${type}" maxlength="180"></div>`).join('')}${[['summary','Professional summary'],['skills','Skills'],['education','Education'],['experience','Experience and projects']].map(([key,label])=>`<div class="form-field"><label for="resume-${key}">${label}</label><textarea id="resume-${key}" name="${key}" maxlength="3000"></textarea></div>`).join('')}<div class="actions"><button class="button button-primary" type="button" id="print-resume">Print / Save PDF</button><button class="button" type="button" id="download-resume">Download TXT</button></div></form><div><article id="resume-preview" class="resume-sheet"></article></div></div>`;
  const values=()=>Object.fromEntries(new FormData($('#resume-form')));
  const update=()=>{const d=values();$('#resume-preview').innerHTML=`<h1>${esc(d.fullName||'Your name')}</h1><p class="resume-contact">${esc([d.email,d.contact].filter(Boolean).join(' · '))}</p>${[['summary','Profile'],['skills','Skills'],['education','Education'],['experience','Experience & Projects']].map(([key,label])=>d[key]?`<section><h2>${label}</h2><p>${esc(d[key])}</p></section>`:'').join('')}<p class="resume-empty" ${Object.values(d).some(Boolean)?'hidden':''}>Fill in your details to build your resume.</p>`;};
  $('#resume-form').addEventListener('input',update);$('#resume-form').addEventListener('submit',e=>e.preventDefault());$('#print-resume').addEventListener('click',()=>window.print());$('#download-resume').addEventListener('click',()=>{const d=values();downloadText('edutech-resume.txt',[d.fullName,d.email,d.contact,...['summary','skills','education','experience'].map(k=>d[k]?k.toUpperCase()+'\n'+d[k]:'')].filter(Boolean).join('\n\n'));});update();
}
async function renderCommunity() {
  const posts=await api('/api/community');
  $('#resource-content').innerHTML=`${user?`<form id="community-form" class="panel"><label for="community-body">What are you learning?</label><textarea id="community-body" name="body" required minlength="5" maxlength="1000" placeholder="Ask a question, share an insight, or talk about a project…"></textarea><div class="editor-actions"><button class="button button-primary" type="submit">Post to community</button></div><p class="form-message" role="status"></p></form>`:`<div class="notice"><p>Log in to join the conversation.</p><a class="button button-primary" href="/login?next=/resources/community-hub">Log in</a></div>`}<div class="article-list spaced">${posts.length?posts.map(p=>`<article class="panel community-post"><strong>${esc(p.name)}</strong><span class="note"> · ${new Date(p.created_at*1000).toLocaleDateString()}</span><p class="spaced post-body">${esc(p.body)}</p>${user?.id===p.user_id?`<button class="button button-small delete-post" type="button" data-id="${p.id}">Delete my post</button>`:''}</article>`).join(''):'<div class="empty-state"><h2>Start the first conversation.</h2><p>Ask a learning question or share something you have built.</p></div>'}</div>`;
  $('#community-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const button=$('button[type=submit]',form);button.disabled=true;try{await post('/api/community',Object.fromEntries(new FormData(form)));await renderCommunity();toast('Your post is now in the community.');}catch(error){formMessage(form,error.message,true);button.disabled=false;}});
  $$('.delete-post').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/api/community/'+button.dataset.id,{method:'DELETE'});await renderCommunity();}catch(error){toast(error.message);button.disabled=false;}}));
}

let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;if($('#install-app'))$('#install-app').hidden=false;});
async function boot() {
  $('#year').textContent=new Date().getFullYear();
  try {
    [catalog,user]=await Promise.all([api('/api/catalog'),api('/api/auth/me').catch(error=>{if(error.status===401)return null;throw error;})]);
    renderHeader();const parts=path.split('/').filter(Boolean);
    if(path==='/')home();
    else if(path==='/login'||path==='/signup')authPage(path==='/signup');
    else if(path==='/contact')contactPage();
    else if(path==='/dashboard')await dashboard();
    else if(parts.length===1&&['courses','practice','resources','products'].includes(parts[0]))listing(parts[0]);
    else if(parts[0]==='courses')await coursePage(parts[1]);
    else if(parts[0]==='practice')await practicePage(parts[1]);
    else if(parts[0]==='products')await productPage(parts[1]);
    else if(parts[0]==='resources')await resourcePage(parts[1]);
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  } catch(error) {
    $('#main').innerHTML=`<section class="empty-state"><h1>We couldn’t load this page.</h1><p>${esc(error.message)}</p><a class="button button-primary" href="${esc(path)}">Try again</a><a class="button" href="/">Go to homepage</a></section>`;
  }
}
boot();
