const http=require('http'),fs=require('fs'),path=require('path');
const puppeteer=require('/home/gem/.npm-global/lib/node_modules/puppeteer-core');
const DIST=path.resolve('dist'); const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(DIST,p);fs.readFile(fp,(e,d)=>{if(e){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});res.end(d);});});
const seedRef={id:'demo-r77',citeKey:'selenyx2026',type:'journalArticle',title:'Selenyx 科研工作台：开源 BYOK 研究工具',shortTitle:'S',abstract:'abs',creators:[{firstName:'Xu',lastName:'Yabo',creatorType:'author'}],publication:'JNR',volume:'12',issue:'3',pages:'1-9',publisher:'',place:'',year:'2026',date:'2026-08-06',accessionDate:'2026-08-06',doi:'10.1/x',isbn:'',issn:'',pmid:'',pmcid:'',arxivId:'',url:'',uri:'',collections:[],tags:[],language:'zh',rights:'',attachments:[],annotations:[],notes:'',impactFactor:3.2,jcrQuartile:'Q2',openAccess:true,pageCharge:null,reviewWeeks:8,pipelineStage:'reading',readStatus:'reading',importance:4,createdAt:'2026-08-06T00:00:00Z',updatedAt:'2026-08-06T00:00:00Z',source:'manual'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
srv.listen(4175,'127.0.0.1',async()=>{
  let b;try{
    b=await puppeteer.launch({executablePath:'/usr/bin/chromium-browser',headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
    const pg=await b.newPage();await pg.setViewport({width:1440,height:900});
    await pg.goto('http://127.0.0.1:4175/',{waitUntil:'domcontentloaded'});
    await pg.evaluate(r=>{const c=JSON.parse(localStorage.getItem('selenyx-v2')||'{"state":{},"version":2}');c.state=c.state||{};c.state.references=[r];c.state.theme='paper-green';c.state.mode='light';c.state.density='comfortable';c.version=2;localStorage.setItem('selenyx-v2',JSON.stringify(c));},seedRef);
    await pg.reload({waitUntil:'networkidle0'});await sleep(800);
    // dump: body text snippet, count refs table rows, nav items
    const info=await pg.evaluate(()=>{
      const navs=Array.from(document.querySelectorAll('button,a,li,[role="button"]')).map(e=>e.textContent.trim()).filter(t=>t&&t.length<20);
      const hasSelenyx=document.body.textContent.includes('Selenyx');
      const rows=document.querySelectorAll('tr,[role="row"]').length;
      const getfull=Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.includes('获取全文')).length;
      return {hasSelenyx,rows,getfull,navsSample:navs.slice(0,25)};
    });
    console.log('INFO',JSON.stringify(info));
    await pg.screenshot({path:'/home/gem/.aily/workdir/task_7669744666866224081/artifacts/diag-after-load.png'});
  }catch(e){console.error('ERR',e.message)}finally{if(b)await b.close();srv.close();process.exit(0)}
});
