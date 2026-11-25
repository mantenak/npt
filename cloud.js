/* NPT Cloud integration. Supabase publishable key only; no privileged credentials. */
(function () {
  "use strict";
  const URL = "https://asyrsvgdiloleodlzrfu.supabase.co";
  const PUBLISHABLE = "sb_publishable_Tg6CG7QshaxswXB2izvqSA_XZlmezSx";
  const db = window.supabase && window.supabase.createClient(URL, PUBLISHABLE);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  function cityLabel(address) {
    const parts=String(address||'').split(',').map(part=>part.trim()).filter(Boolean);
    const region=/^(?:[A-Z]{2}|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Ontario|Prince Edward Island|Quebec|Saskatchewan|Northwest Territories|Nunavut|Yukon)(?:\s+\d{5}(?:-\d{4})?|\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d)?$/i;
    const street=/^(?:\d|p\.?\s*o\.?\s+box\b)/i;
    for(let i=parts.length-1;i>0;i--){
      if(/^(?:US|USA|CA|Canada|United States(?: of America)?)$/i.test(parts[i])&&i===parts.length-1&&i>1&&region.test(parts[i-1]))continue;
      if(!region.test(parts[i])||street.test(parts[i-1]))continue;
      return parts[i-1]+', '+parts[i].replace(/\s+(?:\d{5}(?:-\d{4})?|[A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i,'');
    }
    return parts.length===1&&!street.test(parts[0])?parts[0]:'Location unavailable';
  }
  const clean = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let user = null, mine = [], publicTrips = [], loaded = false, lastViewed = null, catalogAdmin = false;
  const oldStartWizard = window.startWizard;
  const oldShowTrip = window.showTrip;
  const oldShowHome = window.showHome;
  let tripHome = "public";
  let pending = null;
  function remember(action) {
    pending=action;
    try { if(action) sessionStorage.setItem("npt-next-action",JSON.stringify(action)); else sessionStorage.removeItem("npt-next-action"); } catch {}
  }
  try { pending=JSON.parse(sessionStorage.getItem("npt-next-action")); } catch {}
  function homeMode(mode) {
    tripHome=mode;
    $("#myTrips").hidden=mode!=="mine";
    $("#publicSection").hidden=mode!=="public";
    oldShowHome();
  }
  window.showHome=()=>{window.closeNptWalk?.(); if($("#publicSection"))homeMode(tripHome);else oldShowHome();};
  function gated(type,id) {
    if(!user){remember({type,id});showAuth();return;}
    if(type==="mine"){window.closeNptWalk?.();homeMode("mine");}
    if(type==="new") window.startWizard();
  }
  async function resumeAction(){
    if(!user||!pending) return;
    const action=pending;
    remember(null);
    if(action.type!=="copy"){gated(action.type);return;}
    const {data,error}=await db.from("npt_trips").select("*").eq("id",action.id).eq("visibility","public").maybeSingle();
    if(error||!data){message("This trip is no longer available to copy.");return;}
    await window.copySharedTrip(tripFromRow(data));
  }
  function message(s) { const el = $("#cloudStatus"); if(el) el.textContent = s || ""; }
  function displayError(e) { message(e && e.message ? e.message : String(e)); }
  const currentRoot = () => location.origin + location.pathname;
  function tripFromRow(r) {
    return {
      id:r.id, name:r.name, startDate:r.start_date || "", length:r.length_days,
      startLocation:r.start_location || "", endLocation:r.end_location || "",
      parks:Array.isArray(r.parks)?r.parks:[], vehicle:r.vehicle || {},
      preferences:r.preferences || {}, days:Array.isArray(r.itinerary)?r.itinerary:[],
      segments:Array.isArray(r.route_segments)?r.route_segments:[],
      campgrounds:Array.isArray(r.campgrounds)?r.campgrounds:[],
      privacy:r.visibility || "private", allowCopy:r.allow_copy !== false,
      restorationStatus: r.source_label === "Swift NPT restored draft",
      importedFromSwift:r.source_label === "Swift NPT restored draft",
      updatedAt:r.updated_at,
      __remote:true
    };
  }
  function payload(t, visibility) {
    return {
      name: t.name,
      start_date: t.startDate || null,
      length_days: Math.min(366, Math.max(1, Number(t.length) || 1)),
      start_location: t.startLocation || "",
      end_location: t.endLocation || t.startLocation || "",
      vehicle: t.vehicle || {},
      preferences: {...(t.preferences || {}), travelers: t.travelers || 2},
      parks: Array.isArray(t.parks) ? t.parks : [],
      itinerary: Array.isArray(t.days) ? t.days : [],
      route_segments: Array.isArray(t.segments) ? t.segments : [],
      campgrounds: Array.isArray(t.campgrounds) ? t.campgrounds : [],
      visibility: visibility || "private",
      allow_copy: t.allowCopy !== false,
      source_label: t.importedFromSwift || t.restorationStatus ? "Swift NPT restored draft" : null,
      updated_at: new Date().toISOString()
    };
  }
  function parseVisibility(v) { return v === "public" ? "public" : v === "link" || v === "unlisted" ? "unlisted" : "private"; }
  function createDialog() {
    const st = document.createElement("style");
    st.textContent = `
      .authback{position:fixed;inset:0;background:#091e17bb;z-index:200;display:none;align-items:center;justify-content:center;padding:16px}
      .authback.open{display:flex}.authpane{width:min(430px,100%);padding:25px;background:#fffdf8;border-radius:17px;box-shadow:0 18px 60px #0004}
      .authpane h3{margin:0 0 6px;font-size:23px}.authpane p{font-size:13px;color:#65736c;margin:0 0 14px}
      .authpane label{font-size:12px;font-weight:700;display:block;margin-bottom:5px}
      .authpane input{width:100%;border:1px solid #bfc9c3;border-radius:9px;padding:11px;margin-bottom:12px}
      .authpane .controls{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
      .authpane .feedback{font-size:12px;color:#204c39;min-height:20px;margin-top:10px}
      .accountbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:#e7f0e9;border-radius:11px;margin-top:12px;color:#224b39;font-size:13px}
      .publiclist{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .localbackups{background:#fff5df;border:1px solid #ead6a4;border-radius:13px;padding:13px;margin-top:15px;font-size:13px}
      .localbackups button{margin-top:8px}.localcard{padding:8px 0;border-bottom:1px solid #e5dabc;display:flex;justify-content:space-between;gap:7px;align-items:center}
      @media(max-width:700px){.publiclist{grid-template-columns:1fr}.localcard{display:block}.accountbar{display:block}}
    `;
    document.head.appendChild(st);
    document.body.insertAdjacentHTML("beforeend", `<div class="authback" id="nptAuth" role="dialog" aria-modal="true" aria-label="Sign in to NPT">
      <div class="authpane"><h3>Sign in to National Park Trip</h3>
      <p>Explore public trips for free. Sign in only when you want to create, copy, or save a trip.</p>
      <form id="nptSignInForm">
        <label for="nptEmail">Email address</label><input id="nptEmail" type="email" autocomplete="email" required placeholder="you@example.com"/>
        <div class="controls"><button class="btn" type="button" id="nptCancelAuth">Cancel</button><button class="btn primary" id="nptSendLink" type="submit">Email me a sign-in link</button></div>
      </form><div class="feedback" id="nptAuthFeedback" aria-live="polite"></div>
      </div></div>`);
    const accountButton=document.createElement("button");
    accountButton.type="button";
    accountButton.className="topbtn";
    accountButton.id="nptAccountBtn";
    accountButton.textContent="Sign In";
    $(".topactions").append(accountButton);
    $("#nptMyTrips").onclick=()=>gated("mine");
    $("#nptNewTrip").onclick=()=>gated("new");
    if($("#nptCatalogButton"))$("#nptCatalogButton").onclick=()=>window.openNptCatalogManager?.();
    $(".npt-brand").onclick=()=>{window.closeNptWalk?.();homeMode("public");};
    const home = $("#home");
    home.insertAdjacentHTML("beforeend", `<div class="accountbar"><span id="cloudStatus">Loading NPT...</span></div>
    <div class="section" id="publicSection"><div class="npt-home-brand"><img src="./npt-home-banner.webp" alt="A winding road through evergreen forest toward mountain peaks" fetchpriority="high"></div><div class="sectionhead"><div><h3>Explore Public Trips</h3><p>Anyone can view these trips without signing in</p></div><button class="btn" id="refreshPublicTrips">Refresh</button></div><div id="nptPublicList" class="publiclist"><div class="empty">Checking for public trips...</div></div></div>`);
    $("#myTrips").hidden=true;
    $("#nptCancelAuth").onclick = ()=>{remember(null);hideAuth();};
    $("#nptAuth").addEventListener("click", e => { if(e.target.id === "nptAuth") hideAuth(); });
    $("#nptSignInForm").addEventListener("submit", requestLogin);
    accountButton.onclick = async () => {
      if(!user){remember(null);showAuth();return;}
      if(!confirm("Sign out from your NPT account on this device?")) return;
      const {error} = await db.auth.signOut();
      if(error) displayError(error); else {user=null;mine=[];updateUI();window.showHome();}
    };
    $("#refreshPublicTrips").onclick = refreshPublic;
    // The original browser-backup import button is now gated behind sign-in.
    const oldImport = $("#importTripBtn"); const importButton = oldImport.cloneNode(true); oldImport.replaceWith(importButton); importButton.onclick = () => { if(!user)return showAuth("import"); $("#nptImportFile").click(); };
    $("#importBtn").onclick = () => {
      const url = prompt("Paste a public or unlisted NPT trip link:");
      if(!url)return;
      try { const u = new globalThis.URL(url); if(u.origin !== location.origin || u.pathname !== location.pathname) throw Error();
        location.hash = u.hash; viewHash();
      } catch { alert("Please use a link for this NPT website."); }
    };
    // Public is available now. Invite-only requires separate ACL work and is not selectable yet.
    const privacy = $(".privacy");
    privacy.innerHTML = `<label class="privacyopt"><input name="privacy" type="radio" value="private" checked><div><strong>Private (recommended)</strong><small>Only you can access this trip after signing in.</small></div></label>
      <label class="privacyopt"><input name="privacy" type="radio" value="unlisted"><div><strong>Anyone with a link</strong><small>Not listed publicly; you can revoke access by making it private.</small></div></label>
      <label class="privacyopt"><input name="privacy" type="radio" value="public"><div><strong>Public — listed in Explore Trips</strong><small>Anyone can browse this itinerary without an account.</small></div></label>
      <label class="privacyopt"><input name="privacy" type="radio" value="invited" disabled><div><strong>Specific invited people (coming later)</strong><small>View/edit invitations will be added after the core account system is tested.</small></div></label>`;
    $("#inviteWarning").textContent = "Before making a trip public or shareable, remove personal addresses, reservation numbers, and anything you don't want others to see. Private is the default.";
  }
  function showAuth(intent) {
    const modal=$("#nptAuth"); if(!modal) return alert("Sign-in has not loaded. Refresh the page.");
    $("#nptAuthFeedback").textContent = intent === "import" ? "Sign in first, then choose Import Existing NPT Trip." : "";
    modal.classList.add("open");$("#nptEmail").focus();
  }
  function hideAuth() {$("#nptAuth").classList.remove("open");}
  async function requestLogin(e) {
    e.preventDefault(); if(!db) return;
    const email=$("#nptEmail").value.trim();
    if(!email)return;
    const btn=$("#nptSendLink");
    btn.disabled=true;$("#nptAuthFeedback").textContent="Sending a one-time sign-in link...";
    try {
      const {error} = await db.auth.signInWithOtp({email,options:{emailRedirectTo:currentRoot(),shouldCreateUser:true}});
      if(error)throw error;
      $("#nptAuthFeedback").textContent="Check your inbox. Open the sign-in link on this device to finish signing in.";
    }catch(error){$("#nptAuthFeedback").textContent=/not authorized/i.test(error.message||"") ? "Email sign-in is currently limited to organization members. The site owner must configure custom SMTP for friends." : (error.message||"Unable to send sign-in link.");}
    finally{btn.disabled=false;}
  }
  function accountMenu() {
    if(!user)return showAuth();
    alert("Signed in as " + (user.email || "NPT user") + ". Your trips are stored in Supabase.");
  }
  async function ensureProfile() {
    if(!user)return;
    const {data,error}=await db.from("npt_profiles").select("user_id").eq("user_id",user.id).maybeSingle();
    if(error){displayError(error);return;}
    if(!data){
      const display=(user.email||"NPT traveler").split("@")[0].slice(0,80);
      const created=await db.from("npt_profiles").insert({user_id:user.id,display_name:display});
      if(created.error)displayError(created.error);
    }
  }
  async function refreshCatalogAdminAccess() {
    const button=$("#nptCatalogButton");
    if(!user){catalogAdmin=false;if(button)button.hidden=true;window.dispatchEvent(new CustomEvent("npt-catalog-access",{detail:{admin:false}}));return;}
    const {data,error}=await db.from("npt_catalog_admins").select("user_id").eq("user_id",user.id).maybeSingle();
    catalogAdmin=!error&&Boolean(data);
    if(button)button.hidden=!catalogAdmin;
    window.dispatchEvent(new CustomEvent("npt-catalog-access",{detail:{admin:catalogAdmin}}));
  }
  function updateUI() {
    if(!user && tripHome==="mine") homeMode("public");
    if(!user)catalogAdmin=false;
    const catalogButton=$("#nptCatalogButton");if(catalogButton)catalogButton.hidden=!catalogAdmin;
    $("#nptAccountBtn").textContent=user?"Sign Out":"Sign In";
    message(user ? "Signed in as "+(user.email||"NPT user")+" · your trips are saved privately in the cloud" : "Browsing as a guest · sign in when you're ready to create a trip");
    window.renderTrips();
    refreshCatalogAdminAccess().catch(()=>{catalogAdmin=false;if(catalogButton)catalogButton.hidden=true;});
  }
  async function refreshMine() {
    if(!user){mine=[];window.renderTrips();return;}
    const {data,error}=await db.from("npt_trips").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(150);
    if(error){displayError(error);return;}
    mine=(data||[]).map(tripFromRow);
    window.renderTrips();
  }
  async function refreshPublic() {
    if(!db)return;
    const {data,error}=await db.from("npt_trips").select("id,name,start_date,length_days,start_location,end_location,parks,vehicle,preferences,itinerary,route_segments,campgrounds,visibility,allow_copy").eq("visibility","public").order("created_at",{ascending:true}).limit(60);
    if(error){$("#nptPublicList").innerHTML='<div class="empty">Public trips are unavailable right now.</div>';displayError(error);return;}
    publicTrips=(data||[]).map(tripFromRow);
    const target=$("#nptPublicList");target.innerHTML="";
    if(!publicTrips.length){target.innerHTML='<div class="empty">No public trips yet. Published trips will appear here.</div>';return;}
    for(const t of publicTrips){
      const c=document.createElement("div");c.className="tripcard";
      c.innerHTML='<h4>'+clean(t.name)+'</h4><p>'+clean(cityLabel(t.startLocation))+' → '+clean(cityLabel(t.endLocation||t.startLocation))+'</p><p>'+t.length+' days · '+t.parks.length+' parks</p><div class="tripactions"><button class="btn" data-details>Details</button><button class="btn primary" data-walk>Preview Drive</button><button class="btn" data-copy>Copy Trip</button></div>';
      c.querySelector("[data-details]").onclick=()=>window.showTrip(t,false);
      const walk=c.querySelector("[data-walk]");
      walk.hidden=!t.days.length;
      walk.onclick=()=>openPublicMap(t);
      const copy=c.querySelector("[data-copy]");
      copy.hidden=!t.allowCopy;
      copy.onclick=()=>window.copySharedTrip(t);
      target.append(c);
    }
  }
  window.renderTrips = function() {
    const list=$("#tripList"); if(!list) return;
    list.innerHTML="";
    if(!user) {
      list.innerHTML='<div class="empty"><strong>Your saved trips will appear here.</strong><br>Browse public trips without signing in, or sign in to create and manage your own trips.<br><br><button class="btn primary" id="promptSignIn">Sign in</button></div>';
      $("#promptSignIn").onclick=()=>showAuth();
      return;
    }
    if(!mine.length)list.innerHTML='<div class="empty">No cloud trips yet. Create one or import your existing 2028 National Park Tour.</div>';
    const grid=document.createElement("div");grid.className="tripcards";
    for(const t of mine){
      const c=document.createElement("div");c.className="tripcard";
      c.innerHTML='<h4>'+clean(t.name)+'</h4><p>'+clean(cityLabel(t.startLocation))+' → '+clean(cityLabel(t.endLocation||t.startLocation))+' · '+t.length+' days · '+t.parks.length+' parks</p><span class="badge '+(t.privacy==="public"?"link":"")+'">'+(t.privacy==="private"?"Private":t.privacy==="unlisted"?"Link sharing":"Public")+'</span><div class="tripactions"><button class="btn primary" data-open>'+(t.days.length?"Open plan":"Open trip")+'</button><button class="btn danger" data-delete>Delete</button></div>';
      c.querySelector("[data-open]").onclick=()=>{
        window.openTrip(t.id);
        const plan = $("#detailsSection");
        if(t.days.length && plan?.getClientRects().length) plan.scrollIntoView({block:"start"});
      };
      c.querySelector("[data-delete]").onclick=()=>window.deleteTrip(t.id);
      grid.append(c);
    }
    list.append(grid);
    const originals = (()=>{try{return JSON.parse(localStorage.getItem("npt-trips")||"[]")}catch{return[]}})();
    if(originals.length){
      const holder=document.createElement("div");holder.className="localbackups";
      holder.innerHTML='<strong>'+originals.length+' older browser-only draft(s) found</strong><p>These drafts still exist in this browser. Review them and move them to your signed-in account one at a time.</p>';
      for(const t of originals){
        const row=document.createElement("div");row.className="localcard";
        const title=document.createElement("span");title.textContent=t.name||"Untitled browser draft";
        const btn=document.createElement("button");btn.className="btn";btn.textContent="Move to my account";
        btn.onclick=()=>migrateDraft(t);
        row.append(title,btn);holder.append(row);
      }
      list.append(holder);
    }
  };
  async function savePayload(t, visibility="private") {
    if(!user){showAuth();throw Error("Sign in first.");}
    const value=payload(t,visibility);
    const {data,error}=await db.from("npt_trips").insert({...value,owner_id:user.id}).select("id").single();
    if(error)throw error;
    await refreshMine();
    return data.id;
  }
  window.startWizard = function() { if(!db) return alert("NPT Cloud is unavailable."); if(!user)return showAuth();if(window.openNptPlanner)window.openNptPlanner();else oldStartWizard();};
  window.nptCloud={db,signedIn:()=>Boolean(user),currentUser:()=>user,isCatalogAdmin:()=>catalogAdmin,ownsTrip:t=>Boolean(user&&mine.some(x=>x.id===t.id)),editorSource:t=>{
      const copy=JSON.parse(JSON.stringify(t));
      for(const segment of copy.segments||[]){if(!segment.mapPoint){const match=publicTrips.flatMap(x=>x.segments||[]).find(s=>s.campground===segment.campground&&s.park===segment.park&&s.mapPoint);if(match)segment.mapPoint=match.mapPoint;}}
      const match=publicTrips.find(x=>x.startLocation===copy.startLocation&&x.endLocation===copy.endLocation);
      copy.preferences={...copy.preferences,mapStart:copy.preferences?.mapStart||match?.preferences?.mapStart,mapEnd:copy.preferences?.mapEnd||match?.preferences?.mapEnd};return copy;
    },saveProposal:async (proposal,existing)=>{
    if(!user)throw Error("Sign in before saving your trip.");
    if(!existing)return savePayload(proposal,"private");
    if(!mine.some(t=>t.id===existing.id)||!existing.updatedAt)throw Error("Reopen this trip from My Trips before editing.");
    const value=payload(proposal,existing.privacy||"private");
    const {data,error}=await db.from("npt_trips").update(value).eq("id",existing.id).eq("owner_id",user.id).eq("updated_at",existing.updatedAt).select("id").maybeSingle();
    if(error)throw error;
    if(!data)throw Error("This trip changed on another device. Reopen it from My Trips before saving.");
    await refreshMine();return data.id;
  }};
  window.saveTrip = async function() {
    if(!user){showAuth();return;}
    if($("#nextBtn"))$("#nextBtn").disabled=true;
    try{
      const t=window.collect();
      const v=parseVisibility(t.privacy);
      if(v!=="private" && !confirm("Everyone with access can see the full selected trip details, including notes and campgrounds. Continue?"))return;
      const id=await savePayload(t,v);
      window.closeWizard();window.openTrip(id);await refreshPublic();
    } catch(e) {alert("Couldn't save your trip: "+(e.message||e));}
    finally{if($("#nextBtn"))$("#nextBtn").disabled=false;}
  };
  window.openTrip = function(id) {
    const t=mine.find(t=>t.id===id);
    if(!t)return alert("This trip isn't available in your account.");
    window.showTrip(t,true);
  };
  window.deleteTrip = async function(id) {
    const t=mine.find(t=>t.id===id); if(!t||!user)return;
    if(!confirm("Permanently delete \""+t.name+"\" from your cloud account?"))return;
    const {error}=await db.from("npt_trips").delete().eq("id",id).eq("owner_id",user.id);
    if(error)return alert("Could not delete trip: "+error.message);
    await refreshMine();await refreshPublic();oldShowHome();
  };
  function openPublicMap(trip) {
    history.replaceState(null,"",location.pathname+location.search+"#public="+encodeURIComponent(trip.id)+"&view=map");
    window.openNptWalk(trip);
  }
  window.showTrip = function(t,isOwner) {
    window.closeNptWalk?.();
    lastViewed=t;
    window.nptCanEdit=()=>Boolean(isOwner&&user&&lastViewed===t);
    oldShowTrip(t,isOwner);
    $("#nptTripMapButton")?.remove();
    $("#nptEditProposal")?.remove();
    if(t.segments?.length){
      const actions=$("#viewer .viewerbar-actions")||$("#viewer .viewerbar");
      const preview=document.createElement("button");preview.className="btn primary";preview.id="nptTripMapButton";preview.textContent="Preview Drive";preview.onclick=()=>window.openNptWalk(t);actions.append(preview);
      if(isOwner){const edit=document.createElement("button");edit.className="btn";edit.id="nptEditProposal";edit.textContent="Edit trip";edit.onclick=()=>window.editNptProposal(t);actions.append(edit);}
    }
    const publicMap=t.privacy==="public"?t:isOwner?publicTrips.find(trip=>
      t.name.replace(/ — restored draft$/,"")===trip.name&&t.length===trip.length
    ):null;
    if(publicMap?.days.length&&!t.segments?.length){
      const button=document.createElement("button");
      button.id="nptTripMapButton";
      button.className="btn primary";
      button.textContent=t.privacy==="public"?"Preview Drive":"Preview public drive";
      button.onclick=()=>openPublicMap(publicMap);
      ($("#viewer .viewerbar-actions")||$("#viewer .viewerbar")).append(button);
    }
    if(!isOwner){
      $("#copyTripBtn").style.display=t.allowCopy===false?"none":"inline-block";
      $("#copyTripBtn").onclick=()=>window.copySharedTrip(t);
      $("#ownerShare").style.display="none";
      return;
    }
    const settings=$("#ownerShare .summarybox");
    settings.innerHTML = `<div><strong id="shareStatus">Manage access for this trip</strong><p id="shareExplain">Private is safest. Public trips appear in Explore. Unlisted trips can be opened using a revocable link.</p></div>
      <label for="nptTripVisibility" style="display:block;font-weight:700;margin:9px 0 5px">Visibility</label>
      <select id="nptTripVisibility" style="width:100%;padding:10px;border:1px solid #bfc9c3;border-radius:9px">
        <option value="private">Private — only me</option><option value="unlisted">Unlisted — anyone with a link</option><option value="public">Public — anyone browsing NPT</option>
      </select>
      <div class="tripactions"><button class="btn primary" id="nptSavePrivacy">Save privacy</button><button class="btn" id="shareBtn">Copy share link</button></div>
      <div class="sharebox" id="shareBox"><div class="shareline"><input id="shareUrl" readonly><button class="btn" id="copyLinkBtn">Copy</button></div><small>Making this trip private immediately disables previously issued unlisted links.</small></div>`;
    $("#nptTripVisibility").value=t.privacy;
    $("#nptSavePrivacy").onclick=()=>setPrivacy(t);
    $("#shareBtn").disabled=t.privacy==="private";
    $("#shareBtn").onclick=()=>shareTrip(t);
    $("#copyLinkBtn").onclick=()=>navigator.clipboard.writeText($("#shareUrl").value).then(()=>message("Link copied to clipboard")).catch(()=>prompt("Copy this link:",$("#shareUrl").value));
  };
  window.renderPlanEditor = function(box, trip, index) {
    if(!window.nptCanEdit?.() || !user || !trip.__remote || !mine.some(item=>item.id===trip.id) || !trip.updatedAt) return;
    const day = trip.days[index];
    const editor = document.createElement("details");
    editor.className = "dayitem";
    editor.innerHTML = `<summary>Edit day</summary>
      <form class="npt-day-edit">
        <div class="grid2">
          <label class="field">Park or route stop<input name="park" required></label>
          <label class="field">Location<input name="location"></label>
          <label class="field">Campground<input name="campground"></label>
          <label class="field">Hookups<input name="hookups"></label>
          <label class="field">Drive from<input name="driveFrom"></label>
          <label class="field">Drive to<input name="driveTo"></label>
          <label class="field">Drive miles<input name="driveMiles" type="number" min="0" step="any"></label>
          <label class="field">Activities, one per line<textarea name="activities" rows="3"></textarea></label>
        </div>
        <label class="field">Notes<textarea name="notes" rows="3"></textarea></label>
        <button class="btn primary" type="submit">Save day</button>
        <p role="status"></p>
      </form>`;
    const form=editor.querySelector("form");
    const fields=["park","location","campground","hookups","driveFrom","driveTo","driveMiles","activities","notes"];
    for(const key of fields) form.elements.namedItem(key).value=key==="activities"?(day.activities||[]).join("\n"):day[key]??"";
    form.onsubmit=async event=>{
      event.preventDefault();
      if(!user) return showAuth();
      const submit=form.querySelector("button");
      const status=form.querySelector("[role=status]");
      submit.disabled=true;
      status.textContent="Saving...";
      try {
        const changed={...day};
        for(const key of fields){
          const value=form.elements.namedItem(key).value.trim();
          changed[key]=key==="activities"?value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean):key==="driveMiles"?(value===""?null:Number(value)):value;
        }
        if(!changed.park) throw Error("Enter a park or route stop.");
        const itinerary=trip.days.map((entry,position)=>position===index?changed:entry);
        const {data,error}=await db.from("npt_trips")
          .update({itinerary,updated_at:new Date().toISOString()})
          .eq("id",trip.id).eq("owner_id",user.id).eq("updated_at",trip.updatedAt)
          .select("updated_at").maybeSingle();
        if(error) throw error;
        if(!data) throw Error("The trip changed since you opened it. Reopen it from My Trips before trying again.");
        trip.days=itinerary;
        trip.updatedAt=data.updated_at;
        await refreshMine();
        if(lastViewed===trip && box.contains(editor)){
          renderDetails();
          const saved=document.createElement("p");
          saved.setAttribute("role","status");
          saved.textContent="Day saved to your account.";
          box.append(saved);
        }
      } catch(error){
        status.textContent=error.message;
      } finally {
        submit.disabled=false;
      }
    };
    box.append(editor);
  };
  window.saveNptStay=async function(trip,changed){
    if(!window.nptCanEdit?.() || !user || !trip.updatedAt) throw Error("Open the trip under My Trips to edit a stay.");
    const {data,error}=await db.from("npt_trips")
      .update({...changed,updated_at:new Date().toISOString()})
      .eq("id",trip.id).eq("owner_id",user.id).eq("updated_at",trip.updatedAt)
      .select("updated_at").maybeSingle();
    if(error) throw error;
    if(!data) throw Error("This trip changed. Reopen it from My Trips and try again.");
    trip.updatedAt=data.updated_at;
    trip.days=changed.itinerary;
    trip.segments=changed.route_segments;
    trip.campgrounds=changed.campgrounds;
    await refreshMine();
  };
  async function setPrivacy(t) {
    if(!user)return showAuth();
    const vis=$("#nptTripVisibility").value;
    if(vis!=="private" && !confirm("This will let others view your trip's notes, schedule and campgrounds. Remove private details first. Continue?"))return;
    const b=$("#nptSavePrivacy");b.disabled=true;
    try{
      const {error}=await db.from("npt_trips").update({visibility:vis,updated_at:new Date().toISOString()}).eq("id",t.id).eq("owner_id",user.id);
      if(error)throw error;
      await refreshMine(); await refreshPublic();
      t.updatedAt=mine.find(item=>item.id===t.id)?.updatedAt||t.updatedAt;
      t.privacy=vis;
      if(document.querySelector(".npt-planner #ownerShare")){
        $("#vPrivacy").textContent=vis==="private"?"PRIVATE TRIP":vis==="public"?"PUBLIC TRIP":"SHARE LINK ENABLED";
        $("#nptTripVisibility").value=vis;
        $("#shareBtn").disabled=vis==="private";
        $("#shareStatus").textContent=vis==="private"?"This trip is private.":vis==="public"?"This trip is public.":"This trip can be shared by link.";
        $("#shareExplain").textContent=vis==="private"?"Only you can access this trip after signing in.":vis==="public"?"Anyone can browse this itinerary in Explore Trips.":"Anyone with the unlisted link can view this trip.";
      }else window.openTrip(t.id);
      message("Privacy saved: "+vis+".");
    }catch(e){alert("Privacy update failed: "+e.message);}
    finally{b.disabled=false;}
  }
  async function shareTrip(t) {
    if(t.privacy==="private")return alert("Choose Unlisted or Public and save privacy first.");
    let link;
    if(t.privacy==="public"){link=currentRoot()+"#public="+encodeURIComponent(t.id);}
    else{
      let {data,error}=await db.from("npt_trip_links").select("token").eq("trip_id",t.id).is("revoked_at",null).order("created_at",{ascending:false}).limit(1);
      if(error)return alert(error.message);
      let token=data&&data[0]&&data[0].token;
      if(!token){
        const created=await db.from("npt_trip_links").insert({trip_id:t.id,owner_id:user.id}).select("token").single();
        if(created.error)return alert(created.error.message);
        token=created.data.token;
      }
      link=currentRoot()+"#unlisted="+encodeURIComponent(token);
    }
    $("#shareBox").classList.add("show");$("#shareUrl").value=link;
    try{await navigator.clipboard.writeText(link);message("Share link copied.");}catch{}
  }
  window.copySharedTrip=async function(t) {
    if(t.allowCopy===false)return;
    if(!user){if(t.privacy==="public")remember({type:"copy",id:t.id});return showAuth();}
    try{const copy={...t,startDate:t.startDate||null,name:t.name+" (Copy)",importedFromSwift:false,restorationStatus:false};const id=await savePayload(copy,"private");tripHome="mine";window.openTrip(id);}
    catch(e){alert("Couldn't copy trip: "+e.message);}
  };
  window.importNPTFile=async function(file) {
    if(!file)return;
    if(!user){showAuth("import");return;}
    if(file.size>3_000_000)return alert("NPT import file exceeds 3 MB.");
    try{
      const p=JSON.parse(await file.text());
      if(p.format!=="npt-trip-import-v1"||!p.trip||!Array.isArray(p.trip.days)||p.trip.days.length>500||!Array.isArray(p.trip.parks))throw Error("Invalid NPT import file");
      const t={...p.trip, importedFromSwift:true, restorationStatus:true};
      if(!confirm("Import \""+t.name+"\" ("+t.days.length+" planning days) into your private cloud account?"))return;
      const id=await savePayload(t,"private");
      window.openTrip(id);
      alert("Imported safely into your private Supabase account. Review routes, campgrounds and reservations before sharing or booking.");
    }catch(e){alert("Import failed: "+e.message);}
  };
  async function migrateDraft(t) {
    if(!user)return showAuth();
    if(!confirm("Move browser-only draft \""+(t.name||"Untitled")+"\" into your NPT account? The browser copy will be removed only after cloud saving succeeds."))return;
    try{
      const id=await savePayload(t,"private");
      const originals=JSON.parse(localStorage.getItem("npt-trips")||"[]");
      localStorage.setItem("npt-trips",JSON.stringify(originals.filter(x=>x.id!==t.id)));
      window.renderTrips();window.openTrip(id);
    }catch(e){alert("Migration failed. Your browser draft is still preserved. "+e.message);}
  }
  async function viewHash() {
    const hash=location.hash;
    if(hash.startsWith("#public=")){
      const options=new URLSearchParams(hash.slice(1));
      const id=options.get("public")||"";
      if(!/^[a-f0-9-]{36}$/i.test(id))return;
      const {data,error}=await db.from("npt_trips").select("*").eq("id",id).eq("visibility","public").maybeSingle();
      if(error||!data)return alert("This public trip is unavailable or has been made private.");
      const trip=tripFromRow(data);
      if(options.get("view")==="map"&&trip.days.length)openPublicMap(trip);
      else window.showTrip(trip,false);
    }else if(hash.startsWith("#unlisted=")){
      const token=hash.slice(10);
      if(!/^[a-f0-9-]{36}$/i.test(token))return;
      try{
        const resp=await fetch(URL+"/functions/v1/npt-unlisted-read",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token}),cache:"no-store"});
        if(!resp.ok)throw Error("The link has expired, been revoked, or the trip was made private.");
        const data=await resp.json();
        const t=tripFromRow(data);window.showTrip(t,false);
      }catch(e){alert(e.message);}
    }
  }
  async function init() {
    createDialog();
    window.renderTrips();
    if(!db){message("Unable to load cloud sign-in. Refresh this page.");return;}
    db.auth.onAuthStateChange((_,session)=>{
      user=session&&session.user||null;
      if(user)hideAuth();
      updateUI();
      setTimeout(()=>{ensureProfile();refreshMine();refreshPublic();},0);
    });
    const {data,error}=await db.auth.getSession();
    if(error)displayError(error);
    user=data?.session?.user||null;
    updateUI();
    await ensureProfile();
    await Promise.all([refreshMine(),refreshPublic()]);
    await resumeAction();
    loaded=true;
    if(location.hash.startsWith("#public=")||location.hash.startsWith("#unlisted="))await viewHash();
    window.addEventListener("hashchange",viewHash);
  }
  init().catch(displayError);
})();

