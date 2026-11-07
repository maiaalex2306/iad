'use strict';
/* Host EXCLUSIVO de LinkedIN Leads. O restante do IaD CRM permanece web.
   Duas vistas nativas nesta funcionalidade, sem injeção ou coleta de sessão. */
const {app,BaseWindow,WebContentsView,Menu,session}=require('electron');
const os=require('node:os');
const {LINKEDIN_START,LINKEDIN_LEADS_ROUTE,allowedLinkedIn,allowedCrm,isFeatureRoute,profilePartition,splitBounds}=require('./security.cjs');
const linkedinPartition=profilePartition(process.env.IAD_LINKEDIN_LOCAL_PROFILE||os.userInfo().username);
let win=null,crm=null,linkedin=null;
function navigationPolicy(contents,which){
  const allowed=which==='crm'?allowedCrm:allowedLinkedIn;
  contents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault()});
  contents.on('will-redirect',(event,url)=>{if(!allowed(url))event.preventDefault()});
  contents.setWindowOpenHandler(({url})=>{
    const target=allowedLinkedIn(url)?linkedin:allowedCrm(url)?crm:null;
    if(target&&!target.webContents.isDestroyed()){
      /* Direciona window.open do CRM para a vista nativa existente. */
      setImmediate(()=>target.webContents.loadURL(url).catch(()=>{}));
    }
    return {action:'deny'};
  });
}
function newView(partition,kind){
  const view=new WebContentsView({webPreferences:{
    partition,contextIsolation:true,sandbox:true,nodeIntegration:false,
    webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,
    devTools:process.env.IAD_DESKTOP_DEVTOOLS==='1'
  }});
  view.setBackgroundColor('#fff');
  navigationPolicy(view.webContents,kind);
  return view;
}
function createWindow(){
  win=new BaseWindow({width:1480,height:900,minWidth:980,minHeight:600,show:true,
    title:'LinkedIN Leads — IaD CRM',backgroundColor:'#f5f7fc'});
  crm=newView('persist:iadcrm-linkedin-panel','crm');
  // Sem transformar o CRM inteiro em desktop: a vista esquerda permanece
  // vinculada exclusivamente à rota LinkedIN Leads.
  let redirecting=false;
  crm.webContents.on('did-navigate-in-page',(_event,url)=>{
    if(isFeatureRoute(url)||redirecting||!allowedCrm(url))return;
    redirecting=true;
    setImmediate(()=>{
      if(!crm||crm.webContents.isDestroyed()){redirecting=false;return;}
      crm.webContents.loadURL(LINKEDIN_LEADS_ROUTE)
        .catch(()=>{})
        .finally(()=>{redirecting=false;});
    });
  });
  linkedin=newView(linkedinPartition,'linkedin');
  win.contentView.addChildView(crm);
  win.contentView.addChildView(linkedin);
  const linkedinSession=session.fromPartition(linkedinPartition);
  linkedinSession.setPermissionRequestHandler((_wc,_permission,respond)=>respond(false));
  linkedinSession.setPermissionCheckHandler(()=>false);
  function resize(){
    if(!win||win.isDestroyed())return;
    const [width,height]=win.getContentSize();
    const rects=splitBounds(width,height);
    crm.setBounds(rects.crm);linkedin.setBounds(rects.linkedin);
  }
  win.on('resize',resize);
  win.on('maximize',resize);
  win.on('unmaximize',resize);
  win.on('closed',()=>{
    if(crm&&!crm.webContents.isDestroyed())crm.webContents.close();
    if(linkedin&&!linkedin.webContents.isDestroyed())linkedin.webContents.close();
    win=null;crm=null;linkedin=null;
  });
  resize();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'LinkedIN Leads',submenu:[
      {label:'Voltar à campanha',click:()=>crm.webContents.loadURL(LINKEDIN_LEADS_ROUTE)},
      {label:'Atualizar campanha',click:()=>crm.webContents.reload()},
      {type:'separator'},{role:'quit'}
    ]},
    {label:'LinkedIn',submenu:[
      {label:'Login',click:()=>linkedin.webContents.loadURL('https://www.linkedin.com/login')},
      {label:'Feed',click:()=>linkedin.webContents.loadURL(LINKEDIN_START)},
      {label:'Atualizar',click:()=>linkedin.webContents.reload()},
      {label:'Voltar',click:()=>{
        const h=linkedin.webContents.navigationHistory;
        if(h.canGoBack())h.goBack();
      }},
      {type:'separator'},
      {label:'Sair da conta LinkedIn neste computador',click:async()=>{
        await linkedinSession.clearStorageData({storages:['cookies','localstorage','indexdb','serviceworkers']});
        await linkedin.webContents.loadURL('https://www.linkedin.com/login');
      }}
    ]},
    {label:'Visualização',submenu:[{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'},{role:'togglefullscreen'}]}
  ]));
  crm.webContents.loadURL(LINKEDIN_LEADS_ROUTE).catch(e=>console.error('Campanha LinkedIN Leads:',e.message));
  linkedin.webContents.loadURL(LINKEDIN_START).catch(e=>console.error('LinkedIn:',e.message));
}
app.whenReady().then(()=>{
  app.on('web-contents-created',(_event,contents)=>{
    contents.on('will-attach-webview',event=>event.preventDefault());
  });
  createWindow();
  app.on('activate',()=>{if(!win)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
