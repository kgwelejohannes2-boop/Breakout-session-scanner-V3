import express from "express";
import dotenv from "dotenv";
dotenv.config();
const app=express(), PORT=process.env.PORT||3000;
app.use(express.json()); app.use(express.static("public"));
const symbols={
 EURUSD:{td:"EUR/USD",type:"forex",economies:["Euro Area","United States"]},GBPUSD:{td:"GBP/USD",type:"forex",economies:["United Kingdom","United States"]},USDJPY:{td:"USD/JPY",type:"forex",economies:["United States","Japan"]},USDZAR:{td:"USD/ZAR",type:"forex",economies:["United States","South Africa"]},AUDUSD:{td:"AUD/USD",type:"forex",economies:["Australia","United States"]},USDCAD:{td:"USD/CAD",type:"forex",economies:["United States","Canada"]},
 XAUUSD:{td:"XAU/USD",type:"metal",economies:["United States"]},XAGUSD:{td:"XAG/USD",type:"metal",economies:["United States"]},
 US30:{td:"DJI",type:"index",economies:["United States"]},NAS100:{td:"NDX",type:"index",economies:["United States"]},SPX500:{td:"SPX",type:"index",economies:["United States"]},GER40:{td:"DAX",type:"index",economies:["Germany","Euro Area"]},UK100:{td:"FTSE",type:"index",economies:["United Kingdom"]}
};
async function candles(symbol,interval="15min",outputsize=500){
 const u=new URL("https://api.twelvedata.com/time_series");
 Object.entries({symbol,interval,outputsize:String(outputsize),timezone:"UTC",apikey:process.env.TWELVE_DATA_API_KEY}).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u),d=await r.json(); if(!r.ok||d.status==="error") throw Error(d.message||"Market data error");
 return (d.values||[]).map(x=>({time:x.datetime,open:+x.open,high:+x.high,low:+x.low,close:+x.close})).reverse();
}
const mins=t=>{const m=t.match(/(\d{2}):(\d{2})/);return m?+m[1]*60 + +m[2]:0};
function sessionLevel(day,from,to){const x=day.filter(c=>{const m=mins(c.time);return m>=from&&m<to});return x.length?{high:Math.max(...x.map(c=>c.high)),low:Math.min(...x.map(c=>c.low))}:null}
function pipSize(pair,type){if(type!=="forex")return 1; return pair.includes("JPY")?0.01:0.0001}
function round(pair,type,n){if(n==null)return null;if(type==="index"||type==="metal")return +n.toFixed(2);return +n.toFixed(pair.includes("JPY")?3:5)}
function eventSession(date){const h=new Date(date.endsWith("Z")?date:date+"Z").getUTCHours(); if(h<8)return "Asian"; if(h<13.5)return "London"; if(h<21)return "New York"; return "Asian"}
function baselineScores(pair){
 const base={Asian:1,London:1,"New York":1};
 if(/JPY|AUD/.test(pair))base.Asian+=2;
 if(/EUR|GBP|GER40|UK100/.test(pair))base.London+=2;
 if(/USD|US30|NAS100|SPX500|XAUUSD|XAGUSD|CAD/.test(pair))base["New York"]+=2;
 return base;
}
async function economicContext(pair,meta,date){
 const scores=baselineScores(pair), events=[]; let source="Instrument/session profile";
 if(process.env.TRADING_ECONOMICS_API_KEY){
  try{
   const countries=meta.economies.map(x=>encodeURIComponent(x.toLowerCase())).join(",");
   const u=`https://api.tradingeconomics.com/calendar/country/${countries}/${date}/${date}?c=${encodeURIComponent(process.env.TRADING_ECONOMICS_API_KEY)}`;
   const r=await fetch(u),d=await r.json(); if(!r.ok||!Array.isArray(d))throw Error("Calendar request failed");
   for(const e of d){
    const importance=Math.max(1,Math.min(3,+e.Importance||1)), session=eventSession(e.Date);
    scores[session]+=importance*2;
    if(importance>=2)events.push({time:(e.Date||"").slice(11,16)+" UTC",country:e.Country,event:e.Event,importance,session});
   }
   source="Live Trading Economics calendar + instrument/session profile";
  }catch{source="Instrument/session profile (calendar feed unavailable)"}
 }
 const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
 return {bestSession:ranked[0][0],ratings:Object.fromEntries(ranked.map(([k,v])=>[k,v>=7?"HIGH":v>=4?"MEDIUM":"LOW"])),scores,events:events.slice(0,8),source};
}
function analyze(pair,meta,c){
 const dates=[...new Set(c.map(x=>x.time.slice(0,10)))].reverse(); let chosen=null;
 for(const date of dates){const day=c.filter(x=>x.time.startsWith(date));const asian=sessionLevel(day,0,8);if(asian&&day.some(x=>mins(x.time)>=8)){chosen={date,day,asian};break}}
 if(!chosen)throw Error("Not enough completed session data yet");
 const {date,day,asian}=chosen; const london=sessionLevel(day,8,16); const ny=sessionLevel(day,13*60+30,21*60);
 const postAsian=day.filter(x=>mins(x.time)>=8); const latest=postAsian.at(-1)||day.at(-1); let signal="WAIT",breakout=null;
 for(const x of postAsian){if(x.close>asian.high){signal="BUY";breakout=x;break}if(x.close<asian.low){signal="SELL";breakout=x;break}}
 const type=meta.type, pip=pipSize(pair,type), tpDist=(type==="forex"?5:20)*pip, slDist=(type==="forex"?2:10)*pip;
 const entry=breakout?.close??latest.close, dir=signal==="BUY"?1:signal==="SELL"?-1:0;
 const sl=dir?entry-dir*slDist:null,tp1=dir?entry+dir*tpDist:null;
 const reasons=signal==="WAIT"?["No candle has closed outside the Asian session range yet."]:[`${signal} confirmed by a candle close ${signal==="BUY"?"above Asian resistance":"below Asian support"}.`,type==="forex"?"Forex rule: TP 5 pips / SL 2 pips.":"Indices/metals rule: TP 20 points / SL 10 points."];
 return {pair,type,date,signal,entry:round(pair,type,entry),sl:round(pair,type,sl),tp1:round(pair,type,tp1),sessions:{asian:{high:round(pair,type,asian.high),low:round(pair,type,asian.low)},london:london?{high:round(pair,type,london.high),low:round(pair,type,london.low)}:null,newYork:ny?{high:round(pair,type,ny.high),low:round(pair,type,ny.low)}:null},reasons,candles:day.slice(-96)};
}
app.get("/api/scan",async(req,res)=>{try{
 if(!process.env.TWELVE_DATA_API_KEY)throw Error("Add TWELVE_DATA_API_KEY to Render/environment first");
 const pair=(req.query.pair||"EURUSD").toUpperCase(),meta=symbols[pair];if(!meta)throw Error("Unsupported instrument");
 const c=await candles(meta.td); if(c.length<50)throw Error("Not enough market data returned");
 const result=analyze(pair,meta,c); result.economic=await economicContext(pair,meta,result.date); result.reasons.push(`Preferred session: ${result.economic.bestSession} (${result.economic.source}).`); res.json(result);
}catch(e){res.status(500).json({error:e.message})}});
app.listen(PORT,()=>console.log(`Session Breakout Scanner V2: http://localhost:${PORT}`));
