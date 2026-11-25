/* Catalog-backed route proposal and nearby campground editor. */
(()=>{'use strict';
const C=window.NptPlannerCore, $=(s,r=document)=>r.querySelector(s);
let root,body,status,map,layer,model=null,editing=null,busy=false,dirty=false,op=0,originFocus,geometry=null,parameterPanelOpen=false;
const db=()=>window.nptCloud.db;
function el(tag,text,attrs={}){const e=document.createElement(tag);if(text!=null)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
function btn(text,fn,primary=false){const e=el('button',text,{type:'button',class:'btn'+(primary?' primary':'')});e.onclick=fn;return e;}
function safeURL(url){try{const u=new URL(url);return u.protocol==='https:'?u.href:null;}catch{return null;}}
function link(text,url){const u=safeURL(url);return u?el('a',text,{href:u,target:'_blank',rel:'noopener noreferrer'}):el('span','Official link unavailable');}
function say(text){if(status){status.textContent=text;status.hidden=!text;}}
async function query(q){const {data,error}=await q;if(error)throw Error(error.message);return data||[];}
function lock(value){busy=value;root?.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=value||b.dataset.boundary==='true');}
async function run(fn){if(busy)return;lock(true);try{await fn();}catch(e){say(e.message||'Something went wrong. Please try again.');status?.scrollIntoView({block:'center',behavior:'smooth'});}finally{lock(false);}}
function close(force=false){if(busy&&!force)return;if(dirty&&!confirm('Discard your unsaved itinerary changes?'))return;op++;map?.remove();map=null;const sharing=document.querySelector('#ownerShare');if(sharing){document.querySelector('#viewer')?.append(sharing);sharing.style.display='none';}root?.remove();root=null;document.body.style.overflow='';originFocus?.focus();}
window.closeNptPlanner=()=>close(true);
function shell(title){if(root){map?.remove();map=null;root.remove();}originFocus=document.activeElement;root=el('section',null,{class:'npt-planner','role':'dialog','aria-modal':'true','aria-label':title});const h=el('header',null,{class:'np-head'});const brand=el('div',null,{class:'np-editor-brand'});brand.append(el('img',null,{src:'./npt-logo.webp',alt:'National Park Trip logo',width:68,height:68}),el('div','National Park Trip',{class:'np-editor-brand-name'}),el('h2',title));h.append(brand,btn('Close',close));body=el('div',null,{class:'np-wrap'});status=el('p','',{class:'np-status',role:'status','aria-live':'polite'});root.append(h,body);document.body.append(root);document.body.style.overflow='hidden';root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const fs=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,a[href]')].filter(x=>x.offsetParent!==null);if(e.shiftKey&&document.activeElement===fs[0]){e.preventDefault();fs.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===fs.at(-1)){e.preventDefault();fs[0]?.focus();}}});h.querySelector('button').focus();}
function field(text,input){const l=el('label',null,{class:'np-field'});l.append(el('span',text),input);return l;}
function input(type,value,attrs={}){const e=el('input',null,{type,...attrs});e.value=value??'';return e;}
function select(options,value){const e=el('select');options.forEach(([v,n])=>e.append(el('option',n,{value:v})));e.value=value;return e;}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Online map service is unavailable. Try again shortly.');return r.json();}
let censusSequence=0;
function censusAddress(term){return new Promise((resolve,reject)=>{const callback='nptAddress'+(++censusSequence),script=document.createElement('script');let timer;const clean=()=>{clearTimeout(timer);script.remove();delete window[callback];};window[callback]=data=>{clean();resolve((data.result?.addressMatches||[]).map(x=>({name:x.matchedAddress,point:[x.coordinates.y,x.coordinates.x],accuracy:'Address range match · check the pin'})));};script.onerror=()=>{clean();reject(Error('Address service unavailable'));};timer=setTimeout(()=>{clean();reject(Error('Address search timed out'));},12000);script.src='https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=jsonp&callback='+callback+'&address='+encodeURIComponent(term);document.head.append(script);});}
async function findLocations(term){
 const isAddress=/^\d+[A-Za-z-]*\s+\S+/.test(term);
 const jobs=[json('https://photon.komoot.io/api/?limit=12&lang=en&q='+encodeURIComponent(term)).then(d=>(d.features||[]).filter(f=>['US','CA'].includes(String(f.properties.countrycode).toUpperCase())).map(f=>{const p=f.properties,street=[p.housenumber,p.street].filter(Boolean).join(' ');return {name:[street,p.name,p.city||p.town||p.village,p.state,p.postcode,p.country].filter((x,i,a)=>x&&a.indexOf(x)===i).join(', '),point:[f.geometry.coordinates[1],f.geometry.coordinates[0]],accuracy:p.housenumber?'Mapped address':isAddress?'Area or street match — not an exact address':'Place match'};}))];
 if(isAddress)jobs.unshift(censusAddress(term));const settled=await Promise.allSettled(jobs);const items=settled.flatMap(r=>r.status==='fulfilled'?r.value:[]).filter(x=>x.point.every(Number.isFinite));return {items:items.filter((x,i,a)=>!a.slice(0,i).some(y=>y.name===x.name&&C.miles(x.point,y.point)<.05)),failed:settled.some(r=>r.status==='rejected')};
}
function locationField(title){
 const box=el('div'),q=input('search','',{placeholder:'Street address, city, state and ZIP','aria-label':title}),results=el('div',null,{class:'np-location-results',role:'status'});let chosen=null,pinMap=null,pin=null;
 const selectLocation=x=>{chosen={name:x.name,point:x.point};q.value=x.name;results.replaceChildren(el('small','Location selected · '+x.accuracy));if(pinMap){pinMap.setView(x.point,16);pin?.remove();pin=window.L.marker(x.point).addTo(pinMap);}};
 const go=btn('Find location',()=>run(async()=>{const term=q.value.trim();if(term.length<2)throw Error('Enter a street address with city/state or ZIP.');results.textContent='Finding locations…';const {items,failed}=await findLocations(term);results.replaceChildren();for(const x of items)results.append(btn(x.name+' · '+x.accuracy,()=>selectLocation(x)));if(!items.length)results.textContent=failed?'Search service unavailable. Try again or choose a point on the map.':'No address match. Add city/state and ZIP, or choose a point on the map.';}));
 const choosePin=btn('Choose / adjust map pin',()=>run(async()=>{if(pinMap){pinMap.invalidateSize();return;}const L=await leaflet(),host=el('div',null,{'aria-label':'Choose location on map'});host.style.cssText='height:300px;margin-top:12px';box.append(el('small','Zoom in and click your driveway or entrance. The address text above becomes its label.'),host);pinMap=L.map(host).setView(chosen?.point||[39.5,-98.35],chosen?16:4);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(pinMap);if(chosen)pin=L.marker(chosen.point).addTo(pinMap);pinMap.on('click',e=>selectLocation({name:q.value.trim()||'Selected map location',point:[e.latlng.lat,e.latlng.lng],accuracy:'User-selected map pin'}));}));
 q.oninput=()=>{chosen=null;results.replaceChildren();};q.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go.click();}};box.append(field(title,q),go,choosePin,results);return {box,get:()=>chosen};
}
const campgroundCache=new Map();
function mapCampgroundRows(features,point,radius){
 return (features||[]).filter(f=>{const p=f.properties;return p.name&&p.osm_key==='tourism'&&['camp_site','caravan_site'].includes(p.osm_value)&&!/^[0-9]+$|day camp|defunct|youth|scout|cyclists only|vendor campground/i.test(p.name)&&!['private','no'].includes(p.extra?.access);}).map(f=>{const t=f.properties,extra=t.extra||{},type={N:'node',W:'way',R:'relation'}[t.osm_type],flag=(...keys)=>keys.some(k=>['yes','true','designated','available'].includes(String(extra[k]||'').toLowerCase()))?true:keys.some(k=>String(extra[k]||'').toLowerCase()==='no')?false:null,website=extra.website||extra['contact:website']||null,brand=extra.brand||extra.operator||null,amenities=[];for(const [keys,label] of [[['electricity','power_supply'],'Electricity'],[['drinking_water','water'],'Drinking water'],[['toilets'],'Restrooms'],[['shower'],'Showers'],[['sanitary_dump_station','sewage_dump_station'],'Dump station'],[['internet_access'],'Wi-Fi']])if(flag(...keys)===true)amenities.push(label);return {id:null,name:t.name,latitude:f.geometry.coordinates[1],longitude:f.geometry.coordinates[0],region:[t.city||t.town,t.state].filter(Boolean).join(', '),operator:brand,rv_allowed:String(extra.motorhome||'').toLowerCase()==='no'?false:String(extra.motorhome||'').toLowerCase()==='yes'?true:null,trailer_allowed:String(extra.caravans||'').toLowerCase()==='no'?false:String(extra.caravans||'').toLowerCase()==='yes'?true:null,electric_hookups:flag('electricity','power_supply'),water_hookups:flag('drinking_water','water'),sewer_hookups:flag('sewer','sewer_connection'),official_url:website,phone:extra.phone||extra['contact:phone']||null,metadata:{source:'OpenStreetMap',source_url:type?'https://www.openstreetmap.org/'+type+'/'+t.osm_id:null,osm_id:t.osm_type+'/'+t.osm_id,brand:extra.brand||null,amenities,capacity:extra.capacity||null,maxstay:extra.maxstay||null,opening_hours:extra.opening_hours||null,website,phone:extra.phone||extra['contact:phone']||null},reservation_notes:'Listing details are from OpenStreetMap when available. Confirm site dimensions, hookups, opening dates and availability with the operator.'};}).filter(c=>Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&C.miles(point,C.point(c))<=radius).sort((a,b)=>C.miles(point,C.point(a))-C.miles(point,C.point(b)));
}
async function mappedCampgrounds(point,radius){
 const center=point.map(n=>Number(n.toFixed(2))),key=point.join(',')+':'+radius;if(campgroundCache.has(key))return campgroundCache.get(key);
 const data=await json('https://photon.komoot.io/reverse?lat='+center[0]+'&lon='+center[1]+'&radius='+(radius*1.609344+1.6)+'&limit=100&osm_tag=tourism:camp_site&osm_tag=tourism:caravan_site');
 const rows=mapCampgroundRows(data.features,point,radius);campgroundCache.set(key,rows);return rows;
}
async function searchMappedCampgrounds(term,point,radius){
 const data=await json('https://photon.komoot.io/api/?q='+encodeURIComponent(term)+'&lat='+point[0].toFixed(3)+'&lon='+point[1].toFixed(3)+'&limit=60&osm_tag=tourism:camp_site&osm_tag=tourism:caravan_site');return mapCampgroundRows(data.features,point,radius);
}
const parkDesignations=['national_park','national_park_canada','state_park'];
function parkInState(park,state){
 const codes=String(park.region||'').split(',').map(value=>value.trim().toUpperCase());
 return codes.includes(state.code.toUpperCase())||codes.includes(state.name.toUpperCase());
}
async function parksInState(state,nationalParks){
 const lookup=()=>db().from('npt_parks').select('id,name,region,latitude,longitude,designation,official_url,metadata')
  .not('latitude','is',null).not('longitude','is',null);
 const [local,national]=await Promise.all([
  query(lookup().eq('designation','state_park').or('region.eq.'+state.code+',region.eq.'+state.name).limit(1000)),
  nationalParks||query(lookup().eq('designation','national_park'))
 ]);
 return [...national.filter(park=>park.designation==='national_park'&&parkInState(park,state)),
  ...local.filter(park=>park.metadata?.coverage_status!=='inventory_record_needs_agency_validation')];
}
function parkAttractions(){
 return db().from('npt_attractions').select('*,npt_parks!inner(name,designation,region)')
  .in('npt_parks.designation',parkDesignations)
  .or('source_key.eq.nps,source_key.eq.parks_canada,source_key.like.stateparks_agency_*')
  .not('latitude','is',null).not('longitude','is',null);
}
async function attractionCandidates(point,radius=50,term=''){
 const delta=radius/68,lonDelta=delta/Math.max(0.01,Math.cos(point[0]*Math.PI/180));
 let request=parkAttractions().gte('latitude',point[0]-delta).lte('latitude',point[0]+delta)
  .gte('longitude',point[1]-lonDelta).lte('longitude',point[1]+lonDelta);
 if(term)request=request.ilike('name','%'+term.replace(/[%_]/g,'')+'%');
 const rows=await query(request.order('name').limit(500));
 return rankAttractions(rows.filter(place=>C.miles(point,C.point(place))<=radius),term,point);
}
window.openNptPlanner=async function(trip=null){
 if(!window.nptCloud?.signedIn()){window.startWizard();return;}
 window.closeNptWalk?.();window.showHome?.();
 editing=trip;dirty=false;model=trip?.preferences?.planner?JSON.parse(JSON.stringify(trip.preferences.planner)):trip?C.fromTrip(window.nptCloud.editorSource(trip)):null;geometry=null;op++;shell(trip?'Edit itinerary':'Plan a new trip');
 if(model){await render();return;}showForm();
};
function roadTripPlace(place){
 if(place.latitude==null||place.longitude==null)return false;
 const name=place.name||'';
 if(/\b(junior ranger|challenge|app|virtual|scavenger hunt|badge|webinar|volunteer|lesson plan|worksheet|podcast|online|fitness program|film screening|webcast|ranger program)\b/i.test(name))return false;
 if(place.metadata?.coverage_status==='inventory_record_needs_agency_validation')return false;
 if(['national_park','national_park_canada','state_park'].includes(place.designation))return true;
 if(/^(landmark|museum|viewpoint|attraction|monument|memorial|waterfall|peak|trailhead|castle|ruins|dam|gallery|lighthouse|archaeological_site)$/i.test(place.attraction_type||place.category||''))return true;
 return /\b(arch|falls|geyser|canyon|caverns?|caves?|summit|lakes?|beach|monument|memorial|hike|hiking|trails?|museum|overlook|viewpoint|trailhead|waterfall|lighthouse|visitor cent(?:er|re)|historic site|national monument|national memorial|scenic drive|observation deck|courthouse|battlefield|botanical garden)\b/i.test(name);
}
function attractionWords(value){
 return String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
}
// Prefer catalog priorities when present, then shortlist recognizable park features.
function sightPriority(place){
 const text=place.name||'';
 if(place.metadata?.must_see===true||place.must_see===true)return 0;
 if(/\b(old faithful|grand prismatic spring|delicate arch|gateway arch(?: monument)?|half dome|yosemite falls|tunnel view|angels landing|the narrows|cadillac mountain|going.to.the.sun road|logan pass|lake louise|moraine lake|crater lake rim|sunrise point|sunset point|mather point|denali|mount rainier|hurricane ridge|mesa arch|badlands loop|giant forest|general sherman|crystal cave|custer state park wildlife loop)\b/i.test(text)&&
    !/\b(visitor center|shuttle|parking|campground|permit|webcam)\b/i.test(text))return 1;
 if(place.attraction_type==='landmark'||/\b(geyser|waterfall|falls|natural bridge|arch|overlook|viewpoint|scenic drive|caverns?|summit)\b/i.test(text))return 2;
 if(/\b(visitor center|picnic area|visitor contact|visitor centre)\b/i.test(text))return 5;
 return 3;
}
function visitMinutes(place){
 const value=Number(place.duration_minutes);
 return value>0&&Number.isFinite(value)?value:null;
}
async function parkSights(park,point){
 if(!park?.id)return attractionCandidates(point,25);
 const rows=await query(parkAttractions().eq('park_id',park.id).order('name').limit(1000));
 return rankAttractions(rows,'',point);
}
function rankAttractions(rows,term='',point=null){
 const words=attractionWords(term),seen=new Set();
 const eligible=rows.filter(place=>{
  if(!roadTripPlace(place))return false;
  const title=attractionWords(place.name);
  if(!words.every(word=>title.includes(word)))return false;
  const key=[place.park_id||place.id,...title].join('|');
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
 function priority(place){
  if(words.length&&attractionWords(place.name).join(' ')===words.join(' '))return -1;
  return sightPriority(place);
 }
 return eligible.sort((a,b)=>priority(a)-priority(b)||(point?C.miles(point,C.point(a))-C.miles(point,C.point(b)):0)||a.name.localeCompare(b.name));
}
function destinationField(){
 const states='AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming'.split('|').map(x=>{const [code,name]=x.split(':');return {code,name};});
 const box=el('div'),q=input('search','',{placeholder:'Michigan, Glacier, Custer…',autocomplete:'off','aria-label':'Destination (optional)'}),results=el('div',null,{class:'np-location-results','aria-live':'polite'});let chosen=null,timer,request=0;
 const kind=select([['park','Park or state'],['attraction','Attraction'],['campground','Campground'],['site','Individual campsite']],'park');
 box.append(field('Build a trip around',kind),field('Find a place',q),results);
 kind.onchange=()=>{q.value='';q.placeholder=kind.value==='site'?'Enter a site number':'Search by name';q.oninput();q.focus();};
 function option(value,label){results.append(btn(label,()=>{chosen=value;q.value=value.name;request++;results.replaceChildren(el('small','Destination selected'));}));}
 q.oninput=()=>{chosen=null;clearTimeout(timer);const token=++request,term=q.value.trim();results.replaceChildren();if(term.length<(kind.value==='site'?1:2))return;
 timer=setTimeout(async()=>{try{
  if(kind.value!=='park'){
   const type=kind.value;
   const table={site:'npt_campsites',campground:'npt_campgrounds',attraction:'npt_attractions'}[type];
   let search=db().from(table).select(type==='site'?'id,site_number,site_type,reservation_url,npt_campgrounds!inner(*)':'*');
   search=type==='site'?search.eq('site_number',term):search.ilike('name','%'+term.replace(/[%_]/g,'')+'%').not('latitude','is',null);
   let matches;
   if(type==='attraction'){
    const landmarkQuery=term.replace(/st\.?\s+louis\s+(?:gateway\s+)?arch/i,'Gateway Arch');
    const pattern='%'+landmarkQuery.replace(/[%_]/g,'')+'%';
    const mapped=tableName=>db().from(tableName).select('*').not('latitude','is',null).not('longitude','is',null);
    const [landmarks,parks,activities]=await Promise.all([
     query(parkAttractions().eq('attraction_type','landmark').ilike('name',pattern).order('name').limit(30)),
     query(mapped('npt_parks').in('designation',parkDesignations).ilike('name',pattern).order('name').limit(40)),
     query(parkAttractions().ilike('name',pattern).order('name').limit(80))
    ]);
    matches=rankAttractions([...landmarks,...parks,...activities],landmarkQuery).slice(0,15);
   }else matches=await query(search.limit(30));
   if(token!==request||!box.isConnected)return;
   for(const row of matches){
    const place=type==='site'?row.npt_campgrounds:row;
    if(place?.latitude==null||place.longitude==null)continue;
    const name=type==='site'?place.name+' · Site '+row.site_number:place.name;
    option({name,point:C.point(place),park:{id:null,name,latitude:place.latitude,longitude:place.longitude},type,place,site:type==='site'?{id:row.id,number:row.site_number,url:row.reservation_url}:null},[name,place.npt_parks?.name,place.region||place.npt_parks?.region||place.metadata?.region].filter(Boolean).join(' · '));
   }
   if(!results.children.length)results.textContent='No mapped matches. Try another search.';
   return;
  }
  const rows=await query(db().from('npt_parks').select('id,name,region,latitude,longitude,designation,official_url').in('designation',['national_park','national_park_canada','state_park']).ilike('name','%'+term.replace(/[%_]/g,'')+'%').not('latitude','is',null).order('name').limit(12));
  if(token!==request||!box.isConnected)return;results.replaceChildren();
  states.filter(x=>x.name.toLowerCase().includes(term.toLowerCase())||x.code.toLowerCase()===term.toLowerCase()).forEach(x=>option(x,x.name+' · State'));
  rows.forEach(p=>option({name:p.name,point:C.point(p),park:p},p.name+' · '+(p.designation==='state_park'?'State park':'National park')+' · '+(p.region||'')));
  if(!results.children.length)results.textContent='No matching destination. Try another name.';
 }catch{if(token===request)results.textContent='Destination search unavailable. Try again.';}},250);};
 return {box,get:()=>chosen,hasText:()=>Boolean(q.value.trim())};
}

function showForm(){
 body.replaceChildren();const form=el('form',null,{class:'np-form'}),grid=el('div',null,{class:'np-grid'});
 const name=input('text','',{placeholder:'My next park adventure',maxlength:160}),days=input('number',14,{min:2,max:120,required:''}),date=input('date','',{required:''}),start=locationField('Starting point'),end=locationField('Ending point'),same=input('checkbox');same.checked=true;end.box.hidden=true;
 const vehicle=select([['car','Car + tent'],['campervan','Campervan'],['motorhome','Motorhome'],['fifthWheel','Fifth wheel'],['trailer','Travel trailer']],'car'),length=input('number',30,{min:1,max:100,step:.1}),lenField=field('RV / trailer length (feet)',length);lenField.hidden=true;vehicle.onchange=()=>{lenField.hidden=vehicle.value==='car';length.required=vehicle.value!=='car';};
 const distance=input('number',250,{min:25,max:600,step:1}),hours=input('number','',{min:1,max:12,step:.5}),parkType=select([['national','National parks first'],['both','National and state parks']],'national');
 same.onchange=()=>end.box.hidden=same.checked;
 grid.append(field('How many days?',days),field('Departure date',date),field('Vehicle',vehicle),lenField,start.box,end.box);
 const destination=destinationField();grid.prepend(destination.box);
 const discovery=preTripSearch(start,destination,vehicle,length);
 const advanced=el('details');advanced.append(el('summary','Trip name and driving preferences'),field('Trip name (optional)',name),field('Preferred driving distance (miles)',distance),field('Park preference',parkType),field('Maximum driving hours per day (optional)',hours));
 const sameLabel=el('label',null,{class:'np-check'});sameLabel.append(same,' Return to my starting point');
 form.append(el('h3','A few details. A whole trip to explore.'),el('p','Add the parks, campgrounds, and attractions you want, or leave the shortlist empty and let us suggest a route. Review and edit every stop before saving.',{class:'np-muted'}),grid,sameLabel,advanced,discovery.box,el('p','Address search uses the U.S. Census Bureau and OpenStreetMap. Confirm the selected location or adjust its map pin. Driving roads and distances load automatically for your proposal.',{class:'np-muted'}));
 const submit=el('button','Build my trip',{type:'submit',class:'btn primary'});form.append(status,submit);body.append(form);
 form.noValidate=true;form.onsubmit=e=>{e.preventDefault();const invalid=[...form.querySelectorAll('input,select')].find(x=>!x.validity.valid);if(invalid){say((invalid.closest('label')?.querySelector('span')?.textContent||'Field')+': '+invalid.validationMessage);invalid.scrollIntoView({block:'center'});invalid.focus();return;}run(async()=>{if(!start.get()||!same.checked&&!end.get())throw Error('Find and select your starting and ending locations.');if(distance.value===''&&!hours.value)throw Error('Enter a preferred distance or a maximum driving-hours limit.');if(destination.hasText()&&!destination.get())throw Error('Select a destination suggestion, or clear the field for an automatic route.');say('Finding parks and nearby campgrounds…');const basics={name:name.value.trim()||'My National Park Trip',days:Number(days.value),date:date.value,start:start.get(),end:same.checked?start.get():end.get(),hours:hours.value?Number(hours.value):null,destination:destination.get(),distance:distance.value===''?null:Number(distance.value),vehicle:{type:vehicle.value,rvLength:vehicle.value==='car'?null:Number(length.value)},parkType:parkType.value};
 let parks=await query(db().from('npt_parks').select('id,name,region,latitude,longitude,designation,official_url').in('designation',['national_park','national_park_canada']).not('latitude','is',null));
 // State parks near the start provide options for shorter trips and explicit state-park preferences.
 const planningDistance=basics.hours!=null?basics.hours*45:basics.distance;const [lat,lon]=basics.destination?.point||basics.start.point,span=Math.min(12,planningDistance/50);
 const state=await query(db().from('npt_parks').select('id,name,region,latitude,longitude,designation,official_url').eq('designation','state_park').gte('latitude',lat-span).lte('latitude',lat+span).gte('longitude',lon-span*1.6).lte('longitude',lon+span*1.6).limit(500));
 const pick=p=>C.chooseParks(p,basics.start.point,basics.end.point,basics.days,basics.hours,planningDistance);
 let chosen=pick(basics.parkType==='both'?[...parks,...state]:parks);if(!chosen.length)chosen=pick(state);
 if(basics.destination){
  const d=basics.destination;
  let targets=d.park?[d.park]:await parksInState(d,parks);
  if(!targets.length)throw Error('No verified mapped parks are available in the catalog for this state. Try a specific park, campground, or address.');
  const driveBudget=Math.min(planningDistance,(basics.hours||24)*45);
  const neededDays=p=>Math.ceil((C.miles(basics.start.point,C.point(p))+C.miles(C.point(p),basics.end.point))*1.3/driveBudget)+2;
  const feasible=targets.filter(p=>neededDays(p)<=basics.days);
  if(!feasible.length)throw Error('The closest matching destination needs more days at your driving preferences. Increase trip days or choose a closer destination.');
  feasible.sort((a,b)=>Number(a.designation==='state_park')-Number(b.designation==='state_park')||
   neededDays(a)-neededDays(b)||C.miles(basics.start.point,C.point(a))-C.miles(basics.start.point,C.point(b)));
  const anchor=feasible[0],near=d.park?[...parks,...state].filter(p=>p.id!==anchor.id&&C.miles(C.point(p),C.point(anchor))<100):feasible.slice(1);
  chosen=[anchor,...C.chooseParks(near,C.point(anchor),basics.end.point,Math.max(2,basics.days-neededDays(anchor)+2),basics.hours,planningDistance)].slice(0,Math.min(8,basics.days-1));
 }
 if(!chosen.length)throw Error('No catalog route fits those driving preferences. Increase the distance or choose a closer ending point.');
 model={version:1,basics,stops:[],route:null};for(const p of chosen){say('Finding stays and attractions near '+p.name+'…');const stop=await createStop(p);
  const anchor=basics.destination;
  if(anchor?.type && p===anchor.park){
   if(anchor.type==='attraction'){stop.options=[anchor.place,...stop.options.filter(a=>a.id!==anchor.place.id)];stop.activities=[anchor.place];}
   else {stop.campground=anchor.place;stop.selectedCamp=true;if(anchor.site){stop.selectedSite=anchor.site;stop.notes='Preferred campsite: '+anchor.name;}}
  }
  model.stops.push(stop);}
 const selected=discovery.selected;for(const park of selected.filter(x=>x.kind==='park').map(x=>x.place)){if(model.stops.some(s=>s.park?.id===park.id))continue;model.stops.push(await createStop(park));}for(const camp of selected.filter(x=>x.kind==='campground').map(x=>x.place)){const nearby=model.stops.map(s=>({s,d:C.miles(C.point(s.park),C.point(camp))})).filter(x=>!x.s.selectedCamp).sort((a,b)=>a.d-b.d);if(nearby[0]&&nearby[0].d<=100){nearby[0].s.campground=camp;nearby[0].s.selectedCamp=true;}else model.stops.push({park:{id:null,name:camp.name,region:camp.region,latitude:camp.latitude,longitude:camp.longitude},nights:1,campground:camp,activities:[],options:[],notes:'Selected before building the itinerary.'});}
 for(const address of selected.filter(x=>x.kind==='address').map(x=>x.place)){model.stops.push({park:{id:null,name:address.name,region:address.region,latitude:address.latitude,longitude:address.longitude},nights:1,kind:'address',addressOnly:true,campground:null,activities:[],options:[],notes:'Address stop selected before building the itinerary.'});}
 for(const attraction of selected.filter(x=>x.kind==='attraction').map(x=>x.place)){const exists=model.stops.some(s=>s.park?.name?.toLowerCase()===attraction.name.toLowerCase()||s.activities?.some(a=>a.name?.toLowerCase()===attraction.name.toLowerCase()));if(exists)continue;model.stops.push({park:{id:null,name:attraction.name,region:attraction.region,latitude:attraction.latitude,longitude:attraction.longitude,official_url:attraction.official_url},nights:0,campground:null,activities:[attraction],options:[attraction],attractionOnly:true,notes:'Must-stop attraction selected before building the itinerary.'});}
 if(model.stops.filter(s=>!s.attractionOnly).length>basics.days-1)throw Error('There are more overnight stops than available nights. Increase the trip length or remove a selected campground.');
 model.stops=sequenceStops(model.stops,basics.start.point,basics.end.point);
 say('Finding overnight breaks and must-see stops along your route…');
 let proposalNotice='';
 try{await completeInitialProposal();}catch{proposalNotice='Some route suggestions could not be verified. Review highlighted driving legs or use Recalculate trip.';}
 const nightStops=model.stops.filter(s=>!s.attractionOnly);
 const destinations=nightStops.filter(s=>!s.transit);
 const extra=basics.days-1-nightStops.length;
 nightStops.forEach(s=>{s.nights=1;});
 for(let i=0;i<extra&&destinations.length;i++)destinations[i%destinations.length].nights++;
 destinations.forEach(s=>{s.activities=s.options.slice(0,Math.min(5,s.nights));});
 dirty=true;await render();
 if(proposalNotice)say(proposalNotice);
 });};
}
function preTripSearch(start,destination,vehicle,length){
 const box=el('details',null,{class:'np-search np-pretrip-search'}),summary=el('summary','Find places before building the trip'),intro=el('p','Search parks and recorded attractions in your selected state or park, search for campgrounds, or enter a full street address to add a stop such as a friend’s home.',{class:'np-muted'}),kind=select([['place','Parks & attractions'],['campground','Campsites'],['address','Direct address']],'place'),term=input('search','',{placeholder:'Search by name','aria-label':'Search places by name'}),radius=select([['15','Within 15 miles'],['30','Within 30 miles'],['50','Within 50 miles'],['100','Within 100 miles'],['500','Whole state']],'30'),full=input('checkbox'),fit=input('checkbox'),results=el('div',null,{class:'np-discovery-results'}),selectedBox=el('div',null,{class:'np-selected-places'}),address=locationField('Full street address'),addressPanel=el('div',null,{class:'np-address-search',hidden:''}),selected=[],msg=el('p','Search parks and attractions, or choose Campsites. Type at least 2 characters to see suggestions, or choose Direct address to add a stop.',{role:'status'});
 full.checked=false;fit.checked=false;radius.setAttribute('aria-label','Search radius');
 const controls=el('div',null,{class:'np-discovery-controls'}),termField=field('Search name',term),radiusField=field('Search radius',radius);controls.append(field('Search for',kind),termField,radiusField);addressPanel.append(address.box,btn('Add address to trip',()=>{const place=address.get();if(!place)throw Error('Find and select a full address first.');if(selected.some(x=>x.kind==='address'&&x.place.name===place.name))return;selected.push({kind:'address',place:{name:place.name,latitude:place.point[0],longitude:place.point[1],region:'Direct address'}});refreshSelected();say('Address added as a trip stop.');}));
 const filters=el('div',null,{class:'np-inline'}),fullLabel=el('label',null,{class:'np-check'}),fitLabel=el('label',null,{class:'np-check'});fullLabel.append(full,' Full hookups only');fitLabel.append(fit,' Only show campgrounds with confirmed fit for selected vehicle');filters.append(fullLabel,fitLabel);
 const refreshSelected=()=>{selectedBox.replaceChildren(el('h4','Selected places ('+selected.length+')'));if(!selected.length){selectedBox.append(el('p','Nothing selected yet.',{class:'np-muted'}));return;}for(const item of selected){const row=el('div',null,{class:'np-selected-row'});row.append(el('span',({park:'Park · ',campground:'Campsite · ',address:'Address · ',attraction:'Attraction · '}[item.kind]||'Place · ')+item.place.name),btn('Remove',()=>{selected.splice(selected.indexOf(item),1);refreshSelected();}));selectedBox.append(row);}};
 const radiusStateOption=[...radius.options].find(o=>o.value==='500');if(radiusStateOption)radiusStateOption.hidden=true;
 const help=el('small','State destinations search the selected state’s parks and their recorded attractions. Park destinations search that park and its recorded attractions; otherwise choose a search radius.',{class:'np-muted np-radius-help'});
 const discoverTarget=async()=>{const d=destination.get();let park=d?.park?.id?d.park:d?.place?.npt_parks?.id?d.place.npt_parks:null;const parkId=d?.place?.park_id;if(!park&&parkId){const parent=await query(db().from('npt_parks').select('id,name,region,latitude,longitude,designation,official_url').eq('id',parkId).limit(1));park=parent[0]||null;}if(d?.point)return {center:d.point,label:d.name,state:false,park};if(d?.code){const parks=await parksInState(d);if(!parks.length)throw Error('No mapped parks were found for '+d.name+'. Search a specific park instead.');return {center:[parks.reduce((n,p)=>n+Number(p.latitude),0)/parks.length,parks.reduce((n,p)=>n+Number(p.longitude),0)/parks.length],label:d.name,state:true,stateInfo:d,parks,park:null};}const p=start.get()?.point;if(!p)throw Error('Select a starting point or destination before searching.');return {center:p,label:start.get().name,state:false,park:null};};
 const setRadiusMode=()=>{const isState=Boolean(destination.get()?.code);if(radiusStateOption)radiusStateOption.hidden=!isState;if(isState&&radius.value!=='500')radius.value='500';if(!isState&&radius.value==='500')radius.value='30';};
 let searchSequence=0,searchTimer;
 const paintRows=(rows,center,isCamp,range,needle,token)=>{if(token!==searchSequence)return;rows=rows.filter(c=>(!needle||[c.name,c.operator,c.metadata?.brand,c.region].filter(Boolean).join(' ').toLowerCase().includes(needle))&&(!isCamp||(!full.checked||c.electric_hookups===true&&c.water_hookups===true&&c.sewer_hookups===true)&&(!fit.checked||C.fit(c,{type:vehicle.value,rvLength:vehicle.value==='car'?null:Number(length.value)}).ok&&!C.fit(c,{type:vehicle.value,rvLength:vehicle.value==='car'?null:Number(length.value)}).unknown)));
 rows.sort((a,b)=>C.miles(center,C.point(a))-C.miles(center,C.point(b)));msg.textContent=rows.length?rows.length+' matches within '+(range===500?'the selected state':range+' miles')+'. '+(isCamp?'Campground prices and site-specific availability are not reliably published in the catalog.':'Results are scoped to the selected state or park when one is selected.'):(isCamp?'No matches. Try a wider radius or a more specific search term.':'No matching parks or attractions in this scope. Try another name or select a different state or park.');results.replaceChildren();
 for(const place of rows.slice(0,30)){const card=el('article',null,{class:'np-result'}),title=el('h4',place.name),detail=el('p',isCamp?[place.operator||place.region,C.hookups(place),C.fit(place,{type:vehicle.value,rvLength:vehicle.value==='car'?null:Number(length.value)}).label].filter(Boolean).join(' · '):[place.designation==='state_park'?'State park':place.designation==='national_park'?'National park':place.attraction_type||place.category||'Attraction',place.npt_parks?.name,place.region].filter(Boolean).join(' · ')||'Place');card.append(title,detail);if(isCamp){const price=place.nightly_price??place.price_from??place.min_price;card.append(el('p',price!=null?'Listed starting price: '+price:'Price: check the campground website for your dates and site type.'));if(place.metadata?.amenities?.length)card.append(el('p','Listed amenities: '+place.metadata.amenities.join(' · ')));if(place.phone)card.append(el('p','Phone: '+place.phone));}card.append(link(place.official_url?'Official website':'Map listing',place.official_url||place.reservation_url||place.metadata?.source_url));const selectedKind=isCamp?'campground':(['national_park','national_park_canada','state_park'].includes(place.designation)?'park':'attraction');const add=btn(selected.some(x=>x.kind===selectedKind&&x.place.name===place.name)?'Added':'Add to trip',()=>{if(selected.some(x=>x.kind===selectedKind&&x.place.name===place.name))return;selected.push({kind:selectedKind,place});refreshSelected();add.textContent='Added';add.disabled=true;});card.append(add);results.append(card);}};
 const loadResults=async()=>{if(kind.value==='address')return;const token=++searchSequence,target=await discoverTarget();setRadiusMode();const range=Number(radius.value),center=target.center,needle=term.value.trim().toLowerCase(),isCamp=kind.value==='campground';msg.textContent='Searching '+(target.state?'across ':'near ')+target.label+'…';results.replaceChildren();let rows=[];if(isCamp){const jobs=needle?[campsNear(center,range),searchMappedCampgrounds(term.value.trim(),center,range),query(db().from('npt_campgrounds').select('*').ilike('name','%'+term.value.trim().replace(/[%_]/g,'')+'%').limit(60)).then(a=>a.filter(c=>c.latitude!=null&&C.miles(center,C.point(c))<=range))]:[campsNear(center,range),mappedCampgrounds(center,range)];const settled=await Promise.allSettled(jobs);for(const r of settled)if(r.status==='fulfilled')for(const c of r.value)if(!rows.some(x=>x.name.toLowerCase()===c.name.toLowerCase()&&C.miles(C.point(x),C.point(c))<.5))rows.push(c);if(settled.every(r=>r.status==='rejected'))throw Error('Campground search services are unavailable. Try again shortly.');}else if(kind.value==='place'){let parks=target.state?target.parks:target.park?[target.park]:[];let attractions=[];if(target.state||target.park){const ids=parks.map(p=>p.id).filter(Boolean);if(ids.length){let q=parkAttractions().in('park_id',ids);if(needle)q=q.ilike('name','%'+term.value.trim().replace(/[%_]/g,'')+'%');attractions=await query(q.order('name').limit(500));}}else{const [nearby,matchingParks]=await Promise.all([attractionCandidates(center,range,term.value.trim()),needle?query(db().from('npt_parks').select('id,name,region,latitude,longitude,designation,official_url,metadata').in('designation',parkDesignations).ilike('name','%'+term.value.trim().replace(/[%_]/g,'')+'%').not('latitude','is',null).not('longitude','is',null).order('name').limit(100)):Promise.resolve([])]);parks=matchingParks.filter(p=>C.miles(center,C.point(p))<=range);attractions=nearby;}rows=rankAttractions([...parks,...attractions],term.value.trim(),center);}else rows=await attractionCandidates(center,range,term.value.trim());paintRows(isCamp?rows:rows.filter(roadTripPlace),center,isCamp,range,needle,token);};
 const search=btn('Search nearby',()=>run(loadResults));
 const suggest=()=>{clearTimeout(searchTimer);const needle=term.value.trim();if(needle.length<2){searchSequence++;results.replaceChildren();msg.textContent='Type at least 2 characters to see suggestions, or choose Search to browse nearby.';return;}searchTimer=setTimeout(()=>{loadResults().catch(e=>{msg.textContent=e.message||'Place suggestions are unavailable.';});},300);};
 term.addEventListener('input',suggest);kind.onchange=()=>{term.value='';searchSequence++;results.replaceChildren();const addressMode=kind.value==='address';termField.hidden=addressMode;radiusField.hidden=addressMode;addressPanel.hidden=!addressMode;search.hidden=addressMode;help.hidden=addressMode;filters.hidden=addressMode||kind.value!=='campground';msg.textContent=addressMode?'Enter the full street address, then choose Find location and select the matching result.':'Type at least 2 characters to see suggestions, or choose Search nearby to browse.';};
 destination.box.addEventListener('click',setRadiusMode);destination.box.addEventListener('input',setRadiusMode);radius.addEventListener('change',()=>{if(term.value.trim().length>=2)suggest();});
 box.append(summary,intro,controls,addressPanel,help,filters,search,msg,results,selectedBox);kind.addEventListener('change',()=>{const isCamp=kind.value==='campground';filters.hidden=!isCamp;fullLabel.hidden=!isCamp;fitLabel.hidden=!isCamp;});refreshSelected();return {box,selected};
}
async function campsNear(point,radius=30){const rows=await query(db().rpc('npt_nearby_campgrounds',{center_lat:point[0],center_lon:point[1],radius_miles:radius,required_rv_length_ft:null,require_full_hookups:false,include_unknown_fit:true,result_limit:100}).abortSignal(AbortSignal.timeout(15000)));if(!rows.length)return [];const details=await query(db().from('npt_campgrounds').select('*').in('id',rows.map(x=>x.id)).abortSignal(AbortSignal.timeout(15000)));const dist=new Map(rows.map(x=>[x.id,x.distance_miles]));return details.map(c=>({...c,distance_miles:dist.get(c.id)})).sort((a,b)=>a.distance_miles-b.distance_miles);}
async function createStop(park){
 const camps=await campsNear(C.point(park),50),fits=camps.filter(c=>{return C.fit(c,model.basics.vehicle).ok;});
 fits.sort((a,b)=>Number(C.fit(a,model.basics.vehicle).unknown)-Number(C.fit(b,model.basics.vehicle).unknown)||(a.park_id===park.id?-1:0)-(b.park_id===park.id?-1:0)||a.distance_miles-b.distance_miles);
 const activities=park.id?(await parkSights(park,C.point(park))).slice(0,10):[];
 return {park,nights:2,campground:fits[0]||null,activities:activities.slice(0,5),options:activities,notes:''};
}
function stopPoint(s){return s.campground?.latitude!=null&&s.campground?.longitude!=null?C.point(s.campground):C.point(s.park);}
function sequenceStops(stops,start,end){const remaining=[...stops],ordered=[];let current=start;while(remaining.length){remaining.sort((a,b)=>{const score=s=>C.miles(current,stopPoint(s))*1.3+C.miles(stopPoint(s),end)*.15;return score(a)-score(b);});const next=remaining.shift();ordered.push(next);current=stopPoint(next);}return ordered;}
function changed(){model.legacyRoutingUnchanged=false;model.route=null;geometry=null;dirty=true;}
async function leaflet(){if(window.L)return window.L;if(!document.querySelector('[data-npt-leaflet]')){const css=el('link',null,{rel:'stylesheet',href:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','data-npt-leaflet':''});document.head.append(css);}await new Promise((resolve,reject)=>{const s=el('script',null,{src:'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'});s.onload=resolve;s.onerror=()=>reject(Error('Map could not load. Your itinerary remains editable.'));document.head.append(s);});return window.L;}
const expandedStops=new WeakSet();
function tripDate(offset){if(!model.basics.date)return 'Day '+(offset+1);const d=new Date(model.basics.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});}
function costLabel(s){return s.nightlyCost==null?'Not entered':new Intl.NumberFormat(undefined,{style:'currency',currency:s.costCurrency||'USD',maximumFractionDigits:0}).format(s.nightlyCost*s.nights)+' '+(s.costCurrency||'USD');}
const resolvedStops=()=>model.stops.filter(s=>!s.draft);
const stopName=s=>s.campground?.name||s.park?.name||'New stop — choose a place';
let draggedStop=null,focusStop=null;
function gapFor(s){const i=model.stops.indexOf(s),before=model.stops.slice(0,i).filter(x=>!x.draft),after=model.stops.slice(i+1).filter(x=>!x.draft),prev=before.at(-1),next=after[0];return {from:prev?{name:stopName(prev),point:stopPoint(prev)}:model.basics.start,to:next?{name:stopName(next),point:stopPoint(next)}:model.basics.end,legIndex:before.length};}
async function moveStop(s,to){const from=model.stops.indexOf(s);if(from<0||to<0||to>=model.stops.length||from===to)return;const old=resolvedStops();model.stops.splice(from,1);model.stops.splice(to,0,s);if(old.some((x,i)=>resolvedStops()[i]!==x))changed();else dirty=true;focusStop=s;await render();}
function dragStop(s,article,order){article._nptStop=s;const handle=btn('⠿',()=>say('Drag this handle to another row, or use the up and down arrows.'));handle.className='np-drag-handle';handle.draggable=false;handle.setAttribute('aria-label','Drag to reorder '+stopName(s));handle.title='Drag to reorder; or use the arrow buttons';handle.onpointerdown=e=>{if(busy)return;e.preventDefault();draggedStop=s;handle.setPointerCapture(e.pointerId);handle.classList.add('np-dragging');};handle.onpointermove=e=>{if(draggedStop!==s)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.np-list-stop');root?.querySelectorAll('.np-drop-before,.np-drop-after').forEach(x=>x.classList.remove('np-drop-before','np-drop-after'));if(target&&target!==article){const after=e.clientY>target.getBoundingClientRect().top+target.getBoundingClientRect().height/2;target.classList.add(after?'np-drop-after':'np-drop-before');}};handle.onpointerup=e=>{if(draggedStop!==s)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.np-list-stop'),from=model.stops.indexOf(s);draggedStop=null;handle.classList.remove('np-dragging');root?.querySelectorAll('.np-drop-before,.np-drop-after').forEach(x=>x.classList.remove('np-drop-before','np-drop-after'));if(!target||target===article)return;const index=model.stops.indexOf(target._nptStop);if(index<0)return;const after=e.clientY>target.getBoundingClientRect().top+target.getBoundingClientRect().height/2;let to=index+(after?1:0);if(from<to)to--;run(()=>moveStop(s,to));};order.prepend(handle);}
async function addBlankStop(index=0){if(model.stops.length>=100)throw Error('Limit reached: 100 stops.');if(!Number.isInteger(index)||index<0||index>model.stops.length)throw Error('Choose a position from Stop 1 through Stop '+(model.stops.length+1)+'.');const s={draft:true,kind:'campground',nights:1,activities:[],options:[],notes:''};model.stops.splice(index,0,s);expandedStops.add(s);dirty=true;focusStop=s;await render();}
function roadSamples(coords,targets){let total=0;const d=[0];for(let i=1;i<coords.length;i++){total+=C.miles(coords[i-1],coords[i]);d.push(total);}return targets.map(t=>coords[d.findIndex(x=>x>=total*t)]||coords.at(-1));}
function draftEditor(s,host){const gap=gapFor(s);host.append(el('strong','Between '+gap.from.name+' → '+gap.to.name),el('p','Move this row first, then find a place to break up this drive. Suggestions use these two neighboring stops.',{class:'np-muted'}));const kind=select([['campground','Campground'],['attraction','Attraction'],['address','Address']],s.kind);kind.setAttribute('aria-label','New stop type');kind.onchange=()=>run(async()=>{s.kind=kind.value;dirty=true;focusStop=s;await render();});host.append(field('What kind of stop?',kind));
 if(s.kind==='address'){const address=locationField('Address for new stop');host.append(address.box,btn('Use this address',()=>run(async()=>{const x=address.get();if(!x)throw Error('Find and select an address or map pin first.');await fillDraft(s,{name:x.name,latitude:x.point[0],longitude:x.point[1]});})));}
 else {const result=el('div',null,{class:'np-gap-results'});host.append(btn('Find suggestions between these stops',()=>run(()=>suggestGap(s,result)),true),result);}
 host.append(btn('Remove empty row',()=>run(async()=>{model.stops.splice(model.stops.indexOf(s),1);dirty=true;await render();})));
}
async function fillDraft(s,place){if(C.buildTrip({...model,stops:resolvedStops()}).length+s.nights>120)throw Error('This stop would exceed 120 days. Reduce other nights first.');s.park={id:null,name:place.name,latitude:place.latitude,longitude:place.longitude,official_url:place.official_url};s.campground=s.kind==='campground'?place:null;s.activities=s.kind==='attraction'?[place]:[];s.options=[...s.activities];if(s.kind==='attraction')s.nights=0;delete s.draft;expandedStops.add(s);changed();focusStop=s;await render();say('Stop added in this position. Road distances and dates updated.');}
async function gapOptions(gap,kind,excluded=new Set()){
 const routeData=await json('https://routing.openstreetmap.de/routed-car/route/v1/driving/'+[gap.from.point,gap.to.point].map(p=>p[1]+','+p[0]).join(';')+'?overview=full&geometries=geojson');const direct=routeData.routes?.[0];if(!direct)throw Error('No road route found between these stops. Choose an address instead.');
 const coords=direct.geometry.coordinates.map(p=>[p[1],p[0]]),preferredDistance=model.basics.hours!=null?model.basics.hours*45:(model.basics.distance??270),preferred=Math.min(.75,Math.max(.25,preferredDistance/(direct.distance/1609.344))),samples=roadSamples(coords,[.25,preferred,.75]);
 const jobs=samples.flatMap(p=>kind==='campground'?[campsNear(p,40),mappedCampgrounds(p,40)]:[attractionCandidates(p)]),outcomes=await Promise.allSettled(jobs);let candidates=[];
 for(const r of outcomes)if(r.status==='fulfilled')for(const c of r.value){if(excluded.has(c.name.toLowerCase())||kind==='campground'&&!C.fit(c,model.basics.vehicle).ok)continue;if(!candidates.some(x=>x.name.toLowerCase()===c.name.toLowerCase()&&C.miles(C.point(x),C.point(c))<.5))candidates.push(c);}
 const targetMiles=Math.min(model.basics.hours!=null?model.basics.hours*45:(model.basics.distance??270),direct.distance/1609.344/2);candidates.sort((a,b)=>{const score=c=>Math.abs(C.miles(gap.from.point,C.point(c))-targetMiles)+2*(C.miles(gap.from.point,C.point(c))+C.miles(C.point(c),gap.to.point)-C.miles(gap.from.point,gap.to.point));return (kind==='attraction'?sightPriority(a)-sightPriority(b):0)||score(a)-score(b);});candidates=candidates.slice(0,24);
 if(!candidates.length)return {choices:[],unavailable:outcomes.every(x=>x.status==='rejected'),partial:false,direct};
 const pts=[gap.from.point,...candidates.map(C.point),gap.to.point];let table=null;try{table=await json('https://routing.openstreetmap.de/routed-car/table/v1/driving/'+pts.map(p=>p[1]+','+p[0]).join(';')+'?annotations=distance,duration');}catch{}
 const choices=candidates.map((c,i)=>{const a=table?.distances?.[0]?.[i+1],b=table?.distances?.[i+1]?.[pts.length-1];return {c,a,b,firstSeconds:table?.durations?.[0]?.[i+1],secondSeconds:table?.durations?.[i+1]?.[pts.length-1],extra:a!=null&&b!=null?Math.max(0,a+b-direct.distance):null};});choices.sort((a,b)=>{const score=x=>x.extra==null?Infinity:x.extra/1609.344*2+Math.abs(x.a/1609.344-targetMiles);return score(a)-score(b);});
 return {choices,partial:outcomes.some(x=>x.status==='rejected'),direct};
}
async function suggestGap(s,host){
 const gap=gapFor(s),kind=s.kind;
 host.replaceChildren(el('p','Finding suggestions along this driving leg…',{role:'status'}));
 const {choices,direct,partial,unavailable}=await gapOptions(gap,kind);
 if(!choices.length){
  host.replaceChildren(el('p',unavailable?'Search services are unavailable. Retry or choose Address.':'No matching mapped places found along this route.'));return;
 }
 host.replaceChildren(el('p',gap.from.name+' → '+gap.to.name+' · '+Math.round(direct.distance/1609.344)+' road miles without this stop.'),el('small','Suggestions near three points along the road route, ranked by added driving and a useful driving break. Confirm access, RV fit and availability. '+(partial?'Some search sources were unavailable.':'')));
 for(const {c,a,b,extra} of choices.slice(0,12)){const card=el('div',null,{class:'np-result'});card.append(el('h4',c.name),el('p',extra==null?'Road comparison unavailable — distances will be retried when selected.':Math.round(a/1609.344)+' mi from '+gap.from.name+' · '+Math.round(b/1609.344)+' mi to '+gap.to.name+' · '+Math.round(extra/1609.344)+' extra mi'));if(kind==='campground')card.append(el('p',C.fit(c,model.basics.vehicle).label+' · '+C.hookups(c)));card.append(link('Place details',c.reservation_url||c.official_url||c.metadata?.source_url),btn('Use this '+(kind==='campground'?'campground':'attraction'),()=>run(()=>fillDraft(s,c))));host.append(card);}
 host.append(link('Map data © OpenStreetMap contributors','https://www.openstreetmap.org/copyright'));
}

function dismissPlace(name){
 const key=name.toLowerCase();
 model.dismissedPlaces=[...new Set([...(model.dismissedPlaces||[]),key])];
}
function driveLoad(meters,seconds,basics){
 return basics.hours!=null?seconds/3600/basics.hours:basics.distance!=null?meters/1609.344/basics.distance:0;
}
function exceedsDriveLimits(meters, seconds, basics){
 return driveLoad(meters,seconds,basics)>1;
}
function reviewedStop(place,kind){
 return {park:{name:place.name,latitude:place.latitude,longitude:place.longitude,region:place.region},
  campground:kind==='campground'?place:null,nights:kind==='campground'?1:0,
  activities:kind==='attraction'?[place]:[],options:kind==='attraction'?[place]:[],notes:'',attractionOnly:kind==='attraction',kind};
}
async function reviewTrip(host){
 if(model.stops.some(s=>s.draft))throw Error('Finish or remove the empty stop rows before recalculating.');
 if(!model.stops.length)throw Error('Add a stop before recalculating.');
 const current=model, stops=[...model.stops], basics=model.basics;
 host.hidden=false;
 host.replaceChildren(el('h3','Recalculate trip'),el('p','Checking every driving leg and planned stop…',{role:'status'}));
 host.scrollIntoView({block:'nearest'});
 const reviewedRoute=await calculateRoute(basics,stops);
 const locations=[basics.start,...stops.map(s=>({name:stopName(s),point:stopPoint(s)})),basics.end];
 const groups=[];
 const existing=new Set(stops.flatMap(s=>[stopName(s),s.park?.name,...s.activities.map(a=>a.name)]).filter(Boolean).map(n=>n.toLowerCase()));
 for(const name of model.dismissedPlaces||[])existing.add(name);
 reviewedRoute.legs.forEach((leg,index)=>{
  const from=locations[index],to=locations[index+1];
  const legLabel=from.name+' → '+to.name;
  const summary=Math.round(leg.distance/1609.344)+' miles · '+(leg.duration/3600).toFixed(1)+' hours';
  if(exceedsDriveLimits(leg.distance,leg.duration,basics)){
   groups.push({kind:'campground',index,title:'Break up '+legLabel,summary,
    load:async()=>{
     const result=await gapOptions({from,to},'campground',existing);
     const fits=({a,b,firstSeconds,secondSeconds})=>[a,b,firstSeconds,secondSeconds].every(Number.isFinite)&&
      !exceedsDriveLimits(a,firstSeconds,basics)&&!exceedsDriveLimits(b,secondSeconds,basics);
     result.choices.sort((a,b)=>Number(fits(b))-Number(fits(a)));
     return result;
    }});
  }else if(leg.distance>=40*1609.344){
   groups.push({kind:'sightStop',index,title:'Must-see stops along '+legLabel,summary,
    load:async()=>{
     const result=await gapOptions({from,to},'attraction',existing);
     result.choices=result.choices.filter(({c,a,b,firstSeconds,secondSeconds})=>
      sightPriority(c)<=2&&[a,b,firstSeconds,secondSeconds].every(Number.isFinite)&&
      !exceedsDriveLimits(a+b,firstSeconds+secondSeconds,basics))
      .sort((a,b)=>sightPriority(a.c)-sightPriority(b.c)||a.extra-b.extra);
     return result;
    }});
  }
 });
 stops.forEach((s,index)=>{
  if(s.nights>0&&(!s.campground||!C.fit(s.campground,basics.vehicle).ok)){
   groups.push({kind:'stay',index,title:'Choose a campground for '+s.park.name,
    load:async()=>({choices:(await campsNear(stopPoint(s),30))
     .filter(c=>!existing.has(c.name.toLowerCase())&&C.fit(c,basics.vehicle).ok)
     .slice(0,4).map(c=>({c,nearby:true}))})});
  }
  if(s.nights>0){
   groups.push({kind:'activity',index,title:'Must-see attractions at or near '+s.park.name,
    load:async()=>({choices:(await parkSights(s.park,stopPoint(s)))
     .filter(c=>!existing.has(c.name.toLowerCase())).slice(0,3).map(c=>({c,nearby:true}))})});
  }
 });
 for(let start=0;start<groups.length;start+=3){
  const batch=groups.slice(start,start+3);
  await Promise.all(batch.map(async group=>{
   try{group.result=await group.load();}catch{group.result={choices:[],unavailable:true};}
  }));
 }
 if(model!==current||!host.isConnected)return;
 host.replaceChildren(el('h3','Review proposed changes'),el('p',
  'Checked '+reviewedRoute.legs.length+' driving legs, including the final drive, and '+stops.length+' stops. Select any options you want to apply.'));
 for(const [i,group] of groups.entries()){
  const {choices,unavailable,partial}=group.result;
  if(!choices.length&&['activity','sightStop'].includes(group.kind)&&!unavailable)continue;
  const section=el('section',null,{class:'np-result'});section.append(el('h4',group.title));
  if(group.summary)section.append(el('p',group.summary));
  if(partial)section.append(el('p','Some search sources were unavailable.'));
  if(!choices.length){
   section.append(el('p',unavailable?'Search unavailable. Try recalculating again.':'No suitable catalog or mapped candidates were found.'));
  }else{
   const keep=input('radio','',{name:'npt-review-'+i,checked:''});keep.checked=true;
   const skip=el('label',null,{class:'np-check'});skip.append(keep,' Leave as planned');section.append(skip);
   for(const choice of choices.slice(0,4)){
    const {c,a,b,extra,firstSeconds,secondSeconds}=choice;
    const radio=input('radio',c.name,{name:'npt-review-'+i});
    const label=el('label',null,{class:'np-check'});label.append(radio,' '+c.name);
    const option=el('div',null,{class:'np-result'});option.append(label);
    if(extra!=null&&Number.isFinite(firstSeconds)&&Number.isFinite(secondSeconds)){
     option.append(el('p',Math.round(a/1609.344)+' mi / '+(firstSeconds/3600).toFixed(1)+' hr, then '+
      Math.round(b/1609.344)+' mi / '+(secondSeconds/3600).toFixed(1)+' hr · '+Math.round(extra/1609.344)+' added road mi'+
      (exceedsDriveLimits(a,firstSeconds,basics)||exceedsDriveLimits(b,secondSeconds,basics)?' · Still exceeds a driving limit':'')));
    }else if(!choice.nearby)option.append(el('p','Road comparison unavailable.'));
    else option.append(el('p',Math.round(C.miles(stopPoint(stops[group.index]),C.point(c)))+' mi straight-line from the stop'));
    if(['campground','stay'].includes(group.kind))option.append(el('p',[campgroundFacts(c,basics.vehicle),group.kind==='campground'?'Adds one night':'Keeps the planned nights'].join(' · ')));
    else option.append(el('p',[c.npt_parks?.name,c.category,visitMinutes(c)!=null?visitMinutes(c)+' min estimated visit':'Visit duration unconfirmed',group.kind==='sightStop'?'No overnight stay':null].filter(Boolean).join(' · ')||'Visit duration unconfirmed'));
    option.append(link('Place details',c.reservation_url||c.official_url||c.metadata?.source_url));
    section.append(option);
    (group.inputs??=[]).push({radio,c});
   }
  }
  host.append(section);
 }
 if(!host.querySelector('section'))host.append(el('p','No additions are proposed for the current route and stops.'));
 const buttons=el('div',null,{class:'np-actions'});
 buttons.append(btn('Apply selected changes',()=>run(async()=>{
  const revised=stops.map(s=>({...s,activities:[...s.activities],options:[...s.options||[]]}));
  const insertions=new Map(),picked=new Set();
  for(const group of groups){
   const selected=group.inputs?.find(item=>item.radio.checked)?.c;
   if(!selected)continue;
   const key=selected.name.toLowerCase();
   if(picked.has(key))throw Error('Select '+selected.name+' only once.');
   picked.add(key);
   if(group.kind==='campground'||group.kind==='sightStop')insertions.set(group.index,reviewedStop(selected,group.kind==='sightStop'?'attraction':'campground'));
   else if(group.kind==='stay'){
    revised[group.index].campground=selected;
    revised[group.index].nightlyCost=null;
   }
   else{
    revised[group.index].activities.push(selected);
    if(!revised[group.index].options.some(a=>a.id===selected.id))revised[group.index].options.push(selected);
   }
  }
  const proposed=[];
  revised.forEach((s,i)=>{if(insertions.has(i))proposed.push(insertions.get(i));proposed.push(s);});
  if(insertions.has(revised.length))proposed.push(insertions.get(revised.length));
  if(proposed.length>100||C.buildTrip({...current,stops:proposed}).length>120)throw Error('Select fewer overnight additions to stay within 100 stops and 120 days.');
  const routingChanged=insertions.size||groups.some(g=>g.kind==='stay'&&g.inputs?.some(i=>i.radio.checked));
  const nextRoute=routingChanged?await calculateRoute(basics,proposed):reviewedRoute;
  if(model!==current||!host.isConnected)return;
  model.stops=proposed;model.route=nextRoute;model.legacyRoutingUnchanged=false;
  geometry=nextRoute.geometry;dirty=true;await render();
  const remaining=nextRoute.legs.filter(l=>exceedsDriveLimits(l.distance,l.duration,basics)).length;
  say('Recalculated draft. '+(remaining?remaining+' driving legs still exceed your preferences. ':'')+'Save to keep these changes.');
 }),true),btn('Cancel review',()=>{host.hidden=true;host.replaceChildren();}));
 host.append(buttons);
}

async function completeInitialProposal(){
 const {basics,stops}=model;
 const excluded=new Set(stops.flatMap(s=>[stopName(s),...s.activities.map(a=>a.name)]).map(n=>n.toLowerCase()));
 const overnightBudget=basics.days-1;
 let route=await calculateRoute(basics,stops);
 const magnitude=(meters,seconds)=>driveLoad(meters,seconds,basics);
 const gapAt=index=>{
  const waypoint=s=>({name:stopName(s),point:stopPoint(s)});
  return {from:index?waypoint(stops[index-1]):basics.start,to:index<stops.length?waypoint(stops[index]):basics.end};
 };
 // Repeat after each batch so new legs are measured on the actual road route.
 for(let pass=0;pass<3;pass++){
  const room=Math.min(overnightBudget-stops.filter(s=>!s.attractionOnly).length,100-stops.length);
  const longLegs=route.legs.map((l,index)=>({index,load:magnitude(l.distance,l.duration)}))
   .filter(l=>l.load>1).sort((a,b)=>b.load-a.load).slice(0,Math.max(0,Math.min(room,6)));
  if(room<=0||!longLegs.length)break;
  const searches=await Promise.allSettled(longLegs.map(async leg=>({
   ...leg,choices:(await gapOptions(gapAt(leg.index),'campground',excluded)).choices
  })));
  const additions=[];
  for(const result of searches){
   if(result.status!=='fulfilled')continue;
   const {index,load,choices}=result.value;
   const best=choices.filter(x=>[x.a,x.b,x.firstSeconds,x.secondSeconds].every(Number.isFinite)&&
    !excluded.has(x.c.name.toLowerCase()))
    .map(x=>({...x,load:Math.max(magnitude(x.a,x.firstSeconds),magnitude(x.b,x.secondSeconds))}))
    .filter(x=>x.load<load-.05)
    .sort((a,b)=>Number(a.load>1)-Number(b.load>1)||
     Number(C.fit(a.c,basics.vehicle).unknown)-Number(C.fit(b.c,basics.vehicle).unknown)||
     a.load-b.load||a.extra-b.extra)[0];
   if(!best)continue;
   excluded.add(best.c.name.toLowerCase());
   const stop=reviewedStop(best.c,'campground');
   stop.transit=true;stop.notes='Suggested overnight to break up a long drive.';
   additions.push({index,stop});
  }
  if(!additions.length)break;
  const proposed=[...stops];
  for(const {index,stop} of additions.sort((a,b)=>b.index-a.index))proposed.splice(index,0,stop);
  route=await calculateRoute(basics,proposed);
  stops.splice(0,stops.length,...proposed);
 }

 const sightseeingLegs=route.legs.map((l,index)=>({l,index}))
  .filter(({l,index})=>l.distance>=40*1609.344&&magnitude(l.distance,l.duration)<=1&&
   (index===0||!stops[index-1].attractionOnly)&&(index===stops.length||!stops[index].attractionOnly))
  .slice(0,Math.min(5,100-stops.length));
 const sights=await Promise.allSettled(sightseeingLegs.map(async ({index})=>({
  index,choices:(await gapOptions(gapAt(index),'attraction',excluded)).choices
 })));
 const proposed=[...stops], additions=[];
 for(const result of sights){
  if(result.status!=='fulfilled')continue;
  const {index,choices}=result.value;
  const best=choices.filter(x=>sightPriority(x.c)<=2&&x.extra!=null&&x.extra<=25*1609.344&&
   [x.a,x.b,x.firstSeconds,x.secondSeconds].every(Number.isFinite)&&
   magnitude(x.a+x.b,x.firstSeconds+x.secondSeconds)<=1&&!excluded.has(x.c.name.toLowerCase()))
   .sort((a,b)=>sightPriority(a.c)-sightPriority(b.c)||a.extra-b.extra)[0];
  if(!best)continue;
  excluded.add(best.c.name.toLowerCase());
  const stop=reviewedStop(best.c,'attraction');
  stop.notes='Suggested must-see stop along the drive.';
  additions.push({index,stop});
 }
 if(additions.length){
  for(const {index,stop} of additions.sort((a,b)=>b.index-a.index))proposed.splice(index,0,stop);
  route=await calculateRoute(basics,proposed);
  stops.splice(0,stops.length,...proposed);
 }
 model.route=route;geometry=route.geometry;
}
function campgroundFacts(c,vehicle){
 const m=c.metadata||{};
 const amps=Array.isArray(m.electric_amps)?m.electric_amps.join('/'):m.electric_amps;
 const rate=m.campground_price_summary||(
  typeof m.campground_price_range==='string'?m.campground_price_range:null);
 const hookup=(name,value)=>name+' '+(value===true?'yes':value===false?'no':'unknown');
 const address=typeof m.address==='string'?m.address:null;
 const inventory=m.source_published_site_inventory;
 const sites=Number(inventory?.total)||null;
 const length=Number(c.max_trailer_length_ft);
 return [
  C.fit(c,vehicle).label,
  hookup('Electric',c.electric_hookups),hookup('Water',c.water_hookups),hookup('Sewer',c.sewer_hookups),
  amps?amps+' amp':null,rate||'Nightly rate unconfirmed',
  length>0?'Published trailer limit '+length+' ft':null,
  sites?sites+' published sites':null,address,m.telephone||c.phone||null
 ].filter(Boolean).join(' · ');
}

async function render(){
 const scroll=root?.scrollTop||0,renderOp=op,renderModel=model,sharing=document.querySelector('#ownerShare');
 if(!status.isConnected)body.append(status);
 let routingError='';
 if(!model.route){say('Calculating roads and driving distances…');try{await route(false);}catch(e){routingError=e.message;}}
 if(!root||op!==renderOp||model!==renderModel)return;
 map?.remove();map=null;body.replaceChildren();const t=C.buildTrip({...model,stops:resolvedStops()}),summary=el('div',null,{class:'np-summary'});summary.append(el('strong',t.name),el('span',`${t.length} days · ${model.stops.length} stops`));
 const review=el('section',null,{class:'np-search',hidden:''});
 const tools=el('div',null,{class:'np-plan-tools'}),actions=el('div',null,{class:'np-actions'}),add=btn('+ Add stop',()=>{insert.hidden=!insert.hidden;if(!insert.hidden)position.focus();});add.classList.add('np-add-stop');const insert=el('div',null,{class:'np-add-control',hidden:''}),position=input('number',1,{min:1,max:model.stops.length+1,step:1,'aria-label':'New stop position'});insert.append(field('Position (1–'+(model.stops.length+1)+')',position),btn('Insert row',()=>run(async()=>{const n=Number(position.value);if(!Number.isInteger(n)||n<1||n>model.stops.length+1)throw Error('Enter a stop position from 1 to '+(model.stops.length+1)+'.');await addBlankStop(n-1);})),btn('Cancel',()=>{insert.hidden=true;position.value='1';add.focus();}));actions.append(add,insert,btn('Recalculate trip',()=>run(()=>reviewTrip(review))),btn(editing?'Save changes':'Save private trip',()=>run(save),true));tools.append(actions);
 const routeIssues=(model.route?.legs||[]).map((leg,index)=>{const miles=leg.distance/1609.344,hours=leg.duration/3600,reasons=[];if(!model.basics.hours&&model.basics.distance&&miles>model.basics.distance)reasons.push('over '+model.basics.distance+' mi preferred');if(model.basics.hours&&hours>model.basics.hours)reasons.push('over '+model.basics.hours+' hr limit');if(!reasons.length)return null;const stops=resolvedStops(),from=index===0?model.basics.start.name:stopName(stops[index-1]),to=index>=stops.length?(C.miles(model.basics.start.point,model.basics.end.point)<.01?'return to start':model.basics.end.name):stopName(stops[index]);return {index,miles,hours,reasons,from,to};}).filter(Boolean);
 const alertBox=el('div',null,{class:'np-limit-alert',role:'alert','aria-live':'assertive'});if(routeIssues.length){const disclosure=el('details',null,{class:'np-limit-details'}),summary=el('summary','⚠ '+routeIssues.length+' driving legs are outside your limits · Expand to review'),list=el('div',null,{class:'np-limit-list'});for(const issue of routeIssues){const row=el('article',null,{class:'np-limit-item'}),why=el('p',issue.reasons.join(' · '));row.append(el('strong',(issue.index+1)+'. '+issue.from+' → '+issue.to),el('span',Math.round(issue.miles)+' mi · '+issue.hours.toFixed(1)+' hr'),why);const actions=el('div',null,{class:'np-limit-actions'});if(issue.index<resolvedStops().length){const target=resolvedStops()[issue.index],edit=btn('Edit stop #'+(issue.index+1),()=>{expandedStops.add(target);focusStop=target;render().then(()=>{const node=root?.querySelector('[data-focus-stop="true"]');node?.scrollIntoView({block:'center',behavior:'smooth'});});});actions.append(edit);}if(issue.index>0&&issue.index-1<resolvedStops().length){const target=resolvedStops()[issue.index-1],edit=btn('Edit stop #'+issue.index,()=>{expandedStops.add(target);focusStop=target;render().then(()=>{const node=root?.querySelector('[data-focus-stop="true"]');node?.scrollIntoView({block:'center',behavior:'smooth'});});});actions.append(edit);}actions.append(btn('Insert stop on this leg',()=>run(()=>addBlankStop(issue.index))));row.append(actions);list.append(row);}disclosure.append(summary,list);alertBox.append(disclosure);}else{alertBox.hidden=true;}
 const toolbar=el('div',null,{class:'np-editor-toolbar'});toolbar.append(summary,status,alertBox,tools);body.append(toolbar,review);say(routingError?'Road routing unavailable: '+routingError+' Distances are not shown until a route is found.':'Review and edit your stops, then save. Costs are your estimates, not booking quotes.');if(editing&&sharing){const privacy=el('details',null,{class:'np-privacy-details'});privacy.append(el('summary','Privacy & Sharing'));sharing.style.display='block';privacy.append(sharing);body.append(privacy);}
 const params=el('details',null,{class:'np-trip-parameters'});params.open=parameterPanelOpen;params.addEventListener('toggle',()=>parameterPanelOpen=params.open);params.append(el('summary','Trip parameters'));params.append(el('p','Edit the trip dates and driving preferences. When driving hours are set, they take priority for suggestions and warnings.',{class:'np-muted'}));const parameterGrid=el('div',null,{class:'np-param-grid'}),distanceLimit=input('number',model.basics.distance,{min:25,max:600,step:1,'aria-label':'Preferred driving distance between stops in miles'}),hoursLimit=input('number',model.basics.hours??'',{min:1,max:14,step:.5,'aria-label':'Maximum driving hours per day'});parameterGrid.append(field('Preferred driving distance between stops (miles, optional if hours are set)',distanceLimit),field('Maximum driving hours per day (optional)',hoursLimit));const startDate=input('date',model.basics.date,{required:''});
 const duration=input('number',t.length,{min:2,max:120,step:1,required:''});
 const tripName=input('text',model.basics.name||t.name,{required:''});
 tripName.oninput=()=>{
  model.basics.name=tripName.value.trim();
  summary.querySelector('strong').textContent=model.basics.name||'My National Park Trip';
  dirty=true;
 };
 parameterGrid.prepend(field('Trip name',tripName),field('Start date',startDate),field('Duration (days)',duration));
 startDate.onchange=()=>run(async()=>{
  if(!startDate.checkValidity()){startDate.value=model.basics.date||'';throw Error('Enter a valid start date.');}
  model.basics.date=startDate.value;dirty=true;await render();
 });
 duration.onchange=()=>run(async()=>{
  const days=Number(duration.value),overnights=resolvedStops().filter(s=>s.nights>0);
  if(!duration.checkValidity()||!overnights.length||days<overnights.length+1){
   duration.value=t.length;
   throw Error('Allow at least one night per overnight stop plus the final travel day.');
  }
  let remaining=days-t.length;
  if(remaining<0){
   for(const stop of [...overnights].sort((a,b)=>b.nights-a.nights)){
    const cut=Math.min(stop.nights-1,-remaining);stop.nights-=cut;remaining+=cut;
    if(!remaining)break;
   }
  }else{
   const destinations=overnights.filter(s=>!s.transit);
   const stays=destinations.length?destinations:overnights;
   for(let i=0;i<remaining;i++)stays[i%stays.length].nights++;
  }
  model.basics.days=days;dirty=true;await render();
 });
 params.append(parameterGrid);distanceLimit.onchange=()=>run(async()=>{const value=distanceLimit.value===''?null:Number(distanceLimit.value);if(value===null&&!model.basics.hours||value!==null&&(!Number.isInteger(value)||value<25||value>600)){distanceLimit.value=model.basics.distance??'';throw Error('Enter a preferred distance from 25–600 miles, or set driving hours before leaving this blank.');}parameterPanelOpen=true;model.basics.distance=value;dirty=true;await render();say('Preferred distance updated. Review the highlighted driving legs.');});hoursLimit.onchange=()=>run(async()=>{const value=hoursLimit.value===''?null:Number(hoursLimit.value);if(value!==null&&(!Number.isFinite(value)||value<1||value>14||value*2%1)||value===null&&model.basics.distance==null){hoursLimit.value=model.basics.hours??'';throw Error('Enter a maximum from 1 to 14 hours in half-hour steps, or keep a preferred distance limit.');}parameterPanelOpen=true;model.basics.hours=value;dirty=true;await render();say('Maximum driving hours updated. Review the highlighted driving legs.');});body.append(params);
 const layout=el('div',null,{class:'np-plan np-compact-plan'}),mapCol=el('div',null,{class:'np-map-column'}),mapBox=el('div',null,{class:'np-map','aria-label':'Proposed trip map'}),mapInfo=el('p','',{class:'np-muted'}),cards=el('div',null,{class:'np-stop-list'});mapCol.append(mapBox,mapInfo);layout.append(cards,mapCol);body.append(layout);
 const headers=el('div',null,{class:'np-list-grid np-list-heading'});['Stop name','Dates','Nights','Stay cost','Drive from previous','Order'].forEach(x=>headers.append(el('span',x)));cards.append(headers);
 const endpoint=(label,name,date,leg)=>{const row=el('div',null,{class:'np-list-grid np-endpoint'}),drive=el('span',null,{class:'np-drive-cell'});drive.textContent=leg?Math.round(leg.distance/1609.344)+' mi':label==='Start'?'—':'Unavailable';if(leg){const mi=leg.distance/1609.344,hr=leg.duration/3600,reasons=[];if(!model.basics.hours&&model.basics.distance&&mi>model.basics.distance)reasons.push('over '+model.basics.distance+' mi');if(model.basics.hours&&hr>model.basics.hours)reasons.push('over '+model.basics.hours+' hr');if(reasons.length){row.classList.add('np-list-stop-overlimit');drive.classList.add('np-over-limit');drive.replaceChildren(el('strong',Math.round(mi)+' mi'),el('small','⚠ '+reasons.join(' · '),{class:'np-limit-badge'}));}}row.append(el('strong',label+' · '+name),el('span',date),el('span','—'),el('span','—'),drive,el('span',''));cards.append(row);};
 endpoint('Start',model.basics.start.name,tripDate(0),null);
 let offset=0,resolvedIndex=0;
 for(let i=0;i<model.stops.length;i++){
  const s=model.stops[i],c=s.campground,article=el('article',null,{class:'np-list-stop'}),row=el('div',null,{class:'np-list-grid'}),detail=el('div',null,{class:'np-stop-detail'}),name=stopName(s);
  detail.hidden=!expandedStops.has(s);const toggle=btn((detail.hidden?'▸ ':'▾ ')+(i+1)+'. '+name,()=>{detail.hidden=!detail.hidden;detail.hidden?expandedStops.delete(s):expandedStops.add(s);toggle.textContent=(detail.hidden?'▸ ':'▾ ')+(i+1)+'. '+name;toggle.setAttribute('aria-expanded',String(!detail.hidden));});toggle.className='np-stop-toggle';toggle.setAttribute('aria-expanded',String(!detail.hidden));
  if(s.draft){article.classList.add('np-draft-stop');const order=el('div',null,{class:'np-order'});for(const [delta,label] of [[-1,'Move up'],[1,'Move down']]){const arrow=btn(delta<0?'↑':'↓',()=>run(()=>moveStop(s,i+delta)));arrow.setAttribute('aria-label',label+' empty stop');arrow.dataset.boundary=String(i+delta<0||i+delta>=model.stops.length);order.append(arrow);}dragStop(s,article,order);row.append(toggle,el('span','Choose a place'),el('span','—'),el('span','—'),el('span','Pending'),order);article.append(row,detail);cards.append(article);draftEditor(s,detail);if(focusStop===s)article.dataset.focusStop='true';continue;}
  const dates=el('span',tripDate(offset)+' – '+tripDate(offset+s.nights),{class:'np-list-dates'});offset+=s.nights;
  const n=input('number',s.nights,{min:s.kind==='attraction'?0:1,max:119,'aria-label':'Nights at '+name});n.onchange=()=>run(async()=>{const v=Number(n.value);if(!Number.isInteger(v)||v<(s.kind==='attraction'?0:1)||t.length-s.nights+v>120){n.value=s.nights;throw Error('Enter whole nights (attractions may be 0) and keep the trip within 120 days.');}s.nights=v;dirty=true;await render();});
  const cost=el('span',costLabel(s),{class:'np-list-cost'}),leg=model.route?.legs?.[resolvedIndex++],drive=el('span',null,{class:'np-drive-cell'});if(leg){const miles=leg.distance/1609.344,hours=leg.duration/3600,reasons=[];drive.append(el('strong',Math.round(miles)+' mi'));drive.title=hours.toFixed(1)+' driving hours';if(!model.basics.hours&&model.basics.distance&&miles>model.basics.distance)reasons.push('over '+model.basics.distance+' mi');if(model.basics.hours&&hours>model.basics.hours)reasons.push('over '+model.basics.hours+' hr');if(reasons.length){drive.classList.add('np-over-limit');drive.append(el('small','⚠ '+reasons.join(' · '),{class:'np-limit-badge'}));article.classList.add('np-list-stop-overlimit');}}else drive.textContent='Unavailable';
  const order=el('div',null,{class:'np-order'});
  for(const [delta,symbol,label] of [[-1,'↑','Move up'],[1,'↓','Move down']]){const arrow=btn(symbol,()=>run(async()=>{const j=i+delta;if(j<0||j>=model.stops.length)return;await moveStop(s,j);}));arrow.setAttribute('aria-label',label+' '+name);arrow.disabled=i+delta<0||i+delta>=model.stops.length;arrow.dataset.boundary=String(arrow.disabled);order.append(arrow);}
  dragStop(s,article,order);if(focusStop===s)article.dataset.focusStop='true';
  row.append(toggle,dates,n,cost,drive,order);article.append(row);
  if(c){
   const facts=el('div',null,{class:'np-campground-summary'});
   facts.append(el('span',campgroundFacts(c,model.basics.vehicle)));
   const booking=link('Campground & booking',c.reservation_url||c.official_url);
   if(booking)facts.append(booking);
   article.append(facts);
  }else if(s.nights>0&&!s.addressOnly)article.append(el('p','Campground needed · find nearby options',{class:'np-campground-summary'}));
  article.append(detail);cards.append(article);
  detail.append(el('h4',s.park.name),btn('Show on map',()=>map?.flyTo(stopPoint(s),10,{duration:.5})),el('p',c?C.hookups(c)+' · '+C.fit(c,model.basics.vehicle).label:'No compatible campground selected.'),btn('Find nearby campgrounds',()=>run(()=>campSearch(s,detail))));
  if(leg)detail.append(el('p',Math.round(leg.distance/1609.344)+' road miles · '+(leg.duration/3600).toFixed(1)+' driving hours (without breaks)'));
  if(c){detail.append(link(c.operator&&/koa/i.test(c.operator)?'Official campground website · '+c.name:'Campground & booking information',c.reservation_url||c.official_url||c.metadata?.source_url));if(c.metadata?.amenities?.length)detail.append(el('p','Listed amenities: '+c.metadata.amenities.join(' · ')));if(c.metadata?.maxstay)detail.append(el('p','Maximum stay listed: '+c.metadata.maxstay));if(c.metadata?.opening_hours)detail.append(el('p','Hours: '+c.metadata.opening_hours));if(c.phone)detail.append(el('p','Phone: '+c.phone));if(c.reservation_notes)detail.append(el('p',c.reservation_notes));if(c.metadata?.stay_restrictions)detail.append(el('p',c.metadata.stay_restrictions,{class:'np-warning'}));}
  const price=input('number',s.nightlyCost??'',{min:0,step:.01,'aria-label':'Estimated nightly cost at '+name}),currency=select([['USD','USD'],['CAD','CAD']],s.costCurrency||'USD');currency.setAttribute('aria-label','Cost currency at '+name);
  const updateCost=()=>{if(price.value!==''&&(!Number.isFinite(Number(price.value))||Number(price.value)<0)){say('Enter a nonnegative nightly cost.');return;}s.nightlyCost=price.value===''?null:Number(price.value);s.costCurrency=currency.value;dirty=true;cost.textContent=costLabel(s);};price.onchange=updateCost;currency.onchange=updateCost;
  const prices=el('div',null,{class:'np-inline'});prices.append(field('Estimated cost per night',price),field('Currency',currency));detail.append(prices);
  const acts=el('div',null,{class:'np-attractions'});for(const a of s.activities){const item=el('div',null,{class:'np-attraction'});item.append(el('strong',a.name));if(a.official_url)item.append(link('Details',a.official_url));item.append(btn('Remove',()=>run(async()=>{dismissPlace(a.name);s.activities=s.activities.filter(x=>x!==a);dirty=true;focusStop=s;await render();})));acts.append(item);}detail.append(el('h4','Planned attractions'),acts,btn('Choose attractions',()=>activityEditor(s,detail)));
  const notes=el('textarea',null,{'aria-label':'Notes for '+name,placeholder:'Stop notes'});notes.value=s.notes||'';notes.oninput=()=>{s.notes=notes.value;dirty=true;};detail.append(notes);
  detail.append(btn('Remove stop',()=>run(async()=>{dismissPlace(stopName(s));model.stops.splice(i,1);changed();await render();})));
 }
 endpoint(C.miles(model.basics.start.point,model.basics.end.point)<.01?'Return':'End',model.basics.end.name,tripDate(offset),model.route?.legs?.at(-1));
 try{const L=await leaflet();if(!mapBox.isConnected)return;map=L.map(mapBox,{scrollWheelZoom:false});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);layer=L.layerGroup().addTo(map);drawMap(mapInfo);}catch(e){mapBox.textContent=e.message;}
 root.scrollTop=scroll;root.querySelectorAll('[data-boundary="true"]').forEach(b=>b.disabled=true);if(focusStop){const target=root.querySelector('[data-focus-stop]');target?.scrollIntoView({block:"nearest"});target?.querySelector("button")?.focus();focusStop=null;}
}
async function photo(id,host){if(!id||id.startsWith('saved-'))return;try{const rows=await query(db().from('npt_catalog_photos').select('url,alt_text,credit,source_url').eq('attraction_id',id).order('sort_order').limit(1));const p=rows[0];if(!p||!host.isConnected||!safeURL(p.url))return;const im=el('img',null,{src:p.url,alt:p.alt_text||'Attraction photo',class:'np-photo',loading:'lazy'});im.onerror=()=>im.remove();host.prepend(im);if(p.credit)host.append(el('small',p.credit,{class:'np-muted'}));}catch{}}
function drawMap(info){if(!map)return;const L=window.L;layer.clearLayers();const points=[model.basics.start.point,...resolvedStops().map(stopPoint),model.basics.end.point];const line=geometry||model.route?.geometry;
 if(line)L.polyline(line,{color:'#315e42',weight:4}).addTo(layer);info.textContent=line?'Calculated roads · empty rows are not mapped until you choose a place. Verify RV clearances and seasonal access.':'Road route unavailable. Only stop markers are shown; retry Recalculate trip.';
 const loop=C.miles(points[0],points.at(-1))<.01;
 points.forEach((p,i)=>{if(loop&&i===points.length-1)return;const endpoint=i===0||i===points.length-1,name=i===0?(loop?'Start / Return: ':'Start: ')+model.basics.start.name:i===points.length-1?'End: '+model.basics.end.name:'Stop '+(model.stops.indexOf(resolvedStops()[i-1])+1)+': '+stopName(resolvedStops()[i-1]);const badge=el('span',i===0?(loop?'S / R':'Start'):i===points.length-1?'End':String(model.stops.indexOf(resolvedStops()[i-1])+1),{class:'np-pin'+(endpoint?' np-endpoint-pin':'')});L.marker(p,{title:name,zIndexOffset:endpoint?500:0,icon:L.divIcon({html:badge,iconSize:endpoint?[60,29]:[29,29],iconAnchor:endpoint?[30,14]:[14,14]})}).addTo(layer).bindTooltip(name,{permanent:endpoint,direction:'top'}).bindPopup(el('strong',name));});
 for(const s of model.stops)for(const a of s.activities){if(a.latitude==null||a.longitude==null)continue;const content=el('div');content.append(el('strong',a.name),el('p',(a.description||'').slice(0,170)),link('Official details',a.official_url));const marker=L.marker(C.point(a),{icon:L.divIcon({html:el('span','◆',{class:'np-pin attraction'}),iconSize:[24,24]})}).addTo(layer).bindTooltip(a.name).bindPopup(content);marker.on('popupopen',()=>photo(a.id,content));}
 map.fitBounds(L.latLngBounds(line||points),{padding:[30,30],maxZoom:11});
}
async function calculateRoute(basics,stops){
 const pts=[basics.start.point,...stops.map(stopPoint),basics.end.point];
 const data=await json('https://routing.openstreetmap.de/routed-car/route/v1/driving/'+pts.map(p=>`${p[1]},${p[0]}`).join(';')+'?overview=simplified&geometries=geojson&steps=true');if(data.code!=='Ok'||!data.routes?.[0]||data.routes[0].legs.length!==pts.length-1)throw Error('No road route found. Try replacing a stop or campground.');
 const r=data.routes[0];
 return {legGeometry:r.legs.map(l=>l.steps.flatMap(s=>s.geometry.coordinates.map(p=>[p[1],p[0]]))),legs:r.legs.map(l=>({distance:l.distance,duration:l.duration})),geometry:r.geometry.coordinates.map(p=>[p[1],p[0]]),calculatedAt:new Date().toISOString()};
}
async function route(redraw=true){
 const routeModel=model,routeOp=op;
 say('Calculating the driving route…');
 const next=await calculateRoute(model.basics,resolvedStops());
 if(!root||model!==routeModel||op!==routeOp)return;
 model.route=next;geometry=next.geometry;dirty=true;
 if(redraw){await render();say('Road route calculated. Highlighted legs exceed your driving preferences.');}
}

function activityEditor(s,card){card.querySelector('.np-activity-editor')?.remove();const box=el('div',null,{class:'np-search np-activity-editor'});box.append(el('h4','Attractions at this stop'));for(const a of s.options||[]){const check=input('checkbox');check.checked=s.activities.some(x=>x.id===a.id);const label=el('label',null,{class:'np-check'});label.append(check,' '+a.name);box.append(label);check.onchange=()=>{s.activities=check.checked?[...s.activities,a]:s.activities.filter(x=>x.id!==a.id);dirty=true;};}box.append(btn('Done',()=>run(render)));card.append(box);box.scrollIntoView({block:'nearest'});}
async function campSearch(s,card){card.querySelector('.np-camp-search')?.remove();const box=el('div',null,{class:'np-search np-camp-search'}),q=input('search','',{placeholder:'Filter nearby results by name or brand','aria-label':'Campground name or brand'}),radius=select([['15','Within 15 miles'],['30','Within 30 miles'],['50','Within 50 miles'],['100','Within 100 miles']],'30'),full=input('checkbox'),unknown=input('checkbox');unknown.checked=true;radius.setAttribute('aria-label','Campground search distance');const results=el('div'),msg=el('p','Searching nearby…',{role:'status'});box.append(el('h4','Campgrounds near '+s.park.name),q,radius);for(const [x,label] of [[full,'Full hookups only'],[unknown,'Include sites with unconfirmed equipment fit']]){const l=el('label',null,{class:'np-check'});l.append(x,' '+label);box.append(l);}box.append(msg,results,link('Map data © OpenStreetMap contributors','https://www.openstreetmap.org/copyright'));card.append(box);let found=[],coverage='';
 function show(){results.replaceChildren();const filtered=found.filter(c=>{const fit=C.fit(c,model.basics.vehicle);return fit.ok&&(unknown.checked||!fit.unknown)&&(!full.checked||c.electric_hookups&&c.water_hookups&&c.sewer_hookups)&&[c.name,c.operator,c.metadata?.brand].join(' ').toLowerCase().includes(q.value.toLowerCase());});msg.textContent=(filtered.length?`${filtered.length} nearby options · ${found.length-filtered.length} hidden by filters. `:'No matches with these filters. ')+coverage+' Distances are by road when available; unknown distances are not confirmed within range. Map listings do not confirm RV fit or availability.';for(const c of filtered){const r=el('div',null,{class:'np-result'});r.append(el('h4',c.name),el('p',`${c.road_miles==null?'Road distance unavailable':c.road_miles.toFixed(1)+' road miles'} · ${C.hookups(c)}`),el('p',campgroundFacts(c,model.basics.vehicle)),link(c.official_url||c.reservation_url?'Official information':'Map listing',c.reservation_url||c.official_url||c.metadata?.source_url),btn('Use this campground',()=>run(async()=>{s.campground=c;changed();await render();say('Campground replaced. Driving distances updated where road routing is available.');})));if(c.metadata?.amenities?.length)r.append(el('p','Listed amenities: '+c.metadata.amenities.join(' · ')));if(c.metadata?.maxstay)r.append(el('p','Maximum stay listed: '+c.metadata.maxstay));if(c.metadata?.opening_hours)r.append(el('p','Hours: '+c.metadata.opening_hours));if(c.phone)r.append(el('p','Phone: '+c.phone));if(c.metadata?.stay_restrictions)r.append(el('p',c.metadata.stay_restrictions,{class:'np-warning'}));results.append(r);}}
 async function search(){
 lock(true);msg.textContent='Searching catalog and mapped campgrounds…';results.replaceChildren();const point=stopPoint(s),range=Number(radius.value);
 const sources=await Promise.allSettled([campsNear(point,range),mappedCampgrounds(point,range)]);
 const catalog=sources[0].status==='fulfilled'?sources[0].value:[],mapped=sources[1].status==='fulfilled'?sources[1].value:[];
 found=[...catalog];for(const c of mapped){if(!found.some(x=>C.miles(C.point(x),C.point(c))<.5&&x.name.toLowerCase().replace(/[^a-z0-9]/g,'')===c.name.toLowerCase().replace(/[^a-z0-9]/g,'')))found.push(c);}
 coverage=sources.every(x=>x.status==='fulfilled')?'Catalog + OpenStreetMap results (up to 100 mapped listings; coverage varies).':sources.every(x=>x.status==='rejected')?'Both search services are unavailable. Please retry.':sources[1].status==='rejected'?'Live map search unavailable; showing catalog results only.':'Catalog unavailable; showing map listings only.';
 msg.textContent='Found '+found.length+' listings. Calculating road distances…';
 for(let offset=0,resolvedIndex=0;offset<found.length;offset+=40){const batch=found.slice(offset,offset+40),pts=[point,...batch.map(C.point)];try{const d=await json('https://routing.openstreetmap.de/routed-car/table/v1/driving/'+pts.map(p=>p[1]+','+p[0]).join(';')+'?sources=0&annotations=distance');batch.forEach((c,i)=>{const m=d.distances?.[0]?.[i+1];c.road_miles=m==null?null:m/1609.344;});}catch{batch.forEach(c=>c.road_miles=null);}}
 found=found.filter(c=>c.road_miles==null||c.road_miles<=range).sort((a,b)=>(a.road_miles??Infinity)-(b.road_miles??Infinity));show();
 }radius.onchange=()=>run(search);q.oninput=show;full.onchange=show;unknown.onchange=show;await search();box.scrollIntoView({block:'nearest'});
}
function parkSearch(host){host.querySelector('.np-park-search')?.remove();const box=el('div',null,{class:'np-search np-park-search'}),q=input('search','',{placeholder:'Search national or state parks','aria-label':'Park name'}),results=el('div');box.append(q,btn('Find park stop',()=>run(async()=>{if(q.value.trim().length<2)throw Error('Enter at least two letters.');const rows=await query(db().from('npt_parks').select('id,name,region,latitude,longitude,designation,official_url').in('designation',['national_park','national_park_canada','state_park']).ilike('name','%'+q.value.trim()+'%').not('latitude','is',null).limit(20));results.replaceChildren();for(const p of rows.filter(p=>!model.stops.some(s=>s.park.id===p.id)))results.append(btn(`${p.name} · ${p.region||''}`,()=>run(async()=>{if(C.buildTrip(model).length>118||model.stops.length>=100)throw Error('Limit reached: 120 days or 100 stops.');model.stops.push(await createStop(p));changed();await render();})));if(!results.children.length)results.textContent='No new matching parks with map coordinates.';})),results);const location=locationField('Or add a city / overnight stop');box.append(location.box,btn('Add this location',()=>run(async()=>{const loc=location.get();if(!loc)throw Error('Find and select a location first.');if(C.buildTrip(model).length>118)throw Error('Limit reached: 120 days.');model.stops.push(await createStop({id:null,name:loc.name,latitude:loc.point[0],longitude:loc.point[1]}));changed();await render();})));host.append(box);q.focus();}
async function save(){if(!model.basics.name?.trim())throw Error('Enter a trip name under Trip parameters before saving.');if(model.stops.some(s=>s.draft))throw Error('Choose a place for each empty row, or remove it, before saving.');if(!model.stops.length)throw Error('Add at least one stop.');const trip=C.buildTrip(model);if(trip.length>120)throw Error('Limit this itinerary to 120 days.');say('Saving to your account…');const id=await window.nptCloud.saveProposal(trip,editing);dirty=false;close(true);window.openTrip(id);}
// The existing campground tab uses the same nearby catalog search for generated trips.
window.editNptProposal=trip=>window.openNptPlanner(trip);
})();


