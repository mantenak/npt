/* Pure planning calculations, shared by the website and regression checks. */
(function(root){
'use strict';
const pt=x=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite)?x:null;
function miles(a,b){if(!pt(a)||!pt(b))return Infinity;const r=Math.PI/180,dlat=(b[0]-a[0])*r,dlon=(b[1]-a[1])*r;return 3958.76*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dlon/2)**2)));}
const point=p=>[Number(p.latitude),Number(p.longitude)];
function chooseParks(parks,start,end,days,hours,distance=250,preferStateParks=false){
 hours=hours||Math.max(1,distance/45);
 const max=Math.min(12,Math.max(1,Math.floor((days-1)/3))),budget=Math.max(hours,days*hours*.45),chosen=[];let current=start,spent=0;
 const remaining=parks.filter(p=>p.latitude!=null&&p.longitude!=null&&miles(start,point(p))<days*hours*30);
 while(chosen.length<max){
  const feasible=remaining.filter(p=>!chosen.includes(p)).map(p=>({p,d:miles(current,point(p))*1.3/45,back:miles(point(p),end)*1.3/45})).filter(x=>x.d<=hours*1.5&&x.d*45<=distance*1.5&&spent+x.d+x.back<=budget);
  const parkBias=p=>p.designation==='state_park'&&(p.metadata?.must_see===true||p.metadata?.trip_priority==='must_see'||p.metadata?.priority==='must_see')?-4:preferStateParks&&p.designation==='state_park'?-1.2:p.designation==='state_park'?1.2:0;
  feasible.sort((a,b)=>(a.d+a.back*.12+Math.max(0,a.d*45-distance)/30+parkBias(a.p))-(b.d+b.back*.12+Math.max(0,b.d*45-distance)/30+parkBias(b.p)));
  if(!feasible.length)break;
  const x=feasible[0];chosen.push(x.p);spent+=x.d;current=point(x.p);
 }
 return chosen;
}
function fit(c,vehicle){
 const trailer=['fifthWheel','trailer','travelTrailer'].includes(vehicle.type),length=Number(vehicle.rvLength)||0;
 if(vehicle.type==='car')return {ok:true,unknown:false,label:'Confirm tent-site availability'};
 const allowed=trailer?c.trailer_allowed:c.rv_allowed,limit=Number(trailer?c.max_trailer_length_ft:c.max_rv_length_ft)||null;
 if(allowed===false||limit&&length>limit)return {ok:false,unknown:false,label:'Does not fit selected equipment'};
 const unknown=!length||allowed==null||limit==null;
 return {ok:true,unknown,label:unknown?'Equipment fit needs confirmation':`Reported limit ${limit} ft — confirm individual site`};
}
const hookups=c=>c?.legacyHookups?c.legacyHookups:!c?'Not selected':c.electric_hookups===true&&c.water_hookups===true&&c.sewer_hookups===true?'Full hookups':c.electric_hookups===true?'Electric; water/sewer not confirmed':c.electric_hookups===false?'No electric hookups':'Hookups unknown';
function fromTrip(trip){
 const stops=(trip.segments||[]).map((seg,i)=>{
  const cg=(trip.campgrounds||[]).find(c=>c.name===seg.campground),point=pt(seg.mapPoint)||pt(cg?.mapPoint);
  if(!point)throw Error('Stop '+(i+1)+' needs map coordinates before itinerary editing.');
  const days=(trip.days||[]).filter(d=>String(d.segmentNumber)===String(seg.sequence));
  const activities=[...new Set(days.flatMap(d=>d.activities||[]).filter(a=>typeof a==='string'))].map((name,j)=>({id:'saved-'+i+'-'+j,name}));
  return {park:{id:seg.catalogParkId||null,name:seg.park||seg.location||seg.campground,region:seg.location,latitude:point[0],longitude:point[1]},nights:Number(seg.nights)||days.length||1,
   campground:seg.campground?{id:cg?.catalogId||null,name:seg.campground,region:seg.location,latitude:point[0],longitude:point[1],rv_allowed:cg?.rvAllowed,trailer_allowed:cg?.trailerAllowed,max_rv_length_ft:cg?.maxRVFeet,max_trailer_length_ft:cg?.maxTrailerFeet,reservation_url:cg?.bookingURL,official_url:cg?.officialURL,reservation_notes:cg?.reservationNotes,legacy:cg||{name:seg.campground},legacyHookups:seg.hookups||cg?.hookups}:null,
   activities,options:activities,notes:seg.notes||'',legacySegment:seg,legacyDays:days};
 });
 if(!stops.length)throw Error('This trip has no route stops to edit.');
 return {version:2,legacyRoutingUnchanged:true,legacyTrip:JSON.parse(JSON.stringify(trip)),basics:{name:trip.name,date:trip.startDate||'',days:trip.length,start:{name:trip.startLocation,point:pt(trip.preferences?.mapStart)||[stops[0].park.latitude,stops[0].park.longitude]},end:{name:trip.endLocation,point:pt(trip.preferences?.mapEnd)||[stops.at(-1).park.latitude,stops.at(-1).park.longitude]},vehicle:trip.vehicle||{type:'car'},distance:trip.preferences?.preferredDriveMiles||250,hours:trip.preferences?.maxDriveHours||null},stops,route:null};
}
function buildTrip(model){
 const {basics,stops}=model;let dayNumber=1;const days=[],segments=[],campgrounds=[];let pendingActivities=[];
 stops.forEach((s,i)=>{
  const seq=i+1,c=s.campground,leg=model.route?.legs?.[i]||(model.legacyRoutingUnchanged&&s.legacySegment?.driveMiles!=null?{distance:s.legacySegment.driveMiles*1609.344,duration:(s.legacySegment.driveMinutes||0)*60}:null),activities=s.activities||[];
  const mapPoint=c&&c.latitude!=null&&c.longitude!=null?point(c):point(s.park);
  const cg=c?.name||'',loc=c?.region||s.park.region||'',h=hookups(c),prev=i?stops[i-1].campground?.name||stops[i-1].park.name:basics.start.name;
  const notes=[s.notes,!c&&!s.attractionOnly&&!s.addressOnly?'Choose a campground before booking.':c?fit(c,basics.vehicle).label:null,'Reservations and security incidents have not been verified.'].filter(Boolean).join(' ');
  segments.push({...s.legacySegment,sequence:seq,park:s.park.name,location:loc,campground:cg,hookups:h,nights:s.nights,mapPoint,driveFrom:prev,driveTo:cg||s.park.name,driveMiles:leg?Math.round(leg.distance/1609.344):null,driveMinutes:leg?Math.round(leg.duration/60):null,notes,nightlyCost:s.nightlyCost??null,costCurrency:s.costCurrency||"USD",stayCost:s.nightlyCost==null?null:s.nightlyCost*s.nights,catalogParkId:s.park.id,catalogCampgroundId:c?.id||null});
  if(s.nights===0){pendingActivities.push(...activities.map(a=>a.name));}
  for(let n=0;n<s.nights;n++){const planned=s.legacyDays?.length===s.nights&&JSON.stringify(activities.map(a=>a.name))===JSON.stringify([...new Set(s.legacyDays.flatMap(d=>d.activities||[]))])?s.legacyDays[n].activities:activities.filter((a,j)=>j%s.nights===n).map(a=>a.name);days.push({...s.legacyDays?.[n],dayNumber:dayNumber++,segmentNumber:seq,park:s.park.name,location:loc,campground:cg,hookups:h,activities:n===0?[...pendingActivities,...planned]:(planned||[]),driveFrom:n===0?prev:'',driveTo:n===0?cg||s.park.name:'',driveMiles:n===0&&leg?Math.round(leg.distance/1609.344):null,driveMinutes:n===0&&leg?Math.round(leg.duration/60):null,notes:[s.legacyDays?.[n]?.notes,notes].filter(Boolean).join(" ")});if(n===0)pendingActivities=[];}
  if(c&&!campgrounds.some(x=>c.id?x.catalogId===c.id:x.name===c.name))campgrounds.push({...c.legacy,catalogId:c.id,name:c.name,park:s.park.name,location:loc,hookups:h,mapPoint,bookingURL:c.reservation_url||c.official_url,officialURL:c.official_url,maxRVFeet:c.max_rv_length_ft,maxTrailerFeet:c.max_trailer_length_ft,reservationNotes:c.reservation_notes||'Check the official booking page for dates and availability.',reserved:c.legacy?.reserved||false,availabilityStatus:c.legacy?.availabilityStatus||'Unverified'});
 });
 if(pendingActivities.length&&days.length)days.at(-1).activities=[...(days.at(-1).activities||[]),...pendingActivities];
 const oldLast=model.legacyTrip?.days?.at(-1),last=model.route?.legs?.at(-1)||(model.legacyRoutingUnchanged&&oldLast?.driveMiles!=null?{distance:oldLast.driveMiles*1609.344,duration:(oldLast.driveMinutes||0)*60}:null);days.push({...model.legacyTrip?.days?.at(-1),dayNumber:dayNumber++,park:'Travel to '+basics.end.name,location:basics.end.name,campground:'',activities:model.legacyTrip?.days?.at(-1)?.activities||[],driveFrom:stops.at(-1)?.campground?.name||stops.at(-1)?.park.name||basics.start.name,driveTo:basics.end.name,driveMiles:last?Math.round(last.distance/1609.344):null,driveMinutes:last?Math.round(last.duration/60):null,notes:'Driving estimates do not validate RV clearances or road restrictions.'});
 return {...model.legacyTrip,name:basics.name||'My National Park Trip',startDate:basics.date,length:days.length,startLocation:basics.start.name,endLocation:basics.end.name,vehicle:basics.vehicle,parks:stops.map(s=>s.park.name),days,segments,campgrounds,privacy:'private',preferences:{...model.legacyTrip?.preferences,campground:'Park campgrounds and established chains',maxDriveHours:basics.hours,pace:'Balanced',preferredDriveMiles:basics.distance,mapStart:basics.start.point,mapEnd:basics.end.point,planner:JSON.parse(JSON.stringify(model))}};
}
const api={miles,point,chooseParks,fit,hookups,buildTrip,fromTrip};root.NptPlannerCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);


