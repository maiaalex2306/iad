'use strict';
/* Host EXCLUSIVO de LinkedIN Leads. O restante do IaD CRM permanece web.
   Duas vistas nativas nesta funcionalidade, sem injeção ou coleta de sessão. */
const {app,BaseWindow,WebContentsView,Menu,session,shell}=require('electron');
const {CRM_ORIGIN,LINKEDIN_START,LINKEDIN_LOGIN,LINKEDIN_LEADS_ROUTE,allowedLinkedIn,allowedCrm,isFeatureRoute,newLoginPartition,splitBounds}=require('./security.cjs');
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
  // Sessão LinkedIn totalmente nova a cada abertura, sem reaproveitar cookies.
  const linkedinPartition=newLoginPartition();
  const linkedinSession=session.fromPartition(linkedinPartition,{cache:false});
  if(linkedinSession.isPersistent())throw new Error('Sessão LinkedIn não pode ser persistente');
  linkedin=newView(linkedinPartition,'linkedin');
  win.contentView.addChildView(crm);
  win.contentView.addChildView(linkedin);
  linkedinSession.setPermissionRequestHandler((_wc,_permission,respond)=>respond(false));
  linkedinSession.setPermissionCheckHandler(()=>false);
  let resettingLogin=false;
  async function freshLogin(){
    if(resettingLogin||!linkedin||linkedin.webContents.isDestroyed())return;
    resettingLogin=true;
    try{
      // O usuário digita usuário, senha e MFA no domínio real do LinkedIn.
      // Nunca enviar credenciais para o painel, nem reutilizar sessão anterior.
      linkedin.webContents.stop();
      await linkedinSession.clearStorageData({
        storages:['cookies','localstorage','indexdb','serviceworkers','cachestorage']
      });
      await linkedinSession.clearCache();
      await linkedin.webContents.loadURL(LINKEDIN_LOGIN);
    }catch(e){
      console.error('Falha ao abrir login oficial do LinkedIn:',String(e?.message||e));
    }finally{resettingLogin=false;}
  }
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
      {label:'Voltar ao IaD CRM web',click:async()=>{
        // A saída encerra as duas WebContentsView; o CRM geral segue no browser.
        await shell.openExternal(CRM_ORIGIN+'/#/hoje');
        if(win&&!win.isDestroyed())win.close();
      }},
      {type:'separator'},{role:'quit'}
    ]},
    {label:'LinkedIn',submenu:[
      {label:'Novo login (limpar sessão)',click:()=>void freshLogin()},
      {label:'Feed',click:()=>linkedin.webContents.loadURL(LINKEDIN_START)},
      {label:'Atualizar',click:()=>linkedin.webContents.reload()},
      {label:'Voltar',click:()=>{
        const h=linkedin.webContents.navigationHistory;
        if(h.canGoBack())h.goBack();
      }},
      {type:'separator'},
      {label:'Sair e exigir novo login',click:()=>void freshLogin()}
    ]},
    {label:'Visualização',submenu:[{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'},{role:'togglefullscreen'}]}
  ]));
  crm.webContents.loadURL(LINKEDIN_LEADS_ROUTE).catch(e=>console.error('Campanha LinkedIN Leads:',e.message));
  void freshLogin(); // Primeira tela do painel direito: usuário e senha no linkedin.com.
}
app.whenReady().then(()=>{
  app.on('web-contents-created',(_event,contents)=>{
    contents.on('will-attach-webview',event=>event.preventDefault());
  });
  createWindow();
  app.on('activate',()=>{if(!win)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
