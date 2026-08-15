import React,{useMemo,useState}from"react";
import{createRoot}from"react-dom/client";
import{Home,Search,MessageCircle,ShieldCheck,AlertTriangle,Navigation,Camera,Building2,Users,IndianRupee,CheckCircle2,Mic,MapPin,FileText,ChevronRight,Menu,X,Languages,ArrowLeft,Calculator,Filter,Heart,Phone,Info,BarChart3}from"lucide-react";
import listingData from"../basera-housing-120.json";
import"./styles.css";
import axios from "axios";

const LOCATION_COORDS = {
  "saravanampatti": { lat: 11.0848, lng: 76.9897 },
  "sidco industrial estate": { lat: 11.0168, lng: 76.9558 },
  "gandhipuram": { lat: 11.0184, lng: 76.9655 },
  "peelamedu": { lat: 11.0129, lng: 76.9422 },
  "kurumbapalayam": { lat: 11.0805, lng: 77.0098 },
  "ganapathy": { lat: 11.0286, lng: 76.9619 },
  "kovaipudur": { lat: 11.0017, lng: 76.9536 },
  "singanallur": { lat: 11.0284, lng: 76.9415 },
  "ukkadam": { lat: 10.9985, lng: 76.9586 },
  "kalapatti": { lat: 10.9457, lng: 76.9749 },
  "saibaba colony": { lat: 11.0224, lng: 76.9491 },
  "default": { lat: 11.0168, lng: 76.9558 }
};

const normalizeLocation = value => String(value || "").toLowerCase().replace(/[^a-z ]/g, "").trim();
const getLocationCoords = value => {
  const key = normalizeLocation(value);
  return LOCATION_COORDS[key] || LOCATION_COORDS.default;
};
const haversineKm = (a, b) => {
  const toRad = deg => deg * (Math.PI / 180);
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Number((2 * R * Math.asin(Math.sqrt(x))).toFixed(1));
};
const getApproxDistanceKm = (home, workplace) => {
  const homeRegion = home.location || home.area || "SIDCO Industrial Estate";
  const targetRegion = workplace && workplace.trim() ? workplace : "SIDCO Industrial Estate";
  const homeCoords = getLocationCoords(homeRegion);
  const targetCoords = getLocationCoords(targetRegion);
  const baseKm = haversineKm(homeCoords, targetCoords);
  const commuteMinutes = Number(home.commute ?? home.commuteMinutes ?? 0);
  const commuteProxy = commuteMinutes > 0 ? Number((commuteMinutes / 18).toFixed(1)) : baseKm;
  return Number(Math.max(1, Math.min(baseKm || commuteProxy, Math.max(baseKm, commuteProxy))).toFixed(1));
};

const homes = Array.isArray(listingData) ? listingData.map((h,index)=>({
  id:h.id ?? index + 1,
  name:h.name || `Basera Housing ${index + 1}`,
  area:h.location || h.area || "Basera Community",
  location:h.location || h.area || "Basera Community",
  rent:Number(h.rent) || 0,
  avg:Number(h.avgRent ?? h.rent ?? 0),
  distance:Number(h.distance ?? (h.commuteMinutes ? Number((h.commuteMinutes / 30).toFixed(1)) : 1)),
  commute:Number(h.commuteMinutes ?? 20),
  safety:Number(h.safetyScore ?? 80),
  clean:Number(h.cleanScore ?? Math.min(99, Math.max(60, ((h.water ? 1 : 0) + (h.bathroom ? 1 : 0) + (h.kitchen ? 1 : 0)) * 33 + (h.verified ? 8 : 0)))),
  beds:Number(h.beds ?? 1),
  verified:Boolean(h.verified),
  owner:h.contact ? "Owner" : "Basera",
  type:h.roomType || "Shared Room",
  deposit:Number(h.deposit ?? Math.max(2000, Math.round((Number(h.rent) || 0) * 1.2)))
})) : [];
const fair=h=>Math.round(Math.max(0,100-Math.abs(h.rent-h.avg)/h.avg*100));
const risk=h=>!h.verified?"MEDIUM":h.rent<h.avg*.7?"HIGH":"LOW";
const getConvenienceScore=(home,budget,maxCommute,people)=>{
  const rentScore = Math.max(0, 100 - (Math.abs(home.rent - budget) / Math.max(budget, 1)) * 100);
  const commuteScore = Math.max(0, 100 - (Math.max(0, home.commute - maxCommute) / Math.max(maxCommute, 1)) * 100);
  const roomScore = home.beds >= people ? 100 : Math.max(0, 100 - ((people - home.beds) * 25));
  return Math.round((rentScore * 0.45) + (commuteScore * 0.35) + (roomScore * 0.1) + (home.safety * 0.1));
};

function Badge({children}){return <span className="badge">{children}</span>}
function Score({v,label}){return <div className="score"><b>{v}</b><small>{label}</small></div>}
function Back({go,to}){return <button className="back" onClick={()=>go(to)}><ArrowLeft/> Back</button>}

function HomeCard({h,onOpen,onFav,fav,work,budget}){
 const estKm = getApproxDistanceKm(h, work);
 const budgetGap = budget ? h.rent - budget : 0;
 const budgetLabel = budget ? (budgetGap <= 0 ? `₹${Math.abs(budgetGap).toLocaleString()} under max` : `₹${Math.abs(budgetGap).toLocaleString()} over max`) : "Budget not set";
 const commuteDisplay = Number(h.commute ?? 0) > 0 ? `${h.commute} min` : `${Math.max(5, Math.round(estKm * 8))} min`;
 return <article className="homeCard">
  <div className="photo"><div><Badge>{h.verified?"✓ VERIFIED":"⚠ VERIFY"}</Badge><button className="heart" onClick={()=>onFav(h.id)}>{fav?<Heart fill="currentColor"/>:<Heart/>}</button></div><b>{h.name}</b></div>
  <div className="cardBody"><div className="titleRow"><h3>{h.name}</h3><span className={"risk "+risk(h).toLowerCase()}>{risk(h)} RISK</span></div>
  <p className="muted"><MapPin/> {h.area}</p><div className="rent"><b>₹{h.rent.toLocaleString()}</b><span>/month · ₹{h.deposit.toLocaleString()} deposit</span></div>
  <div className="mini budgetMeta"><b>{budgetLabel}</b></div>
  <div className="scores"><Score v={fair(h)} label="FAIR"/><Score v={h.safety} label="SAFE"/><Score v={h.clean} label="CLEAN"/><Score v={commuteDisplay} label="COMMUTE"/></div>
  <div className="mini"><Navigation/> {commuteDisplay} to workplace · {estKm} km · {h.beds} beds · {h.type}</div>
  <button className="primary full" onClick={()=>onOpen(h)}>View details</button></div>
 </article>
}

function App(){
 const[page,setPage]=useState("home"),[budget,setBudget]=useState(5000),[work,setWork]=useState("SIDCO Industrial Estate"),[people,setPeople]=useState(1),[sort,setSort]=useState("match"),[filters,setFilters]=useState({verified:false,maxCommute:30}),[selected,setSelected]=useState(homes[0]),[favs,setFavs]=useState([]),[lang,setLang]=useState("English"),[menu,setMenu]=useState(false),[chat,setChat]=useState(""),[messages,setMessages]=useState([{from:"bot",text:"Hi! I’m Basera. Tell me your workplace, budget and number of people."}]),[complaint,setComplaint]=useState({type:"Broken drain / toilet",location:"",photo:false}),[submitted,setSubmitted]=useState(false),[share,setShare]=useState(2);
 const go=p=>{setPage(p);setMenu(false);scrollTo(0,0)};
 const matches=useMemo(()=>{
  const q=(work||"").toLowerCase().trim();
  const maxCommute = Number(filters.maxCommute || 30);

  let locationMatches = homes;
  if(q){
    locationMatches = homes.filter(h=>{
      const hay=((h.area||"")+" "+(h.name||"")+" "+(h.location||"")).toLowerCase();
      return hay.includes(q);
    });
  }

  const exactMatches = locationMatches.filter(h=>h.rent<=budget && h.commute<=maxCommute && (!filters.verified || h.verified));
  const relaxedBudgetMatches = locationMatches.filter(h=>h.rent<=Math.round(budget*1.2) && h.commute<=maxCommute && (!filters.verified || h.verified));
  const candidates = exactMatches.length ? exactMatches : relaxedBudgetMatches.length ? relaxedBudgetMatches : locationMatches.filter(h=>h.commute<=maxCommute && (!filters.verified || h.verified));

  return candidates.sort((a,b)=>{
    if(sort==="rent") return a.rent-b.rent;
    if(sort==="commute") return a.commute-b.commute;
    return getConvenienceScore(b, budget, maxCommute, people) - getConvenienceScore(a, budget, maxCommute, people);
  });
 },[work,budget,filters,sort,people]);

 const budgetCompare = useMemo(()=>{
  if(!matches.length) return { avgNearby: 0, maxNearby: 0, minNearby: 0, remaining: budget };
  const rents = matches.map(h=>h.rent);
  const avgNearby = Math.round(rents.reduce((s,v)=>s+v,0)/rents.length);
  const maxNearby = Math.max(...rents);
  const minNearby = Math.min(...rents);
  const remaining = Math.max(0, budget - avgNearby);
  return { avgNearby, maxNearby, minNearby, remaining };
 },[matches,budget]);

 const avgRent = homes.length ? Math.round(homes.reduce((sum,h)=>sum + (Number(h.rent) || 0),0) / homes.length) : 0;
const avgCommute = homes.length ? Math.round(homes.reduce((sum,h)=>sum + (Number(h.commute) || 0),0) / homes.length) : 0;
const avgSplit = Math.round(avgRent / 2);
const verifiedCount = homes.filter(h=>h.verified).length;
const sanitationRate = homes.length ? Math.round((homes.filter(h=>h.clean>=80).length / homes.length) * 100) : 0;

const featureMetrics = [
  { title: "Housing Search", value: `${homes.length} homes`, detail: "Live listings from Basera dataset" },
  { title: "Fair Rent", value: `₹${avgRent.toLocaleString()}`, detail: "Approx average monthly rent" },
  { title: "Rent + Commute", value: `${avgCommute} min avg`, detail: "Approx travel to work" },
  { title: "Rent Split", value: `₹${avgSplit.toLocaleString()}`, detail: "Avg per-person share" },
  { title: "Scam Check", value: `${verifiedCount}/${homes.length}`, detail: "Verified listings" },
  { title: "Sanitation", value: `${sanitationRate}%`, detail: "Healthy sanitation score" }
 ];
const send = async () => {
  if(!chat.trim()) return;

  const q = chat.trim();
  setMessages(m => [...m, { from: "user", text: q }]);
  setChat("");

  try {
    const response = await axios.post('/api/chat', { message: q });
    const reply = response?.data?.reply || "I’m not sure yet. Please try a housing question like budget, location, or a shared room.";
    setMessages(m => [...m, { from: "bot", text: reply }]);

    if (response?.data?.filters?.location) {
      setWork(response.data.filters.location);
    }

    if (response?.data?.filters?.maxBudget) {
      setBudget(response.data.filters.maxBudget);
    }

    if (response?.data?.filters?.people) {
      setPeople(response.data.filters.people);
    }

    if (response?.data?.count > 0) {
      setPage("results");
    }
  } catch (error) {
    console.error('Chat request failed:', error);
    setMessages(m => [...m, { from: "bot", text: "Basera AI is temporarily unavailable. Please try again with a clearer housing question." }]);
  }
};

const sendMatchesToWhatsApp = async (phone) => {
  try {
    const top = matches.slice(0,5).map((h,i)=>`${i+1}. ${h.name} · ₹${h.rent} · ${h.commute}m · ${h.area}`).join('\n');
    const message = `BASERA matches near ${work} under ₹${budget}:\n\n${top}`;

    const resp = await axios.post('/api/send-whatsapp', { to: phone, message });

    alert('Message sent: ' + (resp.data?.success ? 'OK' : 'Failed'));
  } catch (err) {
    console.error(err);
    alert('Failed to send WhatsApp message. Check server logs and .env config.');
  }
};
 const open=h=>{setSelected(h);go("detail")};

 return <div>
 <header><div className="nav"><div className="brand" onClick={()=>go("home")}><div className="logo"><Home/></div><strong>BASERA</strong><span>Shelter, Made Fair</span></div>
 <div className="desktopNav"><button onClick={()=>go("search")}>Find Housing</button><button onClick={()=>go("chat")}>AI / WhatsApp</button><button onClick={()=>go("complaint")}>Report</button><button onClick={()=>go("dashboard")}>NGO Dashboard</button><button onClick={()=>setLang(lang==="English"?"தமிழ்":"English")}><Languages/> {lang}</button></div>
 <button className="hamb" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></header>
 {menu&&<div className="mobileMenu"><button onClick={()=>go("search")}>Find Housing</button><button onClick={()=>go("chat")}>AI / WhatsApp</button><button onClick={()=>go("complaint")}>Sanitation Report</button><button onClick={()=>go("dashboard")}>NGO Dashboard</button></div>}

 <main>
 {page==="home"&&<>
  <section className="hero"><div><Badge>AI + WHATSAPP FIRST</Badge><h1>A fair home.<br/><em>Closer to work.</em></h1><p>Basera helps migrant workers find affordable, safer housing while connecting rent, commute, sanitation and shared living.</p><div className="actions"><button className="yellow" onClick={()=>go("chat")}><MessageCircle/>Ask Basera</button><button className="ghost" onClick={()=>go("search")}><Search/>Find a room</button></div><div className="trust">✓ Fair rent · ✓ Commute match · ✓ Scam protection · ✓ Complaint tracking</div></div>
  <div className="chatPreview"><div className="chatTop"><MessageCircle/> BASERA ASSISTANT <span>● Online</span></div><div className="bubble">Need a room near your workplace?</div><div className="bubble user">₹4000, 2 people, near factory</div><div className="bubble">I found 4 fair matches. Want to compare rent?</div><button onClick={()=>go("chat")}>Continue <ChevronRight/></button></div></section>
  <section className="section"><Badge>CORE FEATURES</Badge><h2>One housing system, not just listings.</h2><div className="featureGrid">{featureMetrics.map(({title,value,detail})=>{ const iconMap = {"Housing Search":Search,"Fair Rent":Calculator,"Rent + Commute":Navigation,"Rent Split":Users,"Scam Check":ShieldCheck,"Sanitation":AlertTriangle}; const Icon = iconMap[title] || Search; return <div className="feature" key={title}><Icon/><h3>{title}</h3><b>{value}</b><p>{detail}</p></div>; })}</div></section>
  <section className="flow"><div><Badge>BASERA FLOW</Badge><h2>Search → Compare → Share → Stay → Report</h2><p>Built around the worker's real journey.</p></div><button className="primary" onClick={()=>go("search")}>Start housing search <ChevronRight/></button></section>
 </>}

 {page==="search"&&<> <Back go={go} to="home"/><Badge>HOUSING SEARCH</Badge><h1>Find a home that fits your life.</h1><div className="searchBox"><label>WORKPLACE<input value={work} onChange={e=>setWork(e.target.value)}/></label><label>MAX RENT<div className="range"><input type="range" min="2500" max="7000" step="100" value={budget} onChange={e=>setBudget(+e.target.value)}/><b>₹{budget.toLocaleString()}</b></div></label><label>COMMUTE PREFERENCE<select value={filters.maxCommute} onChange={e=>setFilters(f=>({...f,maxCommute:+e.target.value}))}><option value="30">Any commute ≤30 min</option><option value="20">Comfort ≤20 min</option><option value="15">Very convenient ≤15 min</option><option value="10">Strict ≤10 min</option></select></label><label>PEOPLE<select value={people} onChange={e=>setPeople(+e.target.value)}>{[1,2,3,4].map(x=><option key={x}>{x}</option>)}</select></label><button className="primary" onClick={()=>go("results")}>Search <Search/></button></div><div className="quickFilters"><Badge>Fair rent</Badge><Badge>Verified</Badge><Badge>≤ {filters.maxCommute} min</Badge><Badge>Shared rooms</Badge></div><div className="how"><Info/><span>Basera now ranks homes by what feels convenient for the worker: monthly rent, travel time to work, and room fit for the chosen people count.</span></div></>}

 {page==="results"&&<><Back go={go} to="search"/><div className="resultHead"><div><Badge>SMART MATCHES</Badge><h1>Homes near {work}</h1><p className="muted">{matches.length} homes · under ₹{budget.toLocaleString()} · {people} person{people>1?"s":""} · commute ≤ {filters.maxCommute} min</p></div><select value={sort} onChange={e=>setSort(e.target.value)}><option value="match">Best convenience</option><option value="rent">Lowest rent</option><option value="commute">Shortest commute</option></select></div><div className="filterbar"><button onClick={()=>setFilters(f=>({...f,verified:!f.verified}))}><ShieldCheck/> Verified only {filters.verified?"✓":""}</button><select value={filters.maxCommute} onChange={e=>setFilters(f=>({...f,maxCommute:+e.target.value}))}><option value="30">Any commute ≤30 min</option><option value="20">Comfort ≤20 min</option><option value="15">≤15 min</option><option value="10">≤10 min</option></select><span><Filter/> {matches.length} matches</span></div><div className="how"><Info/><span>Exact commute check: results only include homes within your selected commute limit of {filters.maxCommute} minutes. Budget is used as a secondary filter, with the same commute rule always kept strict.</span></div><div className="homeGrid">{matches.map(h=><HomeCard h={h} key={h.id} work={work} budget={budget} fav={favs.includes(h.id)} onFav={id=>setFavs(f=>f.includes(id)?f.filter(x=>x!==id):[...f,id])} onOpen={open}/>)}</div></>}

 {page==="detail"&&<><Back go={go} to="results"/><div className="detail"><div className="propertyImage"><Badge>{selected.verified?"✓ VERIFIED OWNER":"⚠ VERIFY OWNER"}</Badge><h2>{selected.name}</h2><p>{selected.area}</p></div><div className="panel"><div className="titleRow"><div><Badge>SMART MATCH</Badge><h1>{selected.name}</h1></div><b className="match">{getConvenienceScore(selected, budget, Number(filters.maxCommute || 30), people)}%</b></div><p><MapPin/> {selected.area}</p><div className="priceBig">₹{selected.rent.toLocaleString()} <small>/ month</small></div><div className="fair"><div><b>Worker convenience</b><span>{selected.commute <= filters.maxCommute ? "Fits your commute preference" : `Above your preferred ${filters.maxCommute} min`}</span></div><strong>{selected.rent<=budget?"✓ WITHIN BUDGET":"⚠ ABOVE TARGET"}<small>{selected.rent<=budget ? "Affordable for your budget" : `₹${(selected.rent-budget).toLocaleString()} over target`}</small></strong></div><div className="scores"><Score v={fair(selected)} label="FAIR RENT"/><Score v={selected.safety} label="SAFETY"/><Score v={selected.clean} label="CLEAN"/><Score v={selected.commute+"m"} label="COMMUTE"/></div><div className="facts"><span><Navigation/> {selected.commute} min commute</span><span><Users/> {selected.beds} beds</span><span><IndianRupee/> ₹{selected.deposit.toLocaleString()} deposit</span><span><ShieldCheck/> Scam risk: {risk(selected)}</span></div><div className="owner"><div className="avatar">{selected.owner[0]}</div><div><b>{selected.owner}</b><small>{selected.verified?"Verified owner":"Verification pending"}</small></div><button><Phone/></button></div><button className="primary full" onClick={()=>go("split")}><Users/> Check rent split</button><button className="outline full" onClick={()=>go("complaint")}>Report housing problem</button></div></div></>}

 {page==="split"&&<><Back go={go} to="detail"/><Badge>RENT SPLIT</Badge><h1>Split the rent fairly.</h1><div className="splitGrid"><div className="panel"><h2>{selected.name}</h2><p>Choose how many people share this room.</p><div className="people">{[1,2,3,4].map(n=><button className={share===n?"selected":""} onClick={()=>setShare(n)} key={n}>{n}<small>person{n>1?"s":""}</small></button>)}</div><div className="calculator"><span>Total monthly rent</span><b>₹{selected.rent.toLocaleString()}</b><span>Per person</span><b>₹{Math.ceil(selected.rent/share).toLocaleString()}</b><span>Deposit / person</span><b>₹{Math.ceil(selected.deposit/share).toLocaleString()}</b></div><div className="mini"><Info/> {selected.commute <= filters.maxCommute ? "Comfortable for your daily travel." : "This commute is longer than your preferred limit, so it may feel tiring."}</div><button className="primary full" onClick={()=>go("agreement")}><FileText/> Create sharing template</button></div><div className="panel"><Calculator/><h2>Why this matters</h2><p>Basera makes the split visible before workers agree to share a room.</p><div className="tip">✓ Everyone sees the same rent<br/>✓ Beds are visible<br/>✓ Deposit is transparent<br/>✓ Travel burden is considered before signing</div></div></div></>}

 {page==="agreement"&&<><Back go={go} to="split"/><div className="document"><Badge>SHARING TEMPLATE</Badge><h1>Room-sharing agreement</h1><p className="muted">Prototype template — not a legal document.</p><div className="paper"><h2>Basera Room Sharing</h2><p><b>Property:</b> {selected.name}</p><p><b>Location:</b> {selected.area}</p><p><b>Total rent:</b> ₹{selected.rent.toLocaleString()} / month</p><p><b>People:</b> {share}</p><p><b>Rent per person:</b> ₹{Math.ceil(selected.rent/share).toLocaleString()}</p><p><b>Deposit per person:</b> ₹{Math.ceil(selected.deposit/share).toLocaleString()}</p><hr/><h3>Shared responsibilities</h3><p>□ Rent payment responsibility</p><p>□ Shared-space cleanliness</p><p>□ Visitors and noise</p><p>□ Notice and move-out understanding</p><hr/><div className="sign"><span>Worker signature</span><span>Owner signature</span></div></div><button className="outline"><FileText/> Download / Print template</button></div></>}

 {page==="chat"&&<><Back go={go} to="home"/><div className="chatLayout"><div><Badge>AI + WHATSAPP</Badge><h1>Describe your housing need.</h1><p className="muted">The prototype converts a natural-language request into search preferences.</p><div className="example"><b>Try:</b><br/>“I need a room near SIDCO, ₹4000, 2 people, within 15 minutes.”</div><button className="outline"><Mic/> Voice request</button></div><div className="chatBox"><div className="chatHeader"><MessageCircle/> Basera Assistant <span>● Online</span></div><div className="messages">{messages.map((m,i)=><div className={"msg "+m.from} key={i}>{m.text}</div>)}</div><div className="chatInput"><input value={chat} onChange={e=>setChat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Type your request..."/><button onClick={send}><ChevronRight/></button></div><button className="primary full chatSearch" onClick={()=>go("results")}>Show matching homes</button></div></div></>}

 {page==="complaint"&&<><Back go={go} to="home"/><div className="complaintGrid"><div className="panel"><Badge>SANITATION TRACKER</Badge><h1>Report a housing problem.</h1>{submitted?<div className="success"><CheckCircle2/><h2>Complaint submitted</h2><p><b>BAS-2026-0148</b></p><div className="steps">{["Submitted","Assigned","In progress","Resolved"].map((x,i)=><span className={i===0?"active":""} key={x}>{x}</span>)}</div><button className="outline" onClick={()=>setSubmitted(false)}>Create another</button></div>:<><label>PROBLEM<select value={complaint.type} onChange={e=>setComplaint({...complaint,type:e.target.value})}><option>Broken drain / toilet</option><option>Water problem</option><option>Waste / garbage</option><option>Unsafe room</option><option>Other</option></select></label><div className="upload" onClick={()=>setComplaint({...complaint,photo:true})}>{complaint.photo?<><CheckCircle2/><b>Photo attached</b></>:<><Camera/><b>Add photo evidence</b><small>Tap to simulate camera/upload</small></>}</div><label>LOCATION<input value={complaint.location} onChange={e=>setComplaint({...complaint,location:e.target.value})} placeholder="Enter housing location"/></label><button className="primary full" onClick={()=>setSubmitted(true)}>Submit & track complaint</button></>}</div><div className="panel"><AlertTriangle/><h2>How it works</h2><p>1. Report issue with photo + location.</p><p>2. NGO / municipal queue receives it.</p><p>3. Team assigns and updates status.</p><p>4. Worker tracks resolution.</p></div></div></>}

 {page==="dashboard"&&<><Badge>NGO / CITY DASHBOARD</Badge><h1>Housing intelligence.</h1><p className="muted">Pilot view for worker housing, rent pressure, commute and sanitation.</p><div className="stats">{[["1,284","Workers reached"],["327","Housing matches"],["₹3,900","Avg listed rent"],["86","Complaints"],["62","Resolved"],["72%","Resolution rate"]].map(([n,l])=><div className="stat" key={l}><b>{n}</b><span>{l}</span></div>)}</div><div className="dashGrid"><div className="panel"><h2><BarChart3/> Rent pressure</h2>{[["SIDCO Industrial Estate",82],["Kurumbapalayam",68],["Peelamedu",54],["Saravanampatti",47]].map(([x,v])=><div className="bar" key={x}><span>{x}</span><b>{v}%</b></div>)}</div><div className="panel"><h2><AlertTriangle/> Sanitation queue</h2><p><b>86</b> reported · <b>24</b> open · <b>62</b> resolved</p><button className="outline full" onClick={()=>go("complaint")}>Open complaint tracker</button></div></div></>}
 </main>
 <footer>BASERA · Shelter, Made Fair · V3 Hackathon Prototype</footer>
<nav className="bottom"><button onClick={()=>go("home")}><Home/>Home</button><button onClick={()=>go("chat")}><MessageCircle/>AI</button><button onClick={()=>go("search")}><Search/>Find</button><button onClick={()=>go("complaint")}><AlertTriangle/>Report</button><button onClick={()=>go("dashboard")}><Building2/>NGO</button><button onClick={()=>{const phone=prompt('Enter phone number with country code (e.g. 919900112233):'); if(phone) sendMatchesToWhatsApp(phone);}}>WhatsApp</button></nav>
 </div>
}
createRoot(document.getElementById("root")).render(<App/>);
