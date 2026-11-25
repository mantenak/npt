/* Admin-only catalog CRUD for parks, campgrounds, campsites, attractions, and sources. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defs={
 national:{title:"U.S. National Parks",table:"npt_parks",pk:"id",search:"name",filter:q=>q.eq("designation","national_park").eq("country","US"),cols:[["name","Park"],["region","Region"],["country","Country"],["official_url","Official link"]],fields:[
  ["name","Name","text",true],["designation","Designation","select",true,["national_park","national_park_canada","other"]],["region","State / region","text"],["country","Country","text",true],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["official_id","Agency ID","text"],["description","Description","textarea"],["source_key","Source key","text"],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 state:{title:"State Parks",table:"npt_parks",pk:"id",search:"name",filter:q=>q.eq("designation","state_park"),cols:[["name","Park"],["region","State"],["official_url","Official link"]],fields:[
  ["name","Name","text",true],["designation","Designation","select",true,["state_park","other"]],["region","State / region","text"],["country","Country","text",true],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["official_id","Agency ID","text"],["description","Description","textarea"],["source_key","Source key","text"],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 units:{title:"Other Park Units",table:"npt_parks",pk:"id",search:"name",filter:q=>q.eq("designation","other"),cols:[["name","Park unit"],["region","Region"],["country","Country"]],fields:[
  ["name","Name","text",true],["designation","Designation","select",true,["other","national_park","state_park","national_park_canada"]],["region","State / region","text"],["country","Country","text",true],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["official_id","Agency ID","text"],["description","Description","textarea"],["source_key","Source key","text"],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 campgrounds:{title:"Campgrounds",table:"npt_campgrounds",pk:"id",search:"name",cols:[["name","Campground"],["operator","Operator"],["region","State"],["max_rv_length_ft","Max RV (ft)"],["electric_hookups","Electric"],["water_hookups","Water"],["sewer_hookups","Sewer"]],fields:[
  ["name","Name","text",true],["park_id","Park","relation",false,"npt_parks"],["country","Country","text",true],["region","State / region","text"],["latitude","Latitude","number"],["longitude","Longitude","number"],["description","Description","textarea"],["official_url","Official URL","url"],["reservation_url","Reservation URL","url"],["operator","Operator / brand","text"],["campground_type","Campground type","text"],["rv_allowed","RVs allowed","boolean"],["trailer_allowed","Trailers allowed","boolean"],["max_rv_length_ft","Maximum RV length (ft)","number"],["max_trailer_length_ft","Maximum trailer length (ft)","number"],["electric_hookups","Electric hookup","boolean"],["water_hookups","Water hookup","boolean"],["sewer_hookups","Sewer hookup","boolean"],["amenities","Amenities (JSON)","json",false,{}],["fees","Campground price range / average (JSON)","json",false,[]],["operating_hours","Operating hours (JSON)","json",false,[]],["reservation_notes","Reservation notes","textarea"],["accessibility","Accessibility (JSON)","json",false,{}],["source_key","Source key","text",true],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 campsites:{title:"Individual Campsites",table:"npt_campsites",pk:"id",search:"site_number",cols:[["site_number","Site"],["site_type","Type"],["max_equipment_length_ft","Max rig (ft)"],["electric_amps","Electric amps"],["water_hookup","Water"],["sewer_hookup","Sewer"]],fields:[
  ["campground_id","Campground","relation",true,"npt_campgrounds"],["site_number","Site number","text",true],["site_type","Site type","text"],["max_equipment_length_ft","Maximum equipment length (ft)","number"],["equipment_types","Allowed equipment (comma separated)","array_text"],["electric_amps","Electric amps (comma separated)","array_number"],["water_hookup","Water hookup","boolean"],["sewer_hookup","Sewer hookup","boolean"],["accessible","Accessible site","boolean"],["reservation_url","Reservation URL","url"],["source_key","Source key","text",true],["source_record_id","Source record ID","text",true],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 attractions:{title:"Attractions",table:"npt_attractions",pk:"id",search:"name",cols:[["name","Attraction"],["attraction_type","Type"],["difficulty","Difficulty"],["duration_minutes","Minutes"]],fields:[
  ["park_id","Park","relation",true,"npt_parks"],["name","Name","text",true],["description","Description","textarea"],["attraction_type","Type","text"],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["duration_minutes","Typical duration (minutes)","number"],["difficulty","Difficulty","text"],["accessibility","Accessibility (JSON)","json",false,{}],["seasonality","Seasonality (JSON)","json",false,{}],["source_key","Source key","text",true],["source_record_id","Source record ID","text",true],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 sources:{title:"Source Directories",table:"npt_catalog_sources",pk:"key",search:"name",cols:[["name","Source"],["key","Key"],["url","Directory URL"],["coverage_notes","Coverage"]],fields:[
  ["key","Source key","text",true],["name","Name","text",true],["url","Official directory URL","url",true],["license_notes","Attribution / usage notes","textarea"],["coverage_notes","Coverage notes","textarea"]
 ]}
};
// Field presence is separate from verification. Never infer sewer from a dump station.
const present=v=>v!==null&&v!==undefined&&v!==""&&(!Array.isArray(v)||v.length>0)&&(typeof v!=="object"||Array.isArray(v)||Object.keys(v).length>0);
const get=(r,k)=>k.split(".").reduce((v,p)=>v==null?undefined:v[p],r);
const parkTab=()=>["national","state","units"].includes(active);
const campTab=()=>["campgrounds","campsites"].includes(active);
const extraFields={
 "metadata.electric_amps":["metadata.electric_amps","Electric amps (comma separated)","array_number"],
 "metadata.dump_station":["metadata.dump_station","Shared dump station available","boolean"],
 "metadata.park_context":["metadata.park_context","Park setting","select",false,["Inside park","Outside park","Transit","Not applicable"]],
 "metadata.max_trailer_length_ft":["metadata.max_trailer_length_ft","Published maximum trailer length (ft)","number"],
 "metadata.rate_notes":["metadata.rate_notes","Published rate / range (include currency and period)","textarea"],
 "metadata.detail_source_url":["metadata.detail_source_url","Source URL for this edit","url"]
};
function amps(r,tab=active){return tab==="campsites"?r.electric_amps:(r.metadata?.electric_amps??r.metadata?.electric_amps_observed)}
function setting(r){return r.metadata?.park_context||({inside:"Inside",outside:"Outside",nearby:"Nearby"}[r.metadata?.park_relationship])}
function electric(r,tab=active){if(tab!=="campsites")return r.electric_hookups;return Array.isArray(amps(r,tab))&&amps(r,tab).some(n=>Number(n)>0)||/ ELECTRIC$/i.test(r.site_type||"")?true:/ NONELECTRIC$/i.test(r.site_type||"")?false:null}
function ratePresent(r){return [r.metadata?.nightly_rate_usd,r.fees,r.metadata?.rate_notes,r.metadata?.published_nightly_rate_observation,r.metadata?.published_rate_observation,r.metadata?.campground_price_range,r.metadata?.campground_price_summary].some(present)}
function missing(r,tab=active,all=false){
 const gaps=[];const need=(k,label,ok=present(get(r,k)))=>{if(all||!ok)gaps.push([k,label])};
 if(["national","state","units"].includes(tab)){need("description","Summary");need("official_url","Official link");need("region","State / region");}
 else if(["campgrounds","campsites"].includes(tab)){
  const site=tab==="campsites";
  need(site?"site_type":"campground_type","Type");
  if(site)need("campground_id","Campground association");
  if(!site)need("electric_hookups","Electric",typeof electric(r,tab)==="boolean");
  if(!site){
   const context=setting(r);
   if(!(["Transit","Not applicable"].includes(context)))need("park_id","Park association");
   if(present(r.park_id))need("metadata.park_context","Park setting",present(context));
  }
  need(site?"water_hookup":"water_hookups","Water hookup",typeof get(r,site?"water_hookup":"water_hookups")==="boolean");
  need(site?"sewer_hookup":"sewer_hookups","Sewer hookup",typeof get(r,site?"sewer_hookup":"sewer_hookups")==="boolean");
  if(!site)need("metadata.dump_station","Dump station",typeof r.metadata?.dump_station==="boolean");
  if(electric(r,tab)!==false)need(site?"electric_amps":"metadata.electric_amps","Amps",present(amps(r,tab)));
  if(r.trailer_allowed!==false)need(site?"metadata.max_trailer_length_ft":"max_trailer_length_ft","Max trailer",Number(site?(r.metadata?.max_trailer_length_ft??r.metadata?.equipment_max_lengths_ft?.Trailer):r.max_trailer_length_ft)>0);
  need("metadata.rate_notes","Rate",ratePresent(r));need("reservation_url","Booking link");
 }else if(tab==="attractions"){need("park_id","Park association");need("description","Summary");need("official_url","Official link");need("duration_minutes","Duration");}
 else {need("url","Source link");need("coverage_notes","Coverage notes");}
 return gaps;
}
function hookups(r){
 if(parkTab()){
  if(campgroundsLoadError)return "Campground details failed to load";
  const linked=campgroundsByPark[String(r.id)]||[];
  if(!linked.length)return "No linked campground records";
  const status=c=>c.electric_hookups===true&&c.water_hookups===true&&c.sewer_hookups===true?"full":
   c.electric_hookups===false&&c.water_hookups===false&&c.sewer_hookups===false?"none":
   [c.electric_hookups,c.water_hookups,c.sewer_hookups].some(v=>v===true)?"some":
   [c.electric_hookups,c.water_hookups,c.sewer_hookups].some(v=>v===false)?"incomplete":"unverified";
  const counts={full:0,some:0,none:0,incomplete:0,unverified:0};linked.forEach(c=>counts[status(c)]++);
  return "Full E/W/S "+counts.full+" · Some Yes "+counts.some+" · All No "+counts.none+" · Unknown "+(counts.incomplete+counts.unverified)+" ("+linked.length+")";
 }
 const site=active==="campsites",e=electric(r),w=r[site?"water_hookup":"water_hookups"],s=r[site?"sewer_hookup":"sewer_hookups"],d=r.metadata?.dump_station;
 const flag=(v,k)=>k+": "+(v===true?"Yes":v===false?"No":"Unknown");
 const ampList=amps(r);const ampText=Array.isArray(ampList)&&ampList.length?" ("+ampList.join("/")+"A)":"";
 return (e===true&&w===true&&s===true?"Full: E/W/S · ":"")+[flag(e,"E")+ampText,flag(w,"W"),flag(s,"S"),...(!site?[flag(d,"D")]:[])].join(" · ");
}
function trailer(r){
 if(parkTab()){
  if(campgroundsLoadError)return "Campground details failed to load";
  const linked=campgroundsByPark[String(r.id)]||[];
  if(!linked.length)return "No linked campground records";
  const lengths=[...new Set(linked.map(c=>Number(c.max_trailer_length_ft)).filter(n=>n>0))].sort((a,b)=>a-b);
  const unknown=linked.filter(c=>c.trailer_allowed!==false&&!(Number(c.max_trailer_length_ft)>0)).length;
  const blocked=linked.filter(c=>c.trailer_allowed===false).length;
  return "Published limits: "+(lengths.length?(lengths.length===1?lengths[0]+" ft":lengths[0]+"–"+lengths[lengths.length-1]+" ft") :"none")+" · Unknown: "+unknown+" · Not allowed: "+blocked;
 }
 if(r.trailer_allowed===false)return "Trailers not allowed";
 const v=active==="campsites"?(r.metadata?.max_trailer_length_ft??r.metadata?.equipment_max_lengths_ft?.Trailer):r.max_trailer_length_ft;
 if(Number(v)>0)return v+" ft";
 return "Unknown"+(active==="campsites"&&Number(r.max_equipment_length_ft)>0?" (equipment limit: "+r.max_equipment_length_ft+" ft)":"");
}
function fieldDef(k){return extraFields[k]||defs[active].fields.find(f=>f[0]===k)}
function gapHTML(r,i){
 const gaps=missing(r);
 const own=gaps.length?gaps.map(([k,label])=>'<button class="npt-cat-gap" data-edit="'+i+'" data-focus="'+k+'">Park: '+esc(label)+'</button>').join(" "):'<span class="npt-cat-complete">Park fields populated</span>';
 if(!parkTab())return gaps.length?gaps.map(([k,label])=>'<button class="npt-cat-gap" data-edit="'+i+'" data-focus="'+k+'">'+esc(label)+'</button>').join(" "):'<span class="npt-cat-complete">Displayed fields populated</span>';
 if(campgroundsLoadError)return own+' <span class="npt-cat-gap">Campground details failed to load</span>';
 const linked=campgroundsByPark[String(r.id)]||[];
 if(!linked.length)return own+' <button class="npt-cat-gap" data-add-campground="'+i+'">No linked campground records · Add campground</button>';
 const incomplete=linked.filter(c=>missing(c,"campgrounds").length).length;
 const camps=linked.map(c=>{const idx=campgroundRowIndex[String(c.id)],missingFields=missing(c,"campgrounds");
  return '<div class="npt-cat-park-camp"><strong>'+esc(c.name||"Unnamed campground")+'</strong><small class="npt-cat-sub">'+esc((c.campground_type||"Type unknown").replace(/_/g," "))+'</small> '+(missingFields.length?missingFields.map(([k,label])=>'<button class="npt-cat-gap" data-camp-edit="'+idx+'" data-focus="'+k+'">'+esc(label)+'</button>').join(" "):'<span class="npt-cat-complete">Displayed fields populated</span>');
 }).join("");
 return own+'<details class="npt-cat-park-details"><summary>Campgrounds: '+linked.length+' · '+incomplete+' with missing fields</summary><div class="npt-cat-park-camps">'+camps+'</div></details>';
}
const compactPark=()=>active==="national"||active==="state";
let attractionsByPark={},attractionError="";
function linkedName(row,region){
 const label=esc((row.name||"Unnamed")+(region?" ("+region+")":""));
 return /^https?:\/\//i.test(row.official_url||"")?'<a href="'+esc(row.official_url)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>':label;
}
function disclosure(label,items){
 if(!items.length)return esc(label);
 return '<details><summary>'+esc(label)+'</summary><ul>'+items.map(item=>'<li>'+item+'</li>').join("")+'</ul></details>';
}
function campLocation(c){
 const context=String(setting(c)||"").toLowerCase();
 if(["inside","inside park"].includes(context))return "inside";
 if(["outside","outside park","nearby"].includes(context)){
  const miles=c.metadata?.entrance_road_miles;
  if(miles!=null&&String(miles).trim()!==""&&Number.isFinite(Number(miles))&&Number(miles)>=0)return Number(miles)<=30?"outside":"far";
 }
 return ["transit","not applicable"].includes(context)?"other":"unknown";
}
function compactGaps(r,i){
 const items=missing(r).map(([key,label])=>'<button class="npt-cat-gap" data-edit="'+i+'" data-focus="'+esc(key)+'">'+esc(label)+'</button>');
 let total=missing(r,active,true).length;
 if(compactPark())return disclosure(items.length+"/"+total+" park fields",items);
 return disclosure(items.length+"/"+total,items);
}
function summaryCell(r,k,i){
 if(k==="linked_name")return linkedName(r,r.region||(active==="attractions"?parksById[r.park_id]?.region:""));
 if(k==="compact_gaps")return compactGaps(r,i);
 if(k==="park_attractions"||k==="inside"||k==="outside"){
  const attractions=k==="park_attractions";
  if(attractions?attractionError:campgroundsLoadError)return "Lookup unavailable";
  const records=attractions?(attractionsByPark[r.id]||[]):(campgroundsByPark[r.id]||[]).filter(c=>campLocation(c)===k);
  const noun=attractions?"attraction":"campground";
  const label=records.length?records.length+" "+noun+(records.length===1?"":"s"):"None recorded";
  const confirmed=disclosure(label,records.map(c=>linkedName(c)+(k==="outside"?" · "+esc(c.metadata.entrance_road_miles)+" road mi":"")));
  if(attractions)return confirmed;
  const pending=(campgroundsByPark[r.id]||[]).filter(c=>{
   if(campLocation(c)!=="unknown")return false;
   const needsDistance=["outside","outside park","nearby"].includes(String(setting(c)||"").toLowerCase());
   return k==="outside"?needsDistance:!needsDistance;
  });
  return confirmed+(pending.length?'<div>'+disclosure(pending.length+(k==="outside"?" awaiting road distance":" awaiting boundary check"),pending.map(c=>linkedName(c)))+'</div>':"");
 }
 if(k==="visit_details"){
  const items=[r.attraction_type,r.difficulty,r.duration_minutes!=null?r.duration_minutes+" min":null].filter(Boolean);
  return disclosure(items.length?"Details":"Unknown",items.map(esc));
 }
 if(k==="rv_details")return disclosure("RV details",[esc(hookups(r)),esc("Max trailer: "+trailer(r))]);
 
 if(k==="inventory_counts"){
  const m=r.metadata||{}, inventory=m.campsites||{}, imported=m.imported_site_counts||{};
  const labels={totalSites:"Total",tentOnly:"Tent only",rvOnly:"RV only",group:"Group",horse:"Horse",walkBoatTo:"Walk/boat",other:"Other"};
  const lines=Object.entries(labels).filter(([key])=>inventory[key]!=null&&inventory[key]!=="").map(([key,label])=>label+": "+inventory[key]);
  const detail=Object.entries({tent_only:"Tent only",rv_or_motorhome_compatible:"RV/motorhome compatible",trailer_compatible:"Trailer compatible",cabins:"Cabins",group_sites:"Group"}).filter(([key])=>imported[key]!=null).map(([key,label])=>label+": "+imported[key]);
  if(!lines.length&&!detail.length)return "Unknown";
  return '<details><summary>'+esc(lines[0]||"Imported counts")+'</summary>'+esc(lines.join(" · "))+(detail.length?'<div>Imported sites (categories can overlap): '+esc(detail.join(" · "))+'</div>':'')+'</details>';
 }
 if(k==="site_rate"){
  const m=r.metadata||{},price=m.nightly_rate_usd;
  return price!=null&&price!==""&&Number.isFinite(Number(price))?esc(new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(price)))+(m.rate_basis?'<small class="npt-cat-sub">'+esc(m.rate_basis)+'</small>':''):esc(m.rate_notes||"Unknown");
 }
 if(k==="fifth_wheel"){
  const ft=r.metadata?.max_fifth_wheel_length_ft??r.metadata?.equipment_max_lengths_ft?.["FIFTH WHEEL"];
  return Number(ft)>0?esc(ft)+" ft":"Unknown";
 }
 if(k==="summary_name")return '<button class="npt-cat-name" data-edit="'+i+'">'+esc(r.name||r.site_number||"Unnamed")+'</button><small class="npt-cat-sub">'+esc([r.region,active==="campgrounds"?(r.campground_type||"Type unknown").replace(/_/g," "):active==="campsites"?r.site_type:null].filter(Boolean).join(" · "))+'</small>';
 if(k==="summary_park"){
  if(active==="attractions")return esc(parkLookupError?"Park lookup failed":(parksById[String(r.park_id)]?.name||"Park not linked"));
  if(active==="campsites")return esc(campgroundLookupError?"Campground lookup failed":(campgroundsById[String(r.campground_id)]?.label||"Campground not linked"));
  const park=parksById[String(r.park_id)],context=setting(r);
  const value=park?[park.name,context||"Setting unknown"].join(" · ")+(r.metadata?.entrance_road_miles!=null?" · "+r.metadata.entrance_road_miles+" road mi to "+(r.metadata.entrance_name||"entrance"):""):context||"Park / setting unknown";
  return '<button class="npt-cat-cell-edit" data-edit="'+i+'" data-focus="'+(context||park?"metadata.park_context":"park_id")+'">'+esc(value)+'</button>';
 }
 if(k==="summary_hookups")return parkTab()?'<details class="npt-cat-hookup-details"><summary>'+esc(hookups(r))+'</summary><ul>'+((campgroundsByPark[String(r.id)]||[]).map(c=>{
  const flag=v=>v===true?"Yes":v===false?"No":"Unknown",meta=c.metadata||{},obs=meta.hookup_site_observations||{};
  const imported=Number(obs.imported_site_records)>0?' <small>Partial Recreation.gov import: '+esc(obs.imported_site_records)+' records; E '+esc(obs.sites_with_electric_amps??'unknown')+', W '+esc(obs.sites_with_water_hookup??'unknown')+', S '+esc(obs.sites_with_sewer_hookup??'unknown')+'. Not total inventory or live availability.</small>':'';
  const note=meta.hookup_site_details||meta.hookup_summary?' <small>'+esc(meta.hookup_site_details||meta.hookup_summary)+'</small>':'';
  const inv=meta.source_published_site_inventory, invCounts=inv?.category_counts;
  const published=inv?' <small>Published NPS inventory: '+esc(inv.total_sites??'total not stated')+' total sites'+(invCounts?' · '+Object.entries(invCounts).map(([k,v])=>esc(k)+' '+esc(v)).join(', '):'')+'.</small>':'';
  const urls=meta.hookup_summary_sources||meta.hookup_source_urls||[];
  const src=(Array.isArray(urls)?urls:[]).map((url,j)=>'<a href="'+esc(url)+'" target="_blank" rel="noopener">Source '+(j+1)+'</a>').join(' ');
  return '<li><strong>'+esc(c.name||"Unnamed campground")+'</strong>: E '+flag(c.electric_hookups)+', W '+flag(c.water_hookups)+', S '+flag(c.sewer_hookups)+', D '+flag(meta.dump_station)+note+published+imported+(src?' '+src:'')+'</li>';
 }).join(''))+'</ul></details>':'<button class="npt-cat-cell-edit" data-edit="'+i+'" data-focus="hookups">'+esc(hookups(r))+'</button>';
 if(k==="summary_trailer")return parkTab()?esc(trailer(r)):'<button class="npt-cat-cell-edit" data-edit="'+i+'" data-focus="'+(active==="campsites"?'metadata.max_trailer_length_ft':'max_trailer_length_ft')+'">'+esc(trailer(r))+'</button>';
 if(k==="missing")return gapHTML(r,i);
 return esc(cell(r,k));
}
for(const k of ["national","state","units","campsites"])defs[k].cols=[["summary_name",k==="campsites"?"Site / Type":"Name / Type"],["summary_hookups","Hookups"],["summary_trailer","Max trailer"],["missing","Missing info"]];
defs.campgrounds.cols=[["summary_name","Campground / type"],["summary_park","Park / setting"],["summary_hookups","Hookups"],["summary_trailer","Max trailer"],["missing","Missing info"]];
defs.campsites.cols=[["summary_name","Site / type"],["summary_park","Campground / park"],["summary_hookups","Hookups"],["summary_trailer","Max trailer"],["missing","Missing info"]];
defs.campgrounds.cols.splice(2,0,["inventory_counts","Site counts"]);
defs.campsites.cols.splice(-1,0,["fifth_wheel","Max fifth-wheel"],["site_rate","Nightly rate"]);
defs.attractions.cols.push(["summary_park","Park"]);
for(const k of ["attractions","sources"])defs[k].cols.push(["missing","Missing info"]);
for(const key of ["national","state"])defs[key].cols=[["linked_name","Park name (state)"],["park_attractions","Attractions / must-see sites"],["inside","Campgrounds inside park"],["outside","Outside park · ≤30 road mi"],["compact_gaps","Missing info"]];
defs.campgrounds.cols=[["linked_name","Campground (state)"],["summary_park","Park / setting"],["inventory_counts","Site counts"],["rv_details","RV details"],["compact_gaps","Missing info"]];
defs.attractions.cols=[["linked_name","Attraction (state)"],["summary_park","Park"],["visit_details","Visit details"],["compact_gaps","Missing info"]];
let editFields=[],editRow=null,quickEdit=false,loadId=0;
let active="national",page=0,search="",rows=[],count=0,cache={},overlay,formOverlay,campgroundsByPark={},campgroundRows=[],campgroundRowIndex={},campgroundsLoadError="",parksById={},parkLookupError="",campgroundsById={},campgroundLookupError="";
function db(){return window.nptCloud&&window.nptCloud.db}
function el(){if($("#nptCatalogManager"))return;document.body.insertAdjacentHTML("beforeend",
 '<div class="npt-cat-backdrop" id="nptCatalogManager" hidden><section class="npt-cat-panel" role="dialog" aria-modal="true" aria-label="Catalog Manager"><header class="npt-cat-head"><div><small>ADMIN</small><h2>Catalog Manager</h2></div><button class="npt-cat-close" id="nptCatClose">Close</button></header><div class="npt-cat-toolbar"><input id="nptCatSearch" type="search" placeholder="Search this list"><button class="btn" id="nptCatSearchBtn">Search</button><button class="btn primary" id="nptCatAdd">+ Add record</button></div><nav class="npt-cat-tabs" id="nptCatTabs"></nav><div id="nptCatStatus" class="npt-cat-status" aria-live="polite"></div><div id="nptCatList"></div><footer class="npt-cat-paging"><button class="btn" id="nptCatPrev">← Previous</button><span id="nptCatPage"></span><button class="btn" id="nptCatNext">Next →</button></footer></section></div><div class="npt-cat-form-backdrop" id="nptCatFormBackdrop" hidden><section class="npt-cat-form" role="dialog" aria-modal="true" aria-label="Edit catalog record"><header><h3 id="nptCatFormTitle">Catalog record</h3><button class="npt-cat-close" id="nptCatFormClose">Close</button></header><form id="nptCatForm"><div id="nptCatFields" class="npt-cat-fields"></div><p class="npt-cat-status" id="nptCatFormStatus"></p><div class="npt-cat-form-actions"><button type="button" class="btn danger" id="nptCatDelete" hidden>Delete</button><button type="button" class="btn" id="nptCatCancel">Cancel</button><button type="submit" class="btn primary" id="nptCatSave">Save record</button></div></form></section></div>');
 overlay=$("#nptCatalogManager");formOverlay=$("#nptCatFormBackdrop");
 $("#nptCatClose").onclick=close;$("#nptCatFormClose").onclick=closeForm;$("#nptCatCancel").onclick=closeForm;
 overlay.addEventListener("click",e=>{if(e.target===overlay)close()});
 $("#nptCatSearchBtn").onclick=()=>{search=$("#nptCatSearch").value.trim();page=0;load()};
 $("#nptCatSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){search=e.target.value.trim();page=0;load()}});
 $("#nptCatAdd").onclick=()=>edit(null);
 $("#nptCatPrev").onclick=()=>{if(page){page--;load()}};
 $("#nptCatNext").onclick=()=>{if((page+1)*100<count){page++;load()}};
 $("#nptCatForm").onsubmit=save;
 $("#nptCatDelete").onclick=remove;
 renderTabs();
}
function renderTabs(){const nav=$("#nptCatTabs");nav.innerHTML=Object.keys(defs).map(k=>'<button class="npt-cat-tab'+(k===active?' active':'')+'" data-cat="'+k+'">'+esc(defs[k].title)+'</button>').join("");nav.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{active=b.dataset.cat;page=0;search="";$("#nptCatSearch").value="";renderTabs();load()})}
function status(s){$("#nptCatStatus").textContent=s||""}
async function load(){
 const request=++loadId,d=db(),cfg=defs[active];if(!d)return;
 status("Loading "+cfg.title.toLowerCase()+"…");
 let q=d.from(cfg.table).select("*",{count:"exact"}).order(cfg.search,{ascending:true}).range(page*100,page*100+99);
 if(cfg.filter)q=cfg.filter(q);
 if(search)q=q.ilike(cfg.search,"%"+search.replace(/[%_]/g,"")+"%");
 const r=await q;
 if(request!==loadId)return;
 if(r.error){status(r.error.message);$("#nptCatList").innerHTML="";return}
 rows=r.data||[];count=r.count||0;
 const pageIds=rows.map(x=>x[cfg.pk]).filter(Boolean);
 campgroundsByPark={};campgroundRows=[];campgroundRowIndex={};campgroundsLoadError="";parksById={};parkLookupError="";campgroundsById={};campgroundLookupError="";
 if(parkTab()&&pageIds.length){
  const readLinked=async(table,fields)=>{
   const data=[];
   for(let offset=0;request===loadId;offset+=500){
    const result=await d.from(table).select(fields).in("park_id",pageIds).order("name").order("id").range(offset,offset+499);
    if(result.error)return result;
    data.push(...result.data);
    if(result.data.length<500)break;
   }
   return {data};
  };
  const [linked,attractions]=await Promise.all([readLinked("npt_campgrounds","*"),compactPark()?readLinked("npt_attractions","id,park_id,name,official_url"):Promise.resolve({data:[]})]);
  if(request!==loadId)return;
  attractionsByPark={};attractionError=attractions.error?.message||"";
  for(const a of attractions.data||[])(attractionsByPark[a.park_id]||=[]).push(a);
  if(linked.error)campgroundsLoadError=linked.error.message;
  else{campgroundRows=linked.data.filter(c=>c.name!=="Dump Station");campgroundRows.forEach((c,i)=>{campgroundRowIndex[c.id]=i;(campgroundsByPark[c.park_id]||=[]).push(c)})}
 }
 if(active==="campsites"){
  const campIds=[...new Set(rows.map(x=>x.campground_id).filter(Boolean))];
  if(campIds.length){const linkedCamps=await d.from("npt_campgrounds").select("id,name,park_id,region,campground_type").in("id",campIds);if(request!==loadId)return;if(linkedCamps.error)campgroundLookupError=linkedCamps.error.message;else(linkedCamps.data||[]).forEach(c=>campgroundsById[String(c.id)]={...c,label:c.name||"Unnamed campground"})}
 }
 if(["campgrounds","attractions","campsites"].includes(active)){
  const parkIds=[...new Set((active==="campsites"?Object.values(campgroundsById).map(c=>c.park_id):rows.map(x=>x.park_id)).filter(Boolean))];
  if(parkIds.length){const linkedParks=await d.from("npt_parks").select("id,name,region").in("id",parkIds);if(request!==loadId)return;if(linkedParks.error)parkLookupError=linkedParks.error.message;else(linkedParks.data||[]).forEach(p=>parksById[String(p.id)]=p)}
 }
 Object.values(campgroundsById).forEach(c=>{c.label=[c.name,parksById[String(c.park_id)]?.name].filter(Boolean).join(" · ")||"Unnamed campground"});
 const table='<div class="npt-cat-table-wrap"><table class="npt-cat-table'+(compactPark()||["campgrounds","attractions"].includes(active)?' npt-cat-compact':'')+'"><thead><tr>'+cfg.cols.map(c=>'<th>'+esc(c[1])+'</th>').join("")+'<th>Edit</th></tr></thead><tbody>'+rows.map((row,i)=>'<tr'+(parkTab()?' class="npt-cat-park-row"':'')+'>'+cfg.cols.map(c=>'<td>'+summaryCell(row,c[0],i)+'</td>').join("")+'<td><button class="btn" data-edit="'+i+'">Edit</button></td></tr>').join("")+'</tbody></table></div>';
 $("#nptCatList").innerHTML=count?table:'<div class="npt-cat-empty">No records found.</div>';
 $("#nptCatList").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>edit(rows[Number(b.dataset.edit)],b.dataset.focus));
 $("#nptCatList").querySelectorAll("[data-camp-edit]").forEach(b=>{b.onclick=()=>{const record=campgroundRows[Number(b.dataset.campEdit)];if(!record)return;active="campgrounds";renderTabs();edit(record,b.dataset.focus)}});
 $("#nptCatList").querySelectorAll("[data-add-campground]").forEach(b=>{b.onclick=()=>{const park=rows[Number(b.dataset.addCampground)];if(!park)return;active="campgrounds";renderTabs();edit(null,null,{park_id:park.id,country:park.country||"US",region:park.region||""})}});
 $("#nptCatPage").textContent=count?((page*100+1)+"–"+Math.min((page+1)*100,count)+" of "+count):"0 records";
 $("#nptCatPrev").disabled=page===0;$("#nptCatNext").disabled=(page+1)*100>=count;
 status("");
}
function cell(row,key){let v=row[key];if(key==="park_id"||key==="campground_id"){return v?((cache[key]||{})[v]||v):""}if(Array.isArray(v))return v.join(", ");if(v&&typeof v==="object")return JSON.stringify(v);if(typeof v==="boolean")return v?"Yes":"No";return v==null?"":v}
async function relations(table){if(cache["table:"+table])return cache["table:"+table];let all=[],start=0;while(true){const r=await db().from(table).select(table==="npt_parks"?"id,name,region":"id,name,region").order("name").range(start,start+499);if(r.error)throw r.error;all=all.concat(r.data||[]);if(!r.data||r.data.length<500)break;start+=500}const opts=all.map(x=>({value:x.id,label:[x.name,x.region].filter(Boolean).join(" · ")}));cache["table:"+table]=opts;const map={};opts.forEach(x=>map[x.value]=x.label);const fk=table==="npt_parks"?"park_id":"campground_id";cache[fk]=map;return opts}
function inputHTML(f,v){
 const key=f[0],label=f[1],type=f[2],required=f[3],extra=f[4];let value=v;
 if(value==null)value="";
 if(type==="boolean")return '<label class="npt-cat-field"><span>'+esc(label)+'</span><select id="catf-'+key+'"><option value="">Unknown</option><option value="true" '+(value===true?'selected':'')+'>Yes</option><option value="false" '+(value===false?'selected':'')+'>No</option></select></label>';
 if(type==="select")return '<label class="npt-cat-field"><span>'+esc(label)+'</span><select id="catf-'+key+'" '+(required?'required':'')+'>'+(!required?'<option value="" '+(!value?'selected':'')+'>Unknown / choose…</option>':'')+extra.map(o=>'<option value="'+esc(o)+'" '+(value===o?'selected':'')+'>'+esc(o.replace(/_/g," "))+'</option>').join("")+'</select></label>';
 if(type==="relation")return '<label class="npt-cat-field"><span>'+esc(label)+'</span><select id="catf-'+key+'" '+(required?'required':'')+'><option value="">Select…</option></select><small>Type to filter by name if the list is long.</small></label>';
 if(type==="json")value=JSON.stringify(value===""?(extra||{}):value,null,2);
 if(type==="array_text"||type==="array_number")value=Array.isArray(value)?value.join(", "):value;
 const tag=type==="textarea"||type==="json"?"textarea":"input",kind=type==="number"?"number":type==="url"?"url":"text";
 return '<label class="npt-cat-field"><span>'+esc(label)+'</span>'+(tag==="textarea"?'<textarea id="catf-'+key+'" '+(required?'required':'')+'>'+esc(value)+'</textarea>':'<input id="catf-'+key+'" type="'+kind+'" value="'+esc(value)+'" '+(required?'required':'')+' '+(type==="number"?'step="any"':'')+'>')+'</label>';
}
async function edit(row,focus,prefill={}){
 quickEdit=Boolean(row&&focus);editRow=row;
 const keys=focus==="hookups"?(active==="campsites"?["electric_amps","water_hookup","sewer_hookup"]:["electric_hookups","water_hookups","sewer_hookups","metadata.dump_station","metadata.electric_amps"]):[focus];
 editFields=quickEdit?keys.map(fieldDef).filter(Boolean):defs[active].fields;
 if(quickEdit)editFields=[...editFields,extraFields["metadata.detail_source_url"]];
 const cfg=defs[active];$("#nptCatFormTitle").textContent=(row?"Edit ":"Add ")+cfg.title.replace(/s$/,"");
 $("#nptCatFields").innerHTML=editFields.map(f=>inputHTML(f,row?get(row,f[0]):(get(prefill,f[0])??defaultValue(f)))).join("");
 for(const f of editFields)if(f[2]==="relation"){try{const options=await relations(f[4]);const sel=$("#catf-"+f[0]);sel.innerHTML='<option value="">Select…</option>'+options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join("");const selected=row?.[f[0]]||prefill[f[0]];if(selected)sel.value=selected;}catch(e){$("#nptCatFormStatus").textContent="Could not load linked records: "+e.message}}
 $("#nptCatDelete").hidden=!row||quickEdit;$("#nptCatFormStatus").textContent="";
 formOverlay.dataset.pk=row?row[cfg.pk]:"";formOverlay.dataset.isNew=row?"false":"true";formOverlay.hidden=false;
 if(quickEdit){$("#nptCatFormTitle").textContent=(row.name||row.site_number)+" — "+(focus==="hookups"?"Hookups":fieldDef(focus)?.[1]||"Edit");document.getElementById("catf-"+editFields[0][0])?.focus();}
}
function defaultValue(f){if(f[0]==="source_key")return"manual_admin";if(f[0]==="country")return"US";if(f[2]==="json")return f[4]||{};if(f[2]==="boolean")return null;return""}
function parseField(f){
 const key=f[0],type=f[2],raw=document.getElementById("catf-"+key).value.trim();
 if(type==="boolean")return raw===""?null:raw==="true";
 if(type==="number"){if(raw==="")return null;const n=Number(raw);if(!Number.isFinite(n)||(key.includes("length")&&n<=0))throw Error(f[1]+" must be a positive number.");return n;}
 if(type==="json"){if(!raw)return f[4]||{};return JSON.parse(raw)}
 if(type==="array_text")return raw?raw.split(",").map(x=>x.trim()).filter(Boolean):[];
 if(type==="array_number"){if(!raw)return [];const values=raw.split(",").map(x=>Number(x.trim()));if(values.some(n=>!Number.isInteger(n)||n<=0))throw Error(f[1]+" must contain positive whole numbers.");return [...new Set(values)];}
 return raw||null;
}
async function save(e){
 e.preventDefault();const cfg=defs[active],d=db(),isNew=formOverlay.dataset.isNew==="true";const out={};let latestRow=null;
 try{
  for(const f of editFields){const value=parseField(f);if(f[3]&&(value===null||value===""))throw Error(f[1]+" is required.");
   if(f[0].startsWith("metadata.")){out.metadata=out.metadata||{...(editRow?.metadata||{})};out.metadata[f[0].slice(9)]=value;}else out[f[0]]=value;
  }
  if(quickEdit){
   const latest=await d.from(cfg.table).select("*").eq(cfg.pk,formOverlay.dataset.pk).single();if(latest.error)throw latest.error;latestRow=latest.data;
   for(const f of editFields)if(JSON.stringify(get(latest.data,f[0]))!==JSON.stringify(get(editRow,f[0])))throw Error("This field changed since you opened it. Close and reopen the editor to see the latest value.");
   if(out.metadata){const edits=Object.fromEntries(editFields.filter(f=>f[0].startsWith("metadata.")).map(f=>[f[0].slice(9),out.metadata[f[0].slice(9)]]));out.metadata={...(latest.data.metadata||{}),...edits};}
  }
  if((cfg.table==="npt_campgrounds"||cfg.table==="npt_campsites"||cfg.table==="npt_attractions")&&!out.source_record_id&&isNew)out.source_record_id="admin-"+crypto.randomUUID();
  $("#nptCatSave").disabled=true;$("#nptCatFormStatus").textContent="Saving…";
  let q=isNew?d.from(cfg.table).insert(out):d.from(cfg.table).update(out).eq(cfg.pk,formOverlay.dataset.pk);
  if(quickEdit&&latestRow){for(const key of Object.keys(out)){const value=latestRow[key];q=value==null?q.is(key,null):q.eq(key,typeof value==="object"?JSON.stringify(value):value);}}
  const r=await q.select(cfg.pk);if(r.error)throw r.error;if(!r.data?.length)throw Error("No record was saved. The record may have changed or your administrator access may have expired. Reopen it and try again.");
  closeForm();cache={};await load();
 }catch(err){$("#nptCatFormStatus").textContent=err.message||String(err)}
 finally{$("#nptCatSave").disabled=false}
}
async function remove(){
 const cfg=defs[active],row=rows.find(x=>String(x[cfg.pk])===String(formOverlay.dataset.pk));if(!row)return;
 if(!confirm("Delete this catalog record? Linked campground, campsite, or attraction records may prevent deletion."))return;
 const r=await db().from(cfg.table).delete().eq(cfg.pk,row[cfg.pk]);if(r.error){$("#nptCatFormStatus").textContent=r.error.message;return}
 closeForm();cache={};await load();
}
function close(){overlay.hidden=true;closeForm();document.body.classList.remove("npt-cat-open")}
function closeForm(){if(formOverlay)formOverlay.hidden=true}
window.openNptCatalogManager=async function(){el();if(!window.nptCloud||!window.nptCloud.isCatalogAdmin()){alert("Catalog Manager is available to an authorized administrator.");return}overlay.hidden=false;document.body.classList.add("npt-cat-open");await load()};
document.addEventListener("npt-catalog-access",e=>{const b=$("#nptCatalogButton");if(b)b.hidden=!Boolean(e.detail&&e.detail.admin)});
})();
